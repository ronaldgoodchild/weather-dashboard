import { createContext, useContext } from 'react';

export interface UserLocation {
  zip: string;
  lat: number;
  lon: number;
  city: string;
  state: string;
  nwsZone: string;
  label: string;
}

export interface LocationCtx {
  location: UserLocation;
  updateZip: (zip: string) => Promise<string | null>;
  loading: boolean;
}

export const DEFAULT_LOCATION: UserLocation = {
  zip: '32202',
  lat: 30.3322,
  lon: -81.6557,
  city: 'Jacksonville',
  state: 'FL',
  nwsZone: 'FLZ325,FLC031',
  label: 'Jacksonville, FL 32202',
};

export const LocationContext = createContext<LocationCtx>({
  location: DEFAULT_LOCATION,
  updateZip: async () => null,
  loading: false,
});

export const useLocation = () => useContext(LocationContext);
