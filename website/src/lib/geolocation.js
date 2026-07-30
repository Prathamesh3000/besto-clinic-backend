/**
 * Get the user's current location via the browser Geolocation API.
 * Resolves with { lat, lon } or rejects on error/denial.
 */
export function getUserLocation(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300_000 },
    );
  });
}
