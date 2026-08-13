
/**
 * Request device geolocation coordinates
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
export function getCurrentCoordinates(): Promise<{ latitude: number; longitude: number; accuracy?: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let msg = 'Failed to get location: ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg += 'Permission denied by user.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            msg += 'Request timed out.';
            break;
          default:
            msg += error.message;
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Reverse geocode latitude and longitude to a readable address string
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<{address: string, details: object}>}
 */
export async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid location coordinates.');
  }

  // Keep precise customer coordinates in the ordering flow instead of sending
  // them to a third-party API from the browser. The customer supplies the
  // deliverable street address manually.
  return {
    address: '',
    details: { lat: latitude, lon: longitude, source: 'device' }
  };
}

/**
 * Fetch autocomplete address candidates matching query
 * @param {string} query 
 * @returns {Promise<Array<{description: string, lat: number, lon: number, placeId: string}>>}
 */
export async function autocompleteAddress(query) {
  // Public Nominatim does not permit client-side autocomplete, and a Google
  // web-service key must not be stored in browser settings. Manual entry is the
  // deterministic launch-safe path until an authenticated provider is added.
  void query;
  return [];
}
