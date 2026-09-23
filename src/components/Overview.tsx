import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from '../context/LocationContext';

interface MapLayer { id: string; label: string; windyLayer: string; }

interface StationData {
  name: string;
  lat: number;
  lon: number;
  temp: number | null;
  feelsLike: number | null;
  condition: string;
  humidity: number | null;
  windSpeed: number | null;
  observationTime: string | null; // ISO string from Open-Meteo
}

const mapLayers: MapLayer[] = [
  { id: 'radar',     label: 'Radar',       windyLayer: 'radar' },
  { id: 'satellite', label: 'Satellite',   windyLayer: 'satellite' },
  { id: 'wind',      label: 'Wind',        windyLayer: 'wind' },
  { id: 'temp',      label: 'Temperature', windyLayer: 'temp' },
  { id: 'rain',      label: 'Rain',        windyLayer: 'rain' },
];

function wmoCondition(code: number): string {
  if (code === 0)              return 'Clear';
  if (code === 1)              return 'Mainly Clear';
  if (code === 2)              return 'Partly Cloudy';
  if (code === 3)              return 'Overcast';
  if ([45,48].includes(code)) return 'Foggy';
  if ([51,53,55].includes(code)) return 'Drizzle';
  if ([61,63,65].includes(code)) return 'Rain';
  if ([71,73,75].includes(code)) return 'Snow';
  if ([80,81,82].includes(code)) return 'Showers';
  if ([95,96,99].includes(code)) return 'Thunderstorm';
  return 'Partly Cloudy';
}

function wmoEmoji(code: number): string {
  if (code === 0)              return '☀️';
  if (code === 1)              return '🌤️';
  if (code === 2)              return '⛅';
  if (code === 3)              return '☁️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55].includes(code)) return '🌦️';
  if ([61,63,65].includes(code)) return '🌧️';
  if ([71,73,75].includes(code)) return '❄️';
  if ([80,81,82].includes(code)) return '🌦️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '🌡️';
}

// Open-Meteo: current conditions + apparent_temperature for feels-like
async function fetchConditions(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo error');
  const data = await res.json();
  const c = data.current;
  return {
    temp:            Math.round(c.temperature_2m),
    feelsLike:       Math.round(c.apparent_temperature),
    humidity:        c.relative_humidity_2m as number,
    windSpeed:       Math.round(c.wind_speed_10m),
    condition:       wmoCondition(c.weather_code),
    emoji:           wmoEmoji(c.weather_code),
    observationTime: c.time as string, // local ISO from API e.g. "2024-06-14T15:00"
  };
}

// Named nearby points — give them real city names relative to Jacksonville
// but offsets small enough to stay within the general region
const NEARBY = [
  { name: 'Fernandina Beach', dLat:  0.47, dLon:  0.14 },
  { name: 'St. Augustine',    dLat: -0.43, dLon:  0.07 },
  { name: 'Orange Park',      dLat: -0.08, dLon: -0.18 },
  { name: 'Green Cove Spgs',  dLat: -0.25, dLon: -0.10 },
  { name: 'Palm Valley',      dLat:  0.10, dLon:  0.28 },
];

const REFRESH_SECS = 15 * 60; // 15 min

