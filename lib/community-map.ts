// Pure helpers for the /community world map. The signup form captures US state
// (no country yet), so today the pins land over North America; the real world
// map makes room for the community to grow globally (OHS is an online school).

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

// Turn a {stateName: count} map into geo markers (unknown names dropped), largest
// first. Projection to pixel space happens in the WorldMap component (d3-geo).
export function buildMarkers(byState: Record<string, number>): Marker[] {
  const out: Marker[] = [];
  for (const [name, count] of Object.entries(byState)) {
    const c = STATE_CENTROIDS[name];
    if (!c) continue;
    out.push({ name, lat: c[0], lon: c[1], count });
  }
  return out.sort((a, b) => b.count - a.count);
}
