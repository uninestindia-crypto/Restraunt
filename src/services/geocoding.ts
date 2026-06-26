// @ts-nocheck
import { getSetting } from '../db/database';

const USER_AGENT = 'TheTaste-RestaurantOS/4.0.0 (contact: nextgenos-dev@example.com)';

/**
 * Request device geolocation coordinates
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
export function getCurrentCoordinates() {
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
  const googleKey = await getSetting('googleMapsApiKey');

  if (googleKey && googleKey.trim()) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results.length > 0) {
        return {
          address: data.results[0].formatted_address,
          details: data.results[0]
        };
      }
      throw new Error(data.error_message || data.status);
    } catch (err) {
      console.warn('[Geocoding] Google Reverse Geocoding failed, falling back to OSM:', err);
    }
  }

  // Graceful fallback to free OpenStreetMap Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': USER_AGENT
      }
    });
    
    if (!res.ok) throw new Error(`OSM Server returned status ${res.status}`);
    const data = await res.json();
    return {
      address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      details: data
    };
  } catch (err) {
    console.error('[Geocoding] OSM Nominatim reverse geocode failed:', err);
    return {
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)} (Coordinates detected)`,
      details: { lat, lon: lng }
    };
  }
}

/**
 * Fetch autocomplete address candidates matching query
 * @param {string} query 
 * @returns {Promise<Array<{description: string, lat: number, lon: number, placeId: string}>>}
 */
export async function autocompleteAddress(query) {
  if (!query || query.trim().length < 3) return [];
  const googleKey = await getSetting('googleMapsApiKey');

  if (googleKey && googleKey.trim()) {
    try {
      // NOTE: Direct Google API endpoint calls from browsers trigger CORS. 
      // If client has a maps key, we recommend loading the Google Maps script 
      // and using AutocompleteService, but for pure HTTP fallback, we can use OSM.
      console.log('[Geocoding] Google Maps API key detected. Querying via OSM first for simple HTTP integration...');
    } catch (err) {
      // ignore
    }
  }

  // Query OpenStreetMap Nominatim search API
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&addressdetails=1&limit=5`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': USER_AGENT
      }
    });

    if (!res.ok) throw new Error(`OSM Server returned status ${res.status}`);
    const data = await res.json();
    
    return data.map(item => ({
      description: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      placeId: `osm-${item.place_id}`
    }));
  } catch (err) {
    console.error('[Geocoding] OSM Nominatim search failed:', err);
    return [];
  }
}
