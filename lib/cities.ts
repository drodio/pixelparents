// Shape of a city suggestion produced by the CityAutocomplete component. Cities
// come live from the keyless Photon (OpenStreetMap) geocoder at query time — see
// components/city-autocomplete.tsx — so there is no bundled dataset here anymore;
// this module is just the shared type. `country`/`state` are normalized to the
// app's canonical COUNTRIES / US_STATES option strings when they match, so picking
// a suggestion can auto-fill those <select>s.
export type City = {
  name: string;
  country: string;
  // Only set for US cities whose state is one of US_STATES (drives the state select).
  state?: string;
};
