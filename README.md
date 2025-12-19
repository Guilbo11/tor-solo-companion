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
