# GrSciColl Enrich

An internal admin tool for batch-improving [GrSciColl](https://www.gbif.org/grscicoll) institution records. The first capability is **coordinate inference** — finding GPS coordinates for institutions that have a street address but no latitude/longitude, using the Google Maps Geocoding API.

Improvements are submitted as **change suggestions** that GrSciColl editors review and accept or reject, rather than being applied automatically. A direct-apply mode is also available for admins with a bearer token.

---

## What it does

- Lists GrSciColl institutions filtered by URL query parameters (e.g. `hasCoordinate=false&country=DE`)
- For each institution that has a street address and country but no coordinates, offers an **Infer coordinates** action
- Geocodes the address via Google Maps and either:
  - **Suggests** the coordinates as a change for human review, or
  - **Applies** them directly (requires a bearer token)
- Detects duplicate pending suggestions (`GBIF_GEOCODING:` prefix) and skips re-submitting
- Coordinate badges link to Google Maps; institution titles link to the registry

### Batch apply script

A separate CLI script can bulk-approve all pending `GBIF_GEOCODING` suggestions in one pass — useful after reviewing a batch of geocoded results in the registry.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default `3000`) |
| `GBIF_API_BASE` | GBIF API base URL — swap to switch environments |
| `REGISTRY_BASE` | Registry UI base URL — used to build suggestion links |
| `GOOGLE_API_KEY` | Google Maps Geocoding API key |
| `PROPOSER_EMAIL` | Email shown on submitted change suggestions |
| `GBIF_REGISTRY_API_BASE` | Registry admin API base URL — used by the apply script |

**Environment switching** — to point at the UAT environment, set:
```
GBIF_API_BASE=https://api.gbif-uat.org
REGISTRY_BASE=https://registry.gbif-uat.org
GBIF_REGISTRY_API_BASE=https://registry-api.gbif-uat.org
```

### 3. Start the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Batch-applying suggestions

After reviewing pending suggestions in the registry, you can approve all `GBIF_GEOCODING` suggestions in bulk:

```bash
# Preview — shows what would be applied, makes no changes
npm run apply-suggestions:dry

# Apply for real
npm run apply-suggestions
```

Requires `GBIF_REGISTRY_API_BASE` to be set in `.env`.

---

## Project structure

```
├── server.js                          # Express server + API proxy + geocode/suggest routes
├── geocoding/
│   ├── geocode.js                     # Google Maps geocoding logic + address fallback
│   ├── suggest.js                     # GrSciColl change suggestion submission
│   └── countryNames.json              # ISO alpha-2 → country name mapping
├── scripts/
│   └── apply-geocoding-suggestions.js # Bulk-approve pending GBIF_GEOCODING suggestions
└── public/
    └── index.html                     # Admin UI (React via CDN, no build step)
```
