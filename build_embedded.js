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
body{background:#0a0a12;color:#e0e0e0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center}
.top-bar{width:100%;padding:.8rem 1.2rem;display:flex;align-items:center;gap:1rem;border-bottom:1px solid #1a1a1a}
.top-bar a{color:#888;text-decoration:none;font-size:.85rem;transition:color .15s}
.top-bar a:hover{color:#ffc832}
.top-bar .game-title{font-family:monospace;font-size:.7rem;color:#ffc832}
#canvas-holder{display:flex;align-items:center;justify-content:center;flex:1;width:100%;padding:1rem}
#canvas{background:#000;width:${opts.canvasW}px;height:${opts.canvasH}px;max-width:100%;image-rendering:pixelated;cursor:pointer}
.controls-info{text-align:center;padding:1rem;color:#555;font-size:.8rem;max-width:640px}
.controls-info kbd{background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:.15rem .45rem;font-family:sans-serif;font-size:.75rem;color:#999}
footer{text-align:center;padding:1.5rem 1rem;color:#333;font-size:.75rem;border-top:1px solid #1a1a1a;width:100%}
#progress{position:fixed;top:0;left:0;height:3px;background:#ffc832;transition:width .2s;z-index:999}
</style>
</head>
<body>
<div id="progress" style="width:0%"></div>
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

<!-- BrowserFS inlined -->
<script>${opts.browserfsJS}</script>

<script>
// --- helpers ---
var pbar = document.getElementById('progress');
function setProgress(pct) { pbar.style.width = pct + '%'; }

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

// --- canvas status ---
var canvas = document.getElementById('canvas');
var ctx2d = canvas.getContext('2d');
function showStatus(msg) {
  ctx2d.fillStyle='#000'; ctx2d.fillRect(0,0,canvas.width,canvas.height);
  ctx2d.fillStyle='#ffc832'; ctx2d.font='16px monospace'; ctx2d.textAlign='center';
  ctx2d.fillText(msg, canvas.width/2, canvas.height/2);
}

showStatus('Decoding assets...');
setProgress(10);

// --- decode embedded assets (async to avoid blocking UI) ---
setTimeout(function() {
  var wasmBuf = b64toArrayBuffer(window.__WASM_B64);
  delete window.__WASM_B64; // free memory
  setProgress(40);

  showStatus('Decoding ROMs...');
  var roms = {};
  for (var name in window.__ROM_B64) {
    roms[name] = b64toArrayBuffer(window.__ROM_B64[name]);
  }
  delete window.__ROM_B64;
  setProgress(60);

  showStatus('Setting up filesystem...');
  BrowserFS.FileSystem.InMemory.Create(function(e, memFS) {
    BrowserFS.FileSystem.MountableFileSystem.Create({'/': memFS}, function(e2, mfs) {
      BrowserFS.initialize(mfs);
      var bfsFs = BrowserFS.BFSRequire('fs');
      var Buffer = BrowserFS.BFSRequire('buffer').Buffer;
      for (var rn in roms) {
        bfsFs.writeFileSync('/' + rn, Buffer.from(new Uint8Array(roms[rn])));
      }
      roms = null; // free
      setProgress(70);

      showStatus('Click to start!');

      function go() {
        canvas.removeEventListener('click', go);
        document.removeEventListener('keydown', go);
        unlockAudio();
        launch(wasmBuf, mfs);
      }
      canvas.addEventListener('click', go);
      document.addEventListener('keydown', go);
    });
  });
}, 50);

function launch(wasmBuf, mfs) {
  showStatus('Launching MAME...');
  setProgress(80);

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
    locateFile: function(f) { return f; /* won't be called since wasmBinary is provided */ },
    print: function(t){ console.log('[MAME] '+t); },
    printErr: function(t){ console.warn('[MAME] '+t); },
    preInit: function() {
      BrowserFS.initialize(mfs);
      var BFS = new BrowserFS.EmscriptenFS();
      FS.mkdir('/emulator');
      FS.mount(BFS, {root:'/'}, '/emulator');
    },
    preRun: [function() {
      setProgress(90);
      console.log('[MAME] preRun — filesystem ready');
    }]
  };

  // Execute the MAME JS from the inert script tag via blob URL
  setProgress(95);
  var mameText = document.getElementById('__mame_js').textContent;
  var blob = new Blob([mameText], {type: 'application/javascript'});
  var url = URL.createObjectURL(blob);
  var s = document.createElement('script');
  s.src = url;
  s.onload = function() {
    URL.revokeObjectURL(url);
    setProgress(100);
    setTimeout(function(){ pbar.style.display='none'; }, 1000);
  };
  s.onerror = function() { showStatus('Failed to launch MAME engine!'); };
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

// ---------- Build Metal Slug 3 ----------

console.log('Building Metal Slug 3...');
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
    { name: 'mslug3.zip', b64: b64('roms/mslug3.zip') },
    { name: 'neogeo.zip', b64: b64('roms/neogeo.zip') }
  ]
});
fs.writeFileSync(path.join(DIST, 'mslug3.html'), mslug3HTML);
console.log(`  => dist/mslug3.html (${(fs.statSync(path.join(DIST, 'mslug3.html')).size / 1048576).toFixed(1)} MB)`);

// ---------- Build hub index ----------

console.log('Building hub index...');
const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Janken Lopez Arcades</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a12;color:#e0e0e0;font-family:'Inter',sans-serif;min-height:100vh;position:relative;overflow-x:hidden}
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px);pointer-events:none;z-index:100}
header{text-align:center;padding:3rem 1rem 2rem}
.title{font-family:monospace;font-size:clamp(1.2rem,4vw,2.4rem);text-transform:uppercase;letter-spacing:.05em;color:#fff;text-shadow:0 0 10px rgba(255,200,50,.8),0 0 30px rgba(255,200,50,.4),0 0 60px rgba(255,150,0,.2);line-height:1.4}
.subtitle{margin-top:1rem;font-size:.95rem;color:#888;font-style:italic}
.game-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;max-width:1000px;margin:2rem auto;padding:0 1.5rem 3rem}
.game-card{background:#14141f;border:1px solid #222;border-radius:12px;overflow:hidden;transition:transform .2s,border-color .2s,box-shadow .2s;display:flex;flex-direction:column}
.game-card:hover{transform:translateY(-4px);border-color:#ffc832;box-shadow:0 8px 30px rgba(255,200,50,.15)}
.game-thumb{width:100%;aspect-ratio:4/3;background:#1a1a2e;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#ffc832;border-bottom:1px solid #222;position:relative;overflow:hidden}
.game-thumb .crt-glow{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,200,50,.06) 0%,transparent 70%)}
.game-info{padding:1rem 1.2rem;flex:1;display:flex;flex-direction:column}
.game-name{font-family:monospace;font-size:.75rem;color:#fff;line-height:1.6}
.game-meta{margin-top:.4rem;font-size:.8rem;color:#666}
.game-meta span{display:inline-block;margin-right:.8rem}
.play-btn{display:inline-block;margin-top:auto;padding-top:1rem}
.play-btn a{display:inline-block;background:#ffc832;color:#0a0a12;font-family:monospace;font-size:.65rem;padding:.6rem 1.4rem;border-radius:6px;text-decoration:none;transition:background .15s,transform .1s;letter-spacing:.05em}
.play-btn a:hover{background:#ffe066;transform:scale(1.04)}
.play-btn a:active{transform:scale(.97)}
.badge{display:inline-block;font-size:.6rem;padding:.2rem .5rem;border-radius:4px;vertical-align:middle;margin-left:.5rem;font-weight:600}
.badge-mame{background:rgba(255,200,50,.15);color:#ffc832;border:1px solid rgba(255,200,50,.3)}
footer{text-align:center;padding:2rem 1rem;color:#444;font-size:.8rem;border-top:1px solid #1a1a1a}
footer a{color:#666;text-decoration:none}
footer a:hover{color:#ffc832}
</style>
</head>
<body>
<header>
  <h1 class="title">The Janken Lopez<br>Arcades</h1>
  <p class="subtitle">Free classic arcade preservation &mdash; playable in your browser</p>
</header>
<section class="game-grid">
  <div class="game-card">
    <div class="game-thumb"><div class="crt-glow"></div>&#127918;</div>
    <div class="game-info">
      <div class="game-name">Acchi Muite Hoi <span class="badge badge-mame">MAME</span></div>
      <div class="game-meta"><span>Data East &middot; 1995</span></div>
      <div class="play-btn"><a href="acchi.html">PLAY</a></div>
    </div>
  </div>
  <div class="game-card">
    <div class="game-thumb"><div class="crt-glow"></div>&#128163;</div>
    <div class="game-info">
      <div class="game-name">Metal Slug 3 <span class="badge badge-mame">MAME</span></div>
      <div class="game-meta"><span>SNK &middot; 2000</span></div>
      <div class="play-btn"><a href="mslug3.html">PLAY</a></div>
    </div>
  </div>
  <div class="game-card" style="opacity:.35;pointer-events:none">
    <div class="game-thumb" style="color:#333">&#10067;</div>
    <div class="game-info">
      <div class="game-name" style="color:#555">More games soon&hellip;</div>
      <div class="game-meta"><span>Stay tuned</span></div>
    </div>
  </div>
</section>
<footer>
  <p>Emulation powered by <a href="https://www.mame.net/" target="_blank" rel="noopener">MAME 0.232</a></p>
  <p style="margin-top:.5rem">Non-commercial preservation project. All games belong to their respective owners.</p>
</footer>
</body>
</html>`;
fs.writeFileSync(path.join(DIST, 'index.html'), indexHTML);
console.log(`  => dist/index.html`);

console.log('Done! All files in dist/ are fully self-contained.');
