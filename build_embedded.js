/**
 * build_embedded.js
 *
 * Generates self-contained HTML files for each game.
 * All assets (BrowserFS, MAME JS, WASM, ROMs) are base64-encoded
 * and embedded directly in the HTML so no sub-requests are made.
 *
 * Usage:  node build_embedded.js
 * Output: dist/acchi.html, dist/mslug3.html, dist/index.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

function b64(file) {
  const p = path.join(ROOT, file);
  console.log(`  encoding ${file} (${(fs.statSync(p).size / 1048576).toFixed(1)} MB)...`);
  return fs.readFileSync(p).toString('base64');
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

// ---------- shared HTML shells ----------

function gameShell(opts) {
  // opts: title, gameTitle, publisher, year, canvasW, canvasH,
  //       controlsHtml, footerHtml,
  //       browserfsJS, mameJS, wasmB64, romChunks (array of {name, b64}),
  //       driver, resolution
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title} — The Janken Lopez Arcades</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a12;color:#e0e0e0;font-family:monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center}

/* ====== LOADING OVERLAY (shows immediately) ====== */
#load-overlay{
  position:fixed;inset:0;z-index:9999;background:#0a0a12;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  transition:opacity .6s;
}
#load-overlay.hidden{opacity:0;pointer-events:none}
#load-overlay h1{
  font-size:clamp(1rem,3.5vw,1.8rem);color:#ffc832;text-transform:uppercase;
  text-shadow:0 0 12px rgba(255,200,50,.6);letter-spacing:.08em;margin-bottom:2rem;text-align:center;padding:0 1rem;
}
#load-overlay .sub{font-size:.8rem;color:#666;margin-bottom:2.5rem}
#load-bar-wrap{
  width:min(400px,80vw);height:6px;background:#1a1a2e;border-radius:3px;overflow:hidden;position:relative;
}
#load-bar{
  height:100%;width:0%;background:linear-gradient(90deg,#ffc832,#ff8800);border-radius:3px;
  transition:width .3s ease;
}
#load-status{margin-top:1.2rem;font-size:.75rem;color:#555;text-align:center;min-height:1.2em}
#load-pct{margin-top:.5rem;font-size:1.5rem;color:#ffc832;font-weight:bold}

/* Pulsing dots animation */
@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}
.dots span{animation:pulse 1.4s infinite;font-size:1.2rem;color:#ffc832}
.dots span:nth-child(2){animation-delay:.2s}
.dots span:nth-child(3){animation-delay:.4s}

/* Scanline effect on overlay */
#load-overlay::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 4px);
}

