import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LocationContext, DEFAULT_LOCATION, UserLocation } from './LocationContext';
import { fetchNwsPoint } from '../utils/geo';

const STORAGE_KEY = 'weatherDashLocation';

function loadInitial(): UserLocation {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Drop stale cache if zones are in old single-zone format
      if (parsed.nwsZone === 'FLZ325') {
        localStorage.removeItem(STORAGE_KEY);
        return DEFAULT_LOCATION;
      }
      return parsed;
    }
  } catch { /* fall through */ }
  return DEFAULT_LOCATION;
}

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<UserLocation>(loadInitial);
  const [loading, setLoading] = useState(false);
  const locRef = useRef(location);
  locRef.current = location;

  const save = (loc: UserLocation) => {
    setLocation(loc);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); } catch { /* storage blocked */ }
  };

  const updateZip = useCallback(async (zipRaw: string): Promise<string | null> => {
    const zip = zipRaw.trim();
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

      // NWS point: forecast office, radar, and all three zone types (forecast, county,
      // fire weather) so heat, flood and severe-weather alerts are all caught.
      const pt = await fetchNwsPoint(lat, lon);
      if (!pt) {
        return 'The National Weather Service has no data for that ZIP code (US locations only). Try another.';
      }

      save({
        zip, lat, lon, city, state,
        nwsZone: pt.zones.length ? pt.zones.join(',') : '',
        label: `${city}, ${state} ${zip}`,
        office: pt.office,
        radarStation: pt.radarStation,
        timeZone: pt.timeZone,
      });
      return null;
    } catch (e: any) {
      return e.message ?? 'Failed to look up ZIP code.';
    } finally {
      setLoading(false);
    }
  }, []);

  // Older saved locations (and the built-in default) may lack the NWS office / radar
  // fields: fill them in once so every tab can follow the ZIP.
  useEffect(() => {
    const loc = locRef.current;
    if (loc.office && loc.radarStation) return;
    fetchNwsPoint(loc.lat, loc.lon).then(pt => {
      if (!pt || locRef.current.zip !== loc.zip) return;
      save({
        ...locRef.current,
        office: pt.office,
        radarStation: pt.radarStation,
        timeZone: pt.timeZone,
        nwsZone: locRef.current.nwsZone || pt.zones.join(','),
      });
    });
  }, []); // eslint-disable-line

  // Shareable links: https://…/weather/?zip=90210
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get('zip');
    if (z && /^\d{5}$/.test(z) && z !== locRef.current.zip) updateZip(z);
  }, [updateZip]);

  return (
    <LocationContext.Provider value={{ location, updateZip, loading }}>
      {children}
    </LocationContext.Provider>
  );
};
