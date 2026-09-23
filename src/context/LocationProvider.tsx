import React, { useState, useCallback } from 'react';
import { LocationContext, DEFAULT_LOCATION, UserLocation } from './LocationContext';

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<UserLocation>(() => {
    try {
      const saved = localStorage.getItem('weatherDashLocation');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Drop stale cache if zones are in old single-zone format
        if (parsed.zip === '32257' && !parsed.nwsZone?.includes(',')) {
          localStorage.removeItem('weatherDashLocation');
          return DEFAULT_LOCATION;
        }
        return parsed;
      }
      return DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  });

  const [loading, setLoading] = useState(false);

  const updateZip = useCallback(async (zip: string): Promise<string | null> => {
    if (!/^\d{5}$/.test(zip)) return 'Please enter a valid 5-digit ZIP code.';
    setLoading(true);
    try {
      const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!geoRes.ok) return 'ZIP code not found. Please try another.';
      const geoData = await geoRes.json();
      const place = geoData.places?.[0];
      if (!place) return 'No location data for that ZIP code.';

      const lat = parseFloat(place.latitude);
      const lon = parseFloat(place.longitude);
      const city = place['place name'];
      const state = place['state abbreviation'];

      // Get all three NWS zone types so we catch heat, flood, and severe wx alerts
      let nwsZone = 'FLZ325,FLC031';
      try {
        const nwsRes = await fetch(
          `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
          { headers: { 'User-Agent': 'WeatherDashboard/1.0' } }
        );
        if (nwsRes.ok) {
          const nwsData = await nwsRes.json();
          const props = nwsData.properties ?? {};
          const zones = [props.forecastZone, props.county, props.fireWeatherZone]
            .filter(Boolean)
            .map((u: string) => u.split('/').pop())
            .filter(Boolean);
          if (zones.length > 0) nwsZone = zones.join(',');
        }
      } catch { /* keep fallback */ }

      const newLoc: UserLocation = {
        zip, lat, lon, city, state, nwsZone,
        label: `${city}, ${state} ${zip}`,
      };
      setLocation(newLoc);
      localStorage.setItem('weatherDashLocation', JSON.stringify(newLoc));
      return null;
    } catch (e: any) {
      return e.message ?? 'Failed to look up ZIP code.';
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <LocationContext.Provider value={{ location, updateZip, loading }}>
      {children}
    </LocationContext.Provider>
  );
};
