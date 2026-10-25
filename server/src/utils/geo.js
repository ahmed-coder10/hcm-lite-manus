const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function withinRadius(point, center, radiusMeters) {
  if (!point || !center) return { allowed: false, distance: null };
  const distance = haversineMeters(point, center);
  return { allowed: distance <= Number(radiusMeters || 0), distance };
}

export const validCoord = (lat, lng) =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
