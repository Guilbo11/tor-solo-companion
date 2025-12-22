# TOR Solo Companion (Prototype)

This is a small, installable-style web app (PWA-like workflow) prototype inspired by the idea of Stargazer,
focused on:
- Dice roller (Feat die + Success dice)
- Strider-mode oracle engine (configurable thresholds + user-provided tables)
- Journal
- Hex-overlay map (load your own Eriador map image; click hexes; attach notes)

## What this does *not* include (on purpose)
It does **not** ship copyrighted TOR / Strider Mode text or tables.
Instead, you can enter your own tables manually or import them as JSON (created from your PDFs for personal use).

## Run locally (requires Node.js)
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages (matches the fixes we used)
This repo is pre-configured to deploy via **GitHub Actions**.

1. Push the repo to GitHub (repo name must be **tor-solo-companion** unless you update `base` in `vite.config.ts`).
2. In GitHub: **Settings → Pages → Source → GitHub Actions**.
3. Check **Actions** for a green run.

Your app will be available at:
`https://<your-username>.github.io/tor-solo-companion/`

### Install on Android
Open the URL in **Chrome** → menu ⋮ → **Add to Home screen / Install app**.

## Included data packs
For convenience, the repo includes a few user-supplied compendium-style JSON packs under:
`public/data/`

These are loaded via fetch from:
`<BASE_URL>/data/<file>.json`

## Using the map
1. Export the Eriador map page from your PDF as a PNG/JPG (or take a screenshot).
2. In the app: Map → Background image → choose the file.
3. Adjust Hex size and Origin until the overlay aligns with the printed hexes.
4. Click hexes to select them and add notes.

## Oracles / tables JSON format
Add tables as a JSON array of strings:
```json
["Result A", "Result B", "Result C"]
```

Or objects with weights:
```json
[
  {"text": "Common thing", "weight": 3},
  {"text": "Rare thing", "weight": 1}
]
```

## Export/import
Use Export to copy JSON to clipboard; save it to Google Drive (or elsewhere). Use Import on another device.
