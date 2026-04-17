# The Janken Lopez Arcades

A self-hosted, non-commercial browser arcade. Games run entirely in the browser — MAME arcade titles via Emscripten, Godot games via their official WebAssembly runtime, and web games via iframe. Also ships a `dist/` folder of fully self-contained single-file HTML builds for offline/portable use.

---

## Games

| Game | Developer | Year | Status | Engine |
|------|-----------|------|--------|--------|
| Acchi Muite Hoi | Data East | 1991 | ✅ Playable | MAME (Deco MLC) |
| Metal Slug 1 | SNK | 1996 | ✅ Playable | MAME (Neo Geo) |
| Metal Slug 2 | SNK | 1998 | ✅ Playable | MAME (Neo Geo) |
| Metal Slug 3 | SNK | 2000 | ✅ Playable | MAME (Neo Geo) |
| 1v1.lol | JustPlay.LOL | — | ✅ Playable | Live iframe embed |
| Minesweeper Plus | — | — | ✅ Playable | Godot 4.4 (WebAssembly) |
| Uncanny Cat Golfing | SH2K | — | ✅ Playable | Godot 4.2 (WebAssembly) |

> Godot games were shipped as Windows executables. The `.pck` game data was extracted and paired with the matching Godot web export template (WASM runtime) to run in the browser. 1v1.lol is embedded from the live site and requires internet.

---

## Project Structure

```
index.html                    ← Arcade Hub (source)
dist/
  index.html                  ← Self-contained hub (generated)
  acchi.html                  ← Self-contained game (generated)
  mslug1.html                 ← Self-contained game (generated)
  mslug2.html                 ← Self-contained game (generated)
  mslug3.html                 ← Self-contained game (generated)
games/
  acchi.html                  ← Acchi Muite Hoi (loads from engine/ + roms/)
  mslug1.html                 ← Metal Slug 1
  mslug2.html                 ← Metal Slug 2
  mslug3.html                 ← Metal Slug 3
  1v1lol.html                 ← 1v1.lol (live iframe embed)
  minesweeper-plus.html       ← Minesweeper Plus (Godot WebAssembly)
  uncanny-cat-golfing.html    ← Uncanny Cat Golfing (Godot WebAssembly)
engine/
  mameneogeo.js / .wasm       ← MAME Neo Geo core (Emscripten)
  mamedeco_mlc.js / .wasm     ← MAME Deco MLC core (Emscripten)
  browserfs.min.js            ← BrowserFS (virtual ROM filesystem)
  godot421/                   ← Godot 4.2.1 web export template (WASM + JS)
  godot44/                    ← Godot 4.4 web export template (WASM + JS)
roms/
  acchi.zip                   ← Data East ROM (user-supplied)
  mslug.zip                   ← Metal Slug 1 ROM (user-supplied)
  mslug2.zip                  ← Metal Slug 2 ROM (user-supplied)
  mslug3.zip                  ← Metal Slug 3 ROM (user-supplied)
  neogeo.zip                  ← Neo Geo BIOS (required for all SNK games)
  MS+_2.1_Windows_x86_32.zip ← Minesweeper Plus Windows build
  UncannyCatGolfPlaytest2.zip ← Uncanny Cat Golfing Windows build
  CREDITS.md                  ← Manual attribution notes
  sources.json                ← Licensed download manifest (see below)
  sources.example.json        ← Manifest template
webgames/
  1v1lol/                     ← Unity WebGL loader (falls back to live site)
  minesweeper-plus/           ← Godot web runner + godot.pck (47.9 MB)
  uncanny-cat-golfing/        ← Godot web runner + godot.pck (85.4 MB)
assets/
  *-cover.png                 ← Game cover images (hub cards)
scripts/
  download_licensed_assets.ps1  ← Legal ROM/asset downloader
  fetch_godot_web_templates.py ← Downloads Godot WASM runtimes via range requests
build_embedded.js              ← Generates dist/ self-contained builds
```

---

## Quick Start (local dev)

The game pages fetch assets over HTTP, so you need a local server:

```powershell
# Node.js
npx serve .

# Python
python -m http.server 8000
```

Then open `http://localhost:3000` (or `:8000`) and click a game.

No build step is required for local play — edit source files in `games/` and refresh.

---

## Building the dist/ Folder

`dist/` contains self-contained HTML files that embed all ROMs and engine files as base64. These work offline and can be deployed as a single file.

```powershell
node build_embedded.js
```

Requirements: Node.js installed, all ROM files present in `roms/`.

> Warning: dist files are large (50–160 MB per game). They are gitignored by default.

---

## Adding a New MAME Game (Neo Geo)

1. Place `<game>.zip` and `neogeo.zip` in `roms/`
2. Copy `games/mslug1.html` → `games/<game>.html`
3. Update the ROM filename, MAME driver string, title, and footer year
4. Add a card to `index.html`
5. Add a build block in `build_embedded.js` and run `node build_embedded.js`

---

## Legal Asset Intake

To download licensed assets automatically:

1. Edit `roms/sources.json` (auto-created from `sources.example.json` on first run)
2. Fill in your authorized URLs, rights holder, and license info for each entry
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download_licensed_assets.ps1
```

The script will:
- Skip any entries still pointing to `https://example.com/`
- Download files to their `targetPath`
- Optionally verify SHA256 checksums
- Generate `roms/CREDITS.generated.md` with attribution

To get the SHA256 of a file you already have:

```powershell
Get-FileHash -Algorithm SHA256 .\roms\mslug.zip
```

---

## MAME Controls

| Key | Action |
|-----|--------|
| `5` | Insert Coin |
| `1` | 1P Start |
| Arrow Keys | Move |
| `Z` `X` `C` | Buttons 1 / 2 / 3 |
| Click canvas first | Unlock audio |

---

## Credits

- **MAME Emscripten cores** — custom builds targeting Neo Geo and Deco MLC hardware
- **BrowserFS** — in-memory virtual filesystem for ROM mounting
- **Godot Engine** — [godotengine.org](https://godotengine.org/) — web export templates used under MIT license
- **Game rights** — all games belong to their respective owners; see `roms/CREDITS.md`

## Disclaimer

Non-commercial preservation project. No ROM files are distributed with this repository. You must supply your own legally obtained files.