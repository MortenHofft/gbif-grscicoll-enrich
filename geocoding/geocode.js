const countryNames = require('./countryNames.json');

// Place types that indicate the geocoder found a real venue/address rather than
// a broad administrative region, which would put the pin in the wrong place.
const ACCEPTED_PLACE_TYPES = new Set([
  'establishment', 'point_of_interest', 'subpremise', 'street_address',
  'university', 'premise', 'route', 'intersection', 'school', 'finance',
  'general_contractor', 'parking', 'health', 'hospital', 'secondary_school',
  'bank', 'park', 'tourist_attraction', 'zoo', 'museum',
]);

/**
 * Choose the best address object from an institution/collection record.
 * Prefers the physical address if it has a street line; falls back to mailing.
 */
function pickAddress(entity) {
  const physical = entity.address;
  const mailing  = entity.mailingAddress;
  if (physical?.address) return { obj: physical, source: 'address' };
  if (mailing?.address)  return { obj: mailing,  source: 'mailingAddress' };
  // No street line — use whichever has city/country for a coarser result
  if (physical?.city || physical?.country) return { obj: physical, source: 'address' };
  if (mailing?.city  || mailing?.country)  return { obj: mailing,  source: 'mailingAddress' };
  return null;
}

/**
 * Build a geocoding query string from a name and address object.
 * Order matches what the old project found works well with Google Maps:
 *   name, street, city, postalCode, province, country
 */
function buildQuery(name, addressObj) {
  const country = addressObj?.country
    ? (countryNames[addressObj.country] || addressObj.country)
    : null;
  const parts = [
    name,
    addressObj?.address,
    addressObj?.city,
    addressObj?.postalCode,
    addressObj?.province,
    country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Geocode an institution or collection record using Google Maps.
 * Returns { latitude, longitude, googleMapsUrl, placeId, usedQuery, addressSource }
 * Throws on failure so callers can set action state to 'failed'.
 */
async function geocode(entity) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const picked = pickAddress(entity);
  const query  = buildQuery(entity.name, picked?.obj ?? null);
  if (!query) throw new Error('No usable address data found on this record');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;

  const response = await fetch(url, { headers: { 'User-Agent': 'GBIF.org' } });
  if (!response.ok) throw new Error(`Google Maps API returned ${response.status}`);

  const data = await response.json();

  if (data.status === 'REQUEST_DENIED') throw new Error(`Google API: ${data.error_message || 'REQUEST_DENIED'}`);
  if (!data.results?.length)           throw new Error('Geocoder returned no results');

  // Prefer a result with a meaningful place type; fall back to first result
  const result =
    data.results.find(r => r.types.some(t => ACCEPTED_PLACE_TYPES.has(t))) ||
    data.results[0];

  const { lat, lng } = result.geometry.location;

  return {
    latitude:      lat,
    longitude:     lng,
    googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    placeId:       result.place_id,
    usedQuery:     query,
    addressSource: picked?.source ?? null,
  };
}

module.exports = { geocode, pickAddress, buildQuery };
