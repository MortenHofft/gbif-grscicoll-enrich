require('dotenv').config();

const express = require('express');
const path = require('path');
const { geocode }           = require('./geocoding/geocode');
const { createSuggestion }  = require('./geocoding/suggest');

const app = express();
const PORT = process.env.PORT || 3000;
const GBIF_API_BASE = process.env.GBIF_API_BASE || 'https://api.gbif.org';
const REGISTRY_BASE = process.env.REGISTRY_BASE || 'https://registry.gbif.org';

// Expose frontend-safe config
app.get('/api/config', (_req, res) => {
  res.json({ registryBase: REGISTRY_BASE });
});

// Returns the first pending GBIF_GEOCODING suggestion for this entity, or null
async function findExistingGeocodingSuggestion(type, key) {
  const url = `${GBIF_API_BASE}/v1/grscicoll/${type}/changeSuggestion?status=PENDING&entityKey=${key}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.find(s =>
    s.comments?.some(c => c.startsWith('GBIF_GEOCODING:'))
  ) ?? null;
}

// Geocode a single entity and submit a change suggestion for human review
app.post('/api/grscicoll/:type/:key/infer-coordinates', async (req, res) => {
  const { type, key } = req.params;
  try {
    // Bail early if we already have a pending geocoding suggestion for this entity
    const existing = await findExistingGeocodingSuggestion(type, key);
    if (existing) {
      return res.json({
        success:          true,
        alreadySuggested: true,
        suggestionKey:    existing.key,
        latitude:         existing.suggestedEntity?.latitude ?? null,
        longitude:        existing.suggestedEntity?.longitude ?? null,
      });
    }

    // Fetch the authoritative record — this is also the base for the suggestion payload
    const entityRes = await fetch(`${GBIF_API_BASE}/v1/grscicoll/${type}/${key}`);
    if (!entityRes.ok) return res.status(404).json({ success: false, error: 'Entity not found in GBIF' });
    const entity = await entityRes.json();

    // Geocode using the entity's address fields
    const geocodeResult = await geocode(entity);

    // Submit a change suggestion so a human can review before it goes live
    const suggestionKey = await createSuggestion({
      type,
      entity,
      latitude:      geocodeResult.latitude,
      longitude:     geocodeResult.longitude,
      proposerEmail: process.env.PROPOSER_EMAIL || 'scientific-collections@gbif.org',
      gbifApiBase:   GBIF_API_BASE,
    });

    res.json({ success: true, alreadySuggested: false, ...geocodeResult, suggestionKey });
  } catch (e) {
    res.status(422).json({ success: false, error: e.message });
  }
});

// Geocode and directly apply coordinates to a record (no suggestion, requires auth)
app.post('/api/grscicoll/:type/:key/update-coordinates', async (req, res) => {
  const { type, key } = req.params;
  const authToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!authToken) return res.status(401).json({ success: false, error: 'Authorization token required' });

  try {
    const entityRes = await fetch(`${GBIF_API_BASE}/v1/grscicoll/${type}/${key}`);
    if (!entityRes.ok) return res.status(404).json({ success: false, error: 'Entity not found in GBIF' });
    const entity = await entityRes.json();

    const geocodeResult = await geocode(entity);

    const updated = { ...entity, latitude: geocodeResult.latitude, longitude: geocodeResult.longitude };
    const putRes = await fetch(`${GBIF_API_BASE}/v1/grscicoll/${type}/${key}`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent':    'GBIF.org',
      },
      body: JSON.stringify(updated),
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      throw new Error(`GBIF returned ${putRes.status}${text ? ': ' + text.slice(0, 200) : ''}`);
    }

    res.json({ success: true, ...geocodeResult });
  } catch (e) {
    res.status(422).json({ success: false, error: e.message });
  }
});

// Proxy GrSciColl API requests to avoid CORS and allow env-based base URL switching
app.get('/api/grscicoll/:type', async (req, res) => {
  const url = new URL(`${GBIF_API_BASE}/v1/grscicoll/${req.params.type}`);
  Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`GBIF API base: ${GBIF_API_BASE}`);
});
