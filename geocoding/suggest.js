/**
 * Submit a change suggestion to the GrSciColl registry for human review.
 *
 * The suggestion is not applied automatically — a GrSciColl editor must accept
 * or reject it via registry.gbif.org. This is intentional: geocoded coordinates
 * should always be reviewed before being saved to the authoritative record.
 */
async function createSuggestion({ type, entity, latitude, longitude, proposerEmail, gbifApiBase }) {
  const suggested = { ...entity, latitude, longitude };

  const payload = {
    type:            'UPDATE',
    suggestedEntity: suggested,
    entityKey:       entity.key,
    proposerEmail,
    comments: [
      `GBIF_GEOCODING: Coordinates inferred from address using the Google Maps Geocoding API. ` +
      `Please verify the location before accepting: https://www.google.com/maps?q=${latitude},${longitude}`,
    ],
  };

  const url = `${gbifApiBase}/v1/grscicoll/${type}/changeSuggestion`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'GBIF.org' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Suggestion API returned ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
  }

  return await res.json(); // GBIF returns the new suggestion key as a plain number
}

module.exports = { createSuggestion };
