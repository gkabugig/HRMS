// Distance + geofence maths for GPS clock-in. Pure functions so the server
// action's trust boundary (the server computes "inside the area" itself and
// never accepts that verdict from the browser) is easy to test.
export type GeoPoint = { lat: number; lng: number };

export function isValidPoint(p: { lat: unknown; lng: unknown }): p is GeoPoint {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

// Great-circle distance in metres (haversine).
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// null = no usable branch position, so no verdict (location is recorded
// but nothing is flagged).
export function evaluateGeofence(
  at: GeoPoint,
  branch: { latitude: number | null; longitude: number | null; geofence_radius_m: number } | null
): { distanceM: number; inside: boolean } | null {
  if (!branch || branch.latitude == null || branch.longitude == null) return null;
  const distanceM = Math.round(distanceMeters(at, { lat: branch.latitude, lng: branch.longitude }));
  return { distanceM, inside: distanceM <= branch.geofence_radius_m };
}