/* ====== GAME UI (hidden until ready) ====== */
#game-ui{display:none;flex-direction:column;align-items:center;width:100%;flex:1}
#game-ui.active{display:flex}
.top-bar{width:100%;padding:.8rem 1.2rem;display:flex;align-items:center;gap:1rem;border-bottom:1px solid #1a1a1a}
.top-bar a{color:#888;text-decoration:none;font-size:.85rem;transition:color .15s}
.top-bar a:hover{color:#ffc832}
.top-bar .game-title{font-family:monospace;font-size:.7rem;color:#ffc832}
#canvas-holder{display:flex;align-items:center;justify-content:center;flex:1;width:100%;padding:1rem}
#canvas{background:#000;width:${opts.canvasW}px;height:${opts.canvasH}px;max-width:100%;image-rendering:pixelated;cursor:pointer}
.controls-info{text-align:center;padding:1rem;color:#555;font-size:.8rem;max-width:640px}
.controls-info kbd{background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:.15rem .45rem;font-family:sans-serif;font-size:.75rem;color:#999}
footer{text-align:center;padding:1.5rem 1rem;color:#333;font-size:.75rem;border-top:1px solid #1a1a1a;width:100%}
</style>
</head>
<body>

<!-- ====== LOADING OVERLAY (renders before anything else downloads) ====== -->
<div id="load-overlay">
  <h1>${opts.gameTitle}</h1>
  <div class="sub">The Janken Lopez Arcades</div>
  <div id="load-bar-wrap"><div id="load-bar"></div></div>
  <div id="load-pct">0%</div>
  <div id="load-status">Downloading game data<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
</div>

<!-- ====== GAME UI (hidden until loaded) ====== -->
<div id="game-ui">
  <div class="top-bar">
    <a href="index.html">&larr; Back to Arcades</a>
    <span class="game-title">${opts.gameTitle}</span>
  </div>
  <div id="canvas-holder">
    <canvas id="canvas" tabindex="1"></canvas>
  </div>
  <div class="controls-info">
    ${opts.controlsHtml}
    <p style="margin-top:.5rem;color:#444">Click the game canvas to start, then use keyboard controls.</p>
  </div>
  <footer>${opts.footerHtml}</footer>
</div>

<script>
// Loading screen controller — runs immediately
var _loadBar = document.getElementById('load-bar');
var _loadPct = document.getElementById('load-pct');
var _loadStatus = document.getElementById('load-status');
var _loadOverlay = document.getElementById('load-overlay');

// Fake progress during download (the real progress comes from the browser
// streaming the HTML — we can't measure it, so we animate toward ~85%)
var _fakeProgress = 0;
var _fakeTarget = 85;
var _fakeTimer = setInterval(function() {
  // Fast at first, slows as it approaches target (ease-out feel)
  _fakeProgress += (_fakeTarget - _fakeProgress) * 0.03;
  setLoadProgress(Math.round(_fakeProgress));
}, 200);

function setLoadProgress(pct) {
  _loadBar.style.width = pct + '%';
  _loadPct.textContent = pct + '%';
}
function setLoadStatus(msg) {
  _loadStatus.textContent = msg;
}
function hideOverlay() {
  clearInterval(_fakeTimer);
  setLoadProgress(100);
  setLoadStatus('Ready!');
  setTimeout(function() {
    _loadOverlay.classList.add('hidden');
    document.getElementById('game-ui').classList.add('active');
    setTimeout(function() { _loadOverlay.remove(); }, 700);
  }, 400);
}
</script>

<!-- BrowserFS inlined -->
<script>${opts.browserfsJS}</script>

<script>
// --- helpers ---
function b64toArrayBuffer(b64) {
  var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len);
  for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

// --- audio ---
var _audioCtx;
function unlockAudio() {
  if (!_audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) _audioCtx = new AC(); }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
}
['click','keydown','touchstart'].forEach(function(e){ document.addEventListener(e, unlockAudio, {once:false}); });

var _nativeSR = (function(){ var AC = window.AudioContext||window.webkitAudioContext; if(AC){var c=new AC();var sr=c.sampleRate;c.close();return sr;} return 48000; })();

// This runs once all the heavy script tags below are parsed
window.__onDataReady = function() {
  setLoadStatus('Decoding engine...');
  setLoadProgress(88);

  setTimeout(function() {
    var wasmBuf = b64toArrayBuffer(window.__WASM_B64);
    delete window.__WASM_B64;
    setLoadProgress(92);

    setLoadStatus('Decoding ROMs...');
    var roms = {};
    for (var name in window.__ROM_B64) {
      roms[name] = b64toArrayBuffer(window.__ROM_B64[name]);
    }
    delete window.__ROM_B64;
    setLoadProgress(95);

    setLoadStatus('Setting up filesystem...');
    BrowserFS.FileSystem.InMemory.Create(function(e, memFS) {
      BrowserFS.FileSystem.MountableFileSystem.Create({'/': memFS}, function(e2, mfs) {
        BrowserFS.initialize(mfs);
        var bfsFs = BrowserFS.BFSRequire('fs');
        var Buffer = BrowserFS.BFSRequire('buffer').Buffer;
        for (var rn in roms) {
          bfsFs.writeFileSync('/' + rn, Buffer.from(new Uint8Array(roms[rn])));
        }
        roms = null;
        setLoadProgress(98);

        // Transition to game UI
        hideOverlay();

        var canvas = document.getElementById('canvas');
        var ctx2d = canvas.getContext('2d');
        function showStatus(msg) {
          ctx2d.fillStyle='#000'; ctx2d.fillRect(0,0,canvas.width,canvas.height);
          ctx2d.fillStyle='#ffc832'; ctx2d.font='16px monospace'; ctx2d.textAlign='center';
          ctx2d.fillText(msg, canvas.width/2, canvas.height/2);
        }

        showStatus('Click to start!');

        function go() {
          canvas.removeEventListener('click', go);
          document.removeEventListener('keydown', go);
          unlockAudio();
          launchMAME(canvas, wasmBuf, mfs, showStatus);
        }
        canvas.addEventListener('click', go);
        document.addEventListener('keydown', go);
      });
    });
  }, 50);
};

function launchMAME(canvas, wasmBuf, mfs, showStatus) {
  showStatus('Launching MAME...');

  var OrigAC = window.AudioContext || window.webkitAudioContext;
  if (OrigAC) {
    window.AudioContext = function(opts) { opts=opts||{}; opts.sampleRate=_nativeSR; return new OrigAC(opts); };
    window.AudioContext.prototype = OrigAC.prototype;
    if (window.webkitAudioContext) window.webkitAudioContext = window.AudioContext;
  }

  window.Module = {
    canvas: canvas,
    arguments: ['${opts.driver}','-verbose','-rompath','emulator','-window','-nokeepaspect','-resolution','${opts.resolution}','-samplerate',String(_nativeSR)],
    noInitialRun: false,
    screenIsReadOnly: true,
    wasmBinary: wasmBuf,
    locateFile: function(f) { return f; },
    print: function(t){ console.log('[MAME] '+t); },
    printErr: function(t){ console.warn('[MAME] '+t); },
    preInit: function() {
      BrowserFS.initialize(mfs);
      var BFS = new BrowserFS.EmscriptenFS();
      FS.mkdir('/emulator');
      FS.mount(BFS, {root:'/'}, '/emulator');
    },
    preRun: [function() { console.log('[MAME] preRun — filesystem ready'); }]
  };

  // Block ALL network requests so Securly/web filters have nothing to intercept
  var _origFetch = window.fetch;
  window.fetch = function(url) {
    console.warn('[blocked fetch] ' + url);
    return Promise.reject(new Error('Network disabled — all assets are embedded'));
  };
  var _origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    console.warn('[blocked XHR] ' + method + ' ' + url);
    throw new Error('Network disabled — all assets are embedded');
  };

  // Execute MAME JS inline (no blob: URL, no network request)
  var mameText = document.getElementById('__mame_js').textContent;
  var s = document.createElement('script');
  s.text = mameText;
  document.head.appendChild(s);
}

// --- keep audio alive ---
setInterval(function(){
  try {
    if(_audioCtx&&_audioCtx.state==='suspended') _audioCtx.resume();
    if(typeof Module!=='undefined'&&Module.SDL2&&Module.SDL2.audioContext){
      var s=Module.SDL2.audioContext;
      if(s.state==='suspended') s.resume();
    }
  } catch(e){}
}, 500);
</script>

<!-- Embedded WASM (base64) -->
<script>window.__WASM_B64="${opts.wasmB64}";</script>

<!-- Embedded ROMs (base64) -->
<script>window.__ROM_B64={${opts.romChunks.map(function(r){ return '"'+r.name+'":"'+r.b64+'"'; }).join(',')}};</script>

${(opts.externalScripts||[]).map(function(s){ return '<script src="'+s+'"></script>'; }).join('\n')}

<!-- All data loaded — trigger decode -->
<script>
if(window._R){for(var _k in window._R){window.__ROM_B64[_k]=window._R[_k].join('');}delete window._R;}
window.__onDataReady();
</script>

<!-- MAME JS stored inert (not executed until needed) -->
<script id="__mame_js" type="text/plain">
${opts.mameJS}
</script>

</body>
</html>`;
}

// ---------- Build Acchi ----------

console.log('Building Acchi Muite Hoi...');
const acchiHTML = gameShell({
  title: 'Acchi Muite Hoi',
  gameTitle: 'Acchi Muite Hoi',
  publisher: 'Data East',
  year: '1995',
  canvasW: 640, canvasH: 480,
  controlsHtml: '<p><kbd>5</kbd> Insert Coin &middot; <kbd>1</kbd> 1P Start &middot; <kbd>Arrow Keys</kbd> Move &middot; <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Space</kbd> Buttons</p>',
  footerHtml: 'Data East Corporation &middot; 1995 &mdash; Non-commercial preservation.',
  driver: 'acchi',
  resolution: '640x480',
  browserfsJS: readText('engine/browserfs.min.js'),
  mameJS: readText('engine/mamedeco_mlc.js'),
  wasmB64: b64('engine/mamedeco_mlc.wasm'),
  romChunks: [
    { name: 'acchi.zip', b64: b64('roms/acchi.zip') }
  ]
});
fs.writeFileSync(path.join(DIST, 'acchi.html'), acchiHTML);
console.log(`  => dist/acchi.html (${(fs.statSync(path.join(DIST, 'acchi.html')).size / 1048576).toFixed(1)} MB)`);

// ---------- Build Metal Slug 1 ----------

console.log('Building Metal Slug 1...');
const mslug1HTML = gameShell({
  title: 'Metal Slug 1',
  gameTitle: 'Metal Slug 1',
  publisher: 'SNK',
  year: '1996',
  canvasW: 640, canvasH: 448,
  controlsHtml: '<p><kbd>5</kbd> Insert Coin &middot; <kbd>1</kbd> 1P Start &middot; <kbd>Arrow Keys</kbd> Move &middot; <kbd>Ctrl</kbd> Shoot &middot; <kbd>Alt</kbd> Jump &middot; <kbd>Space</kbd> Grenade</p>',
  footerHtml: 'SNK Corporation &middot; 1996 &mdash; Non-commercial preservation.',
  driver: 'mslug',
  resolution: '640x448',
  browserfsJS: readText('engine/browserfs.min.js'),
  mameJS: readText('engine/mameneogeo.js'),
  wasmB64: b64('engine/mameneogeo.wasm'),
  romChunks: [
    { name: 'mslug.zip', b64: b64('roms/mslug.zip') },
    { name: 'neogeo.zip', b64: b64('roms/neogeo.zip') }
  ]
});
fs.writeFileSync(path.join(DIST, 'mslug1.html'), mslug1HTML);
console.log(`  => dist/mslug1.html (${(fs.statSync(path.join(DIST, 'mslug1.html')).size / 1048576).toFixed(1)} MB)`);

// ---------- Build Metal Slug 2 ----------

console.log('Building Metal Slug 2...');
const mslug2HTML = gameShell({
  title: 'Metal Slug 2',
  gameTitle: 'Metal Slug 2',
  publisher: 'SNK',
  year: '1998',
  canvasW: 640, canvasH: 448,
  controlsHtml: '<p><kbd>5</kbd> Insert Coin &middot; <kbd>1</kbd> 1P Start &middot; <kbd>Arrow Keys</kbd> Move &middot; <kbd>Ctrl</kbd> Shoot &middot; <kbd>Alt</kbd> Jump &middot; <kbd>Space</kbd> Grenade</p>',
  footerHtml: 'SNK Corporation &middot; 1998 &mdash; Non-commercial preservation.',
  driver: 'mslug2',
  resolution: '640x448',
  browserfsJS: readText('engine/browserfs.min.js'),
  mameJS: readText('engine/mameneogeo.js'),
  wasmB64: b64('engine/mameneogeo.wasm'),
  romChunks: [
    { name: 'mslug2.zip', b64: b64('roms/mslug2.zip') },
    { name: 'neogeo.zip', b64: b64('roms/neogeo.zip') }
  ]
});
fs.writeFileSync(path.join(DIST, 'mslug2.html'), mslug2HTML);
console.log(`  => dist/mslug2.html (${(fs.statSync(path.join(DIST, 'mslug2.html')).size / 1048576).toFixed(1)} MB)`);

// ---------- Build Metal Slug 3 ----------

console.log('Building Metal Slug 3 (split build — ROM in companion JS files)...');
// Split large mslug3.zip into 2 JS chunks (each under 100 MB for GitHub)
const mslug3B64 = b64('roms/mslug3.zip');
const splitAt = Math.ceil(mslug3B64.length / 2 / 4) * 4; // align to base64 boundary

fs.writeFileSync(path.join(DIST, 'mslug3_r1.js'),
  'window._R=window._R||{};window._R["mslug3.zip"]=["' + mslug3B64.substring(0, splitAt) + '"];');
console.log(`  => dist/mslug3_r1.js (${(fs.statSync(path.join(DIST, 'mslug3_r1.js')).size / 1048576).toFixed(1)} MB)`);

fs.writeFileSync(path.join(DIST, 'mslug3_r2.js'),
  'window._R["mslug3.zip"].push("' + mslug3B64.substring(splitAt) + '");');
console.log(`  => dist/mslug3_r2.js (${(fs.statSync(path.join(DIST, 'mslug3_r2.js')).size / 1048576).toFixed(1)} MB)`);

const mslug3HTML = gameShell({
  title: 'Metal Slug 3',
  gameTitle: 'Metal Slug 3',
  publisher: 'SNK',
  year: '2000',
  canvasW: 640, canvasH: 448,
  controlsHtml: '<p><kbd>5</kbd> Insert Coin &middot; <kbd>1</kbd> 1P Start &middot; <kbd>Arrow Keys</kbd> Move &middot; <kbd>Ctrl</kbd> Shoot &middot; <kbd>Alt</kbd> Jump &middot; <kbd>Space</kbd> Grenade</p>',
  footerHtml: 'SNK Corporation &middot; 2000 &mdash; Non-commercial preservation.',
  driver: 'mslug3',
  resolution: '640x448',
  browserfsJS: readText('engine/browserfs.min.js'),
  mameJS: readText('engine/mameneogeo.js'),
  wasmB64: b64('engine/mameneogeo.wasm'),
  romChunks: [
    { name: 'neogeo.zip', b64: b64('roms/neogeo.zip') }
  ],
  externalScripts: ['mslug3_r1.js', 'mslug3_r2.js']
});
fs.writeFileSync(path.join(DIST, 'mslug3.html'), mslug3HTML);
console.log(`  => dist/mslug3.html (${(fs.statSync(path.join(DIST, 'mslug3.html')).size / 1048576).toFixed(1)} MB)`);

// ---------- Build hub index ----------

console.log('Building hub index...');
const indexHTML = readText('index.html')
  .replace(/href="games\/acchi\.html"/g, 'href="acchi.html"')
  .replace(/href="games\/mslug1\.html"/g, 'href="mslug1.html"')
  .replace(/href="games\/mslug2\.html"/g, 'href="mslug2.html"')
  .replace(/href="games\/mslug3\.html"/g, 'href="mslug3.html"')
  .replace(/href="games\//g, 'href="../games/')
  .replace(/src="assets\//g, 'src="../assets/');
fs.writeFileSync(path.join(DIST, 'index.html'), indexHTML);
console.log(`  => dist/index.html`);

console.log('Done! All files in dist/ are fully self-contained.');
