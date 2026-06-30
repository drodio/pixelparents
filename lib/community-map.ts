// Pure helpers for the /community world map. OHS is a global online school, so
// the signup form captures an optional country alongside US state: US families
// are plotted by state centroid and international families by country centroid,
// all on the same Equal-Earth world map (see components/world-map.tsx).

export type Marker = { name: string; lat: number; lon: number; count: number };

// Approximate geographic centroids (lat, lon) for US states. Keyed by full state
// name (matches signups_by_state).
export const STATE_CENTROIDS: Record<string, [number, number]> = {
  Alabama: [32.8, -86.8], Alaska: [64.0, -152.0], Arizona: [34.2, -111.7],
  Arkansas: [34.9, -92.4], California: [37.2, -119.5], Colorado: [39.0, -105.5],
  Connecticut: [41.6, -72.7], Delaware: [39.0, -75.5], Florida: [28.6, -82.4],
  Georgia: [32.6, -83.4], Hawaii: [20.3, -156.4], Idaho: [44.4, -114.6],
  Illinois: [40.0, -89.2], Indiana: [39.9, -86.3], Iowa: [42.0, -93.5],
  Kansas: [38.5, -98.4], Kentucky: [37.5, -85.3], Louisiana: [31.0, -92.0],
  Maine: [45.4, -69.2], Maryland: [39.0, -76.8], Massachusetts: [42.3, -71.8],
  Michigan: [44.3, -85.4], Minnesota: [46.3, -94.3], Mississippi: [32.7, -89.7],
  Missouri: [38.4, -92.5], Montana: [47.0, -109.6], Nebraska: [41.5, -99.8],
  Nevada: [39.3, -116.6], "New Hampshire": [43.7, -71.6], "New Jersey": [40.2, -74.7],
  "New Mexico": [34.4, -106.1], "New York": [42.9, -75.5], "North Carolina": [35.6, -79.4],
  "North Dakota": [47.5, -100.3], Ohio: [40.3, -82.8], Oklahoma: [35.6, -97.5],
  Oregon: [43.9, -120.6], Pennsylvania: [40.9, -77.8], "Rhode Island": [41.7, -71.5],
  "South Carolina": [33.9, -80.9], "South Dakota": [44.4, -100.2], Tennessee: [35.9, -86.4],
  Texas: [31.5, -99.3], Utah: [39.3, -111.7], Vermont: [44.1, -72.7],
  Virginia: [37.5, -78.8], Washington: [47.4, -120.5], "West Virginia": [38.6, -80.6],
  Wisconsin: [44.6, -89.9], Wyoming: [43.0, -107.5],
};

// Approximate geographic centroids (lat, lon) for the COUNTRIES list in
// lib/options.ts. Keyed by the exact country name (matches signups_by_country).
// "United States" is intentionally omitted: US families are plotted by state
// (STATE_CENTROIDS above), so a single national US pin would double-plot them.
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  Argentina: [-38.4, -63.6], Australia: [-25.3, 133.8], Austria: [47.5, 14.6],
  Bangladesh: [23.7, 90.4], Belgium: [50.5, 4.5], Brazil: [-14.2, -51.9],
  Canada: [56.1, -106.3], Chile: [-35.7, -71.5], China: [35.9, 104.2],
  Colombia: [4.6, -74.3], "Czech Republic": [49.8, 15.5], Denmark: [56.3, 9.5],
  Egypt: [26.8, 30.8], Finland: [61.9, 25.7], France: [46.2, 2.2],
  Germany: [51.2, 10.4], Greece: [39.1, 21.8], "Hong Kong": [22.3, 114.2],
  Hungary: [47.2, 19.5], India: [20.6, 79.0], Indonesia: [-0.8, 113.9],
  Ireland: [53.4, -8.2], Israel: [31.0, 34.9], Italy: [41.9, 12.6],
  Japan: [36.2, 138.3], Kenya: [-0.0, 37.9], Malaysia: [4.2, 101.9],
  Mexico: [23.6, -102.6], Netherlands: [52.1, 5.3], "New Zealand": [-40.9, 174.9],
  Nigeria: [9.1, 8.7], Norway: [60.5, 8.5], Pakistan: [30.4, 69.3],
  Peru: [-9.2, -75.0], Philippines: [12.9, 121.8], Poland: [51.9, 19.1],
  Portugal: [39.4, -8.2], Qatar: [25.4, 51.2], Romania: [45.9, 25.0],
  Russia: [61.5, 105.3], "Saudi Arabia": [23.9, 45.1], Singapore: [1.4, 103.8],
  "South Africa": [-30.6, 22.9], "South Korea": [35.9, 127.8], Spain: [40.5, -3.7],
  Sweden: [60.1, 18.6], Switzerland: [46.8, 8.2], Taiwan: [23.7, 121.0],
  Thailand: [15.9, 100.9], Turkey: [38.9, 35.2], Ukraine: [48.4, 31.2],
  "United Arab Emirates": [23.4, 53.8], "United Kingdom": [55.4, -3.4],
  Vietnam: [14.1, 108.3],
};

// Turn a {place: count} map into geo markers via `centroids` (unknown names
// dropped). Internal helper shared by US-state and country plotting.
function markersFrom(
  byPlace: Record<string, number>,
  centroids: Record<string, [number, number]>,
  out: Marker[],
): void {
  for (const [name, count] of Object.entries(byPlace)) {
    const c = centroids[name];
    if (!c || !count) continue;
    out.push({ name, lat: c[0], lon: c[1], count });
  }
}

// Build world-map markers from a {state: count} map and, optionally, a
// {country: count} map. US families plot by state; international families plot by
// country centroid. "United States" in `byCountry` is skipped (US is already
// covered by `byState`, so it never double-plots). Unknown names are dropped and
// the result is sorted largest-first. Backward-compatible: calling with just
// `byState` is unchanged. Projection to pixels happens in WorldMap (d3-geo).
export function buildMarkers(
  byState: Record<string, number>,
  byCountry: Record<string, number> = {},
): Marker[] {
  const out: Marker[] = [];
  markersFrom(byState, STATE_CENTROIDS, out);
  // "United States" is excluded from COUNTRY_CENTROIDS, so a US entry here is a
  // no-op — US families remain plotted by state, never a duplicate national pin.
  markersFrom(byCountry, COUNTRY_CENTROIDS, out);
  return out.sort((a, b) => b.count - a.count);
}
