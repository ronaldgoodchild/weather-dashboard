// Location helpers shared by the tabs so everything follows the ZIP code.

const R_MI = 3958.8;

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── NWS point lookup (office, radar, zones, nearest city name) ───────────────

export interface NwsPoint {
  office: string;
  radarStation: string;
  timeZone: string;
  zones: string[];
  city: string;
  state: string;
}

export async function fetchNwsPoint(lat: number, lon: number): Promise<NwsPoint | null> {
  try {
    const res = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { 'User-Agent': 'WeatherDashboard/1.0', Accept: 'application/geo+json' } }
    );
    if (!res.ok) return null;
    const p = (await res.json()).properties ?? {};
    const zones = [p.forecastZone, p.county, p.fireWeatherZone]
      .filter(Boolean)
      .map((u: string) => u.split('/').pop() as string)
      .filter(Boolean);
    const rel = p.relativeLocation?.properties ?? {};
    return {
      office: p.gridId ?? '',
      radarStation: p.radarStation ?? '',
      timeZone: p.timeZone ?? '',
      zones: Array.from(new Set(zones)),
      city: rel.city ?? '',
      state: rel.state ?? '',
    };
  } catch {
    return null;
  }
}

// ── GOES satellite sector that covers a location ─────────────────────────────
// Only sectors that exist on the NESDIS CDN (GOES-19 East, GOES-18 West).

export interface GoesSector {
  sat: 'GOES19' | 'GOES18';
  code: string;
  label: string;
  page: string; // STAR loop page parameters
}

export function goesSectorFor(lat: number, lon: number): GoesSector {
  const east = (code: string, label: string): GoesSector => ({
    sat: 'GOES19', code, label,
    page: `https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=${code}&band=GEOCOLOR&length=12`,
  });
  const west = (code: string, label: string): GoesSector => ({
    sat: 'GOES18', code, label,
    page: `https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G18&sector=${code}&band=GEOCOLOR&length=12`,
  });
  // Alaska / Hawaii / territories: no sector on this feed, use the nearest broad West/East view.
  if (lon < -109) return lat >= 41 ? west('pnw', 'Pacific Northwest') : west('psw', 'Pacific Southwest');
  if (lat >= 37.5 && lon >= -82) return east('ne', 'Northeast United States');
  if (lat >= 38 && lon >= -92) return east('cgl', 'Great Lakes');
  if (lat >= 38) return east('umv', 'Upper Mississippi Valley');
  if (lon < -92) return east('sp', 'Southern Plains');
  return east('se', 'Southeast United States');
}

// ── State 511 traffic sites ──────────────────────────────────────────────────

export const STATE_511: Record<string, { name: string; url: string }> = {
  FL: { name: 'FL511', url: 'https://fl511.com/' },
  GA: { name: 'Georgia 511', url: 'https://511ga.org/' },
  SC: { name: 'SC 511', url: 'https://511sc.org/' },
  NC: { name: 'DriveNC', url: 'https://drivenc.gov/' },
  AL: { name: 'ALGO Traffic', url: 'https://algotraffic.com/' },
  MS: { name: 'MDOT Traffic', url: 'https://mdottraffic.com/' },
  LA: { name: 'Louisiana 511', url: 'https://511la.org/' },
  TX: { name: 'DriveTexas', url: 'https://drivetexas.org/' },
  OK: { name: 'OK Roads', url: 'https://www.okroads.org/' },
  TN: { name: 'TDOT SmartWay', url: 'https://smartway.tn.gov/' },
  KY: { name: 'GoKY', url: 'https://goky.ky.gov/' },
  VA: { name: 'Virginia 511', url: 'https://511virginia.org/' },
  MD: { name: 'CHART Maryland', url: 'https://chart.maryland.gov/' },
  NJ: { name: 'NJ 511', url: 'https://511nj.org/' },
  NY: { name: 'NY 511', url: 'https://511ny.org/' },
  PA: { name: 'PA 511', url: 'https://www.511pa.com/' },
  CT: { name: 'CTroads', url: 'https://ctroads.org/' },
  MA: { name: 'Mass511', url: 'https://mass511.com/' },
  OH: { name: 'OHGO', url: 'https://www.ohgo.com/' },
  IN: { name: 'Indiana 511', url: 'https://511in.org/' },
  IL: { name: 'Travel Midwest', url: 'https://www.travelmidwest.com/' },
  MI: { name: 'MiDrive', url: 'https://mdotjboss.state.mi.us/MiDrive/' },
  WI: { name: 'Wisconsin 511', url: 'https://511wi.gov/' },
  MN: { name: 'MN 511', url: 'https://511mn.org/' },
  MO: { name: 'MoDOT Traveler', url: 'https://traveler.modot.org/' },
  CO: { name: 'COtrip', url: 'https://www.cotrip.org/' },
  AZ: { name: 'AZ 511', url: 'https://www.az511.com/' },
  NV: { name: 'NV Roads', url: 'https://www.nvroads.com/' },
  UT: { name: 'UDOT Traffic', url: 'https://udottraffic.utah.gov/' },
  CA: { name: 'Caltrans QuickMap', url: 'https://quickmap.dot.ca.gov/' },
  OR: { name: 'TripCheck', url: 'https://www.tripcheck.com/' },
  WA: { name: 'WSDOT Traffic', url: 'https://wsdot.com/travel/real-time/map' },
  MT: { name: 'MDT Travel Info', url: 'https://www.mdt.mt.gov/travinfo/' },
  ID: { name: 'Idaho 511', url: 'https://511.idaho.gov/' },
  WY: { name: 'WyoRoad', url: 'https://www.wyoroad.info/' },
  ND: { name: 'ND Travel Info', url: 'https://travel.dot.nd.gov/' },
  SD: { name: 'SD511', url: 'https://www.sd511.org/' },
  NE: { name: 'Nebraska 511', url: 'https://511.nebraska.gov/' },
  KS: { name: 'KanDrive', url: 'https://www.kandrive.gov/' },
  IA: { name: 'Iowa 511', url: 'https://511ia.org/' },
  AR: { name: 'IDriveArkansas', url: 'https://www.idrivearkansas.com/' },
  NM: { name: 'NMRoads', url: 'https://www.nmroads.com/' },
  WV: { name: 'WV511', url: 'https://wv511.org/' },
  ME: { name: 'New England 511', url: 'https://newengland511.org/' },
  NH: { name: 'New England 511', url: 'https://newengland511.org/' },
  VT: { name: 'New England 511', url: 'https://newengland511.org/' },
  DE: { name: 'DelDOT Traffic', url: 'https://deldot.gov/Traffic/' },
  AK: { name: 'Alaska 511', url: 'https://511.alaska.gov/' },
  HI: { name: 'Hawaii GoAkamai', url: 'https://goakamai.org/' },
};

export function state511(state: string): { name: string; url: string } {
  return (
    STATE_511[state] ?? {
      name: `${state || 'State'} 511`,
      url: `https://www.google.com/search?q=${encodeURIComponent(state + ' 511 traffic cameras')}`,
    }
  );
}
