# Rosslyn Analyst Network

Interactive 3D and list-based exploration of the Rosslyn analyst cohort, powered by a Python clustering pipeline and a Vite React frontend.

## Structure
- `pipeline/` reads the Excel workbook, computes persona tags, discovers clusters, and exports JSON.
- `frontend/` renders the galaxy-style visualization from `frontend/public/data/network-map.json`.

## Run the pipeline
```bash
cd pipeline
python main.py
```

This writes:
- `pipeline/outputs/analysts.json`
- `pipeline/outputs/clusters.json`
- `pipeline/outputs/cluster-evaluation.json`
- `pipeline/outputs/network-map.json`

It also syncs the merged payload directly to:
- `frontend/public/data/network-map.json`

## Run the frontend locally
```bash
cd frontend
npm install
npm run dev
```

## Production build
```bash
cd frontend
npm run build
```

The app is configured for static SPA hosting on Vercel via `frontend/vercel.json`.