const Overview: React.FC = () => {
  const { location } = useLocation();
  const [selectedLayer, setSelectedLayer] = useState('radar');
  const [stations, setStations]   = useState<StationData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAllStations = useCallback(async () => {
    setLoading(true);
    const points = [
      { name: location.city, lat: location.lat, lon: location.lon },
      ...NEARBY.map(o => ({
        name: o.name,
        lat: location.lat + o.dLat,
        lon: location.lon + o.dLon,
      })),
    ];

    const results = await Promise.allSettled(
      points.map(p => fetchConditions(p.lat, p.lon))
    );

    setStations(
      results.map((r, i) =>
        r.status === 'fulfilled'
          ? { name: points[i].name, lat: points[i].lat, lon: points[i].lon, ...r.value }
          : { name: points[i].name, lat: points[i].lat, lon: points[i].lon,
              temp: null, feelsLike: null, humidity: null, windSpeed: null,
              condition: 'Unavailable', emoji: '—', observationTime: null }
      )
    );

    setLastFetch(new Date());
    setCountdown(REFRESH_SECS);
    setLoading(false);
  }, [location.lat, location.lon, location.city]);

  // Auto-refresh every 15 min
  useEffect(() => {
    fetchAllStations();
    const fetchId = setInterval(fetchAllStations, REFRESH_SECS * 1000);
    return () => clearInterval(fetchId);
  }, [fetchAllStations]);

  // Countdown ticker every second
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? REFRESH_SECS : c - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lastFetch]);

  const currentLayer = mapLayers.find(l => l.id === selectedLayer) || mapLayers[0];
  const windyUrl = `https://embed.windy.com/embed2.html?lat=${location.lat}&lon=${location.lon}&detailLat=${location.lat}&detailLon=${location.lon}&zoom=8&level=surface&overlay=${currentLayer.windyLayer}&menu=false&message=false&marker=false&calendar=false&pressure=false&type=map&location=coordinates&detail=false&metricWind=mph&metricTemp=%C2%B0F&radarRange=-1`;

  const main = stations[0];

  // Format "2024-06-14T15:00" → "3:00 PM"
  function fmtObsTime(iso: string | null): string {
    if (!iso) return '—';
    try {
      const [, timePart] = iso.split('T');
      const [hStr, mStr] = timePart.split(':');
      const h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${mStr} ${ampm}`;
    } catch { return '—'; }
  }

  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = countdown % 60;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Live Map */}
      <div className="lg:col-span-2">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-lg">Live Regional Weather Map</h2>
              <p className="text-sm text-slate-400">Centered on {location.label}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {mapLayers.map(layer => (
                <button
                  key={layer.id}
                  onClick={() => setSelectedLayer(layer.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    selectedLayer === layer.id
                      ? 'bg-white text-slate-900'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {layer.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full" style={{ height: '520px' }}>
            <iframe
              key={`${selectedLayer}-${location.zip}`}
              src={windyUrl}
              frameBorder="0"
              className="w-full h-full"
              title="Live Weather Map"
              allow="fullscreen"
            />
          </div>
          <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Live data from Windy.com • Zoom and pan freely</span>
            <span className="font-mono">{location.lat.toFixed(4)}°N • {Math.abs(location.lon).toFixed(4)}°W</span>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">

        {/* Current Conditions hero card */}
        <div className="bg-gradient-to-br from-blue-950 to-slate-900 rounded-2xl border border-blue-900/50 p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-blue-400 font-semibold tracking-wider uppercase mb-1">
                {location.city}, {location.state} · {location.zip}
              </div>
              {loading || !main ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                  <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  Loading…
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-6xl font-bold tabular-nums tracking-tighter leading-none">
                      {main.temp ?? '—'}
                    </span>
                    <span className="text-2xl text-slate-400 mb-1">°F</span>
                  </div>
                  <div className="mt-1 text-base text-slate-200">{main.condition}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <div className="text-slate-400">Feels like</div>
                      <div className="font-semibold text-sm mt-0.5">{main.feelsLike ?? '—'}°</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <div className="text-slate-400">Humidity</div>
                      <div className="font-semibold text-sm mt-0.5">{main.humidity ?? '—'}%</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <div className="text-slate-400">Wind</div>
                      <div className="font-semibold text-sm mt-0.5">{main.windSpeed ?? '—'} mph</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[10px] text-slate-600 flex items-center gap-2">
                    <span>Obs: {fmtObsTime(main.observationTime)}</span>
                    <span>·</span>
                    <span>Open-Meteo</span>
                  </div>
                </>
              )}
            </div>
            {!loading && main && (
              <span className="text-4xl mt-1">{(main as any).emoji ?? ''}</span>
            )}
          </div>
        </div>

        {/* Regional stations */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <span>📍</span> Regional Conditions
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              {lastFetch && (
                <span>
                  Updated {lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <span className="font-mono text-slate-600">
                ↺ {countdownMins}:{String(countdownSecs).padStart(2, '0')}
              </span>
              <button
                onClick={fetchAllStations}
                className="text-blue-400 hover:text-blue-300 transition-colors"
                title="Refresh now"
              >
                🔄
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
              <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
              Fetching live conditions…
            </div>
          )}

          {!loading && (
            <div className="space-y-1.5">
              {stations.map((s, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                    idx === 0
                      ? 'bg-blue-900/20 border border-blue-800/40'
                      : 'bg-slate-800/50 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{(s as any).emoji ?? '🌡️'}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-xs truncate">
                        {idx === 0 && <span className="text-blue-400 mr-1">★</span>}
                        {s.name}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <span>{s.condition}</span>
                        {s.observationTime && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{fmtObsTime(s.observationTime)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-lg font-bold tabular-nums leading-tight">
                      {s.temp !== null ? `${s.temp}°` : '—'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {s.feelsLike !== null ? `feels ${s.feelsLike}°` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 text-[10px] text-slate-600 text-center">
            Source: Open-Meteo • Auto-refreshes every 15 min
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
