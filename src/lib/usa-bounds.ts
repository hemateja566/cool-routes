// USA-only bounds enforcement for FortyGuard USA key
// Covers CONUS + AK + HI + territories; rejects everything else
export const USA_BOUNDS = {
  minLat: 18.0, // southern HI
  maxLat: 71.5, // northern AK
  minLng: -179.5, // western Aleutians
  maxLng: -66.9, // eastern Maine
} as const;

export const USA_CONUS_BOUNDS = {
  minLat: 24.396308,
  maxLat: 49.384358,
  minLng: -125.0,
  maxLng: -66.93457,
} as const;

// Default center: Phoenix, AZ — hottest major US city
export const USA_DEFAULT_CENTER = { lat: 33.4484, lng: -112.0740 } as const;
export const USA_DEFAULT_ZOOM = 13;

export function isInUSA(lat: number, lng: number): boolean {
  return (
    lat >= USA_BOUNDS.minLat &&
    lat <= USA_BOUNDS.maxLat &&
    lng >= USA_BOUNDS.minLng &&
    lng <= USA_BOUNDS.maxLng
  );
}

export function clampToUSA(lat: number, lng: number) {
  return {
    lat: Math.min(Math.max(lat, USA_BOUNDS.minLat), USA_BOUNDS.maxLat),
    lng: Math.min(Math.max(lng, USA_BOUNDS.minLng), USA_BOUNDS.maxLng),
  };
}

export function assertInUSA(lat: number, lng: number, label = 'Location') {
  if (!isInUSA(lat, lng)) {
    throw new Error(
      `${label} [${lat.toFixed(4)}, ${lng.toFixed(4)}] is outside USA coverage. This deployment uses a USA-only FortyGuard key. Please pick a location inside the United States.`
    );
  }
}
