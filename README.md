# The Janken Lopez Arcades

A free, non-commercial collection of classic arcade games playable in the browser via GitHub Pages.  
Emulation is powered by **EmulatorJS** (MAME core) — no Internet Archive dependency, with full audio support.

## Games

| Game | Developer | Year | Emulator |
|------|-----------|------|----------|
| Acchi Muite Hoi (じゃんけん＆あっち向いてホイ) | Data East Corporation | 1991 | MAME 2003 |

*More games coming soon.*

## Quick Start

### 1. Clone & run setup

```powershell
git clone <your-repo-url>
cd jankenhtml
.\setup.ps1
```

The setup script will:
- Create the folder structure (`data/`, `roms/`, `games/`)
- Download the latest **EmulatorJS** release from GitHub into `data/`

### 2. Add your ROM

Place your `acchi.zip` MAME ROM file into the `roms/` folder:

```
roms/
  acchi.zip
```

> ROMs are **not** included in this repository. You must supply your own legally obtained ROM files.

### 3. Serve locally

EmulatorJS requires HTTP (not `file://`). Use any static server:

```powershell
npx serve .          # Node.js
python -m http.server 8000   # Python
```

Then open `http://localhost:3000` (or `:8000`) in your browser.

## Project Structure

```
index.html          ← Arcade Hub (game list)
games/
  acchi.html        ← Acchi Muite Hoi (EmulatorJS + MAME)
data/               ← EmulatorJS files (created by setup.ps1)
roms/               ← ROM files (user-provided, gitignored)
setup.ps1           ← One-click setup script
```

## Adding a New Game

1. Place the MAME ROM zip in `roms/`
2. Copy `games/acchi.html` → `games/<game>.html`
3. Update `EJS_gameUrl` and `EJS_gameName` in the new file
4. Add a game card to `index.html`

## Controls

| Key | Action |
|-----|--------|
| `5` | Insert Coin |
| `1` | 1P Start |
| Arrow Keys | Move / Direction |
| `Z` `X` `C` | Buttons |

## Credits

- **Emulation:** [EmulatorJS](https://github.com/nicknamer02/EmulatorJS) + [MAME](https://www.mame.net/)
- **Preservation:** This project exists for archival and historical purposes.

## Disclaimer

This is a non-commercial preservation project. All games belong to their respective owners.  
No ROMs are distributed with this project — you must supply your own.