# GeoJSON Compare

A Next.js application for comparing old and new GeoJSON geometries side by side on an interactive map.

## Features

- Server-side CSV reading (data never sent to browser)
- Interactive map visualization using Leaflet
- Color-coded geometry comparison (red for old, blue for new)
- Vercel-ready deployment

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

Navigate to `/compare/[uuid]` where `[uuid]` is the UUID of the geometry you want to compare.

Example: `http://localhost:3000/compare/example-uuid-1`

## Data Format

The application reads from `data.csv` in the root directory with the following format:

```csv
uuid,old_geojson,new_geojson
example-uuid-1,"{""type"":""Polygon"",""coordinates"":[[...]]}","{""type"":""Polygon"",""coordinates"":[[...]]}"
```

- `uuid`: Unique identifier for the geometry
- `old_geojson`: JSON string of the old geometry
- `new_geojson`: JSON string of the new geometry

Note: GeoJSON values should be properly escaped JSON strings in the CSV.

## API

### GET `/api/get-geometries/[uuid]`

Returns the old and new geometries for a given UUID.

**Response:**
```json
{
  "uuid": "example-uuid-1",
  "oldGeojson": { "type": "Polygon", "coordinates": [...] },
  "newGeojson": { "type": "Polygon", "coordinates": [...] }
}
```

## Deployment

This application is ready to deploy on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Deploy

The `data.csv` file should be included in your repository or uploaded to Vercel's file system.

## Tech Stack

- Next.js 15
- React 18
- TypeScript
- Leaflet & React-Leaflet
- Tailwind CSS

