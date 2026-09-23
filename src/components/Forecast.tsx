import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from '../context/LocationContext';

interface ForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  probabilityOfPrecipitation: { value: number | null };
}

interface HourlyPeriod {
  startTime: string;
  temperature: number;
  shortForecast: string;
  windSpeed: string;
  probabilityOfPrecipitation: { value: number | null };
}

function conditionEmoji(forecast: string): string {
  const f = forecast.toLowerCase();
  if (f.includes('thunderstorm') || f.includes('tstm')) return '⛈️';
  if (f.includes('tornado')) return '🌪️';
  if (f.includes('snow') || f.includes('blizzard')) return '❄️';
  if (f.includes('sleet') || f.includes('freezing')) return '🌨️';
  if (f.includes('shower') || f.includes('drizzle')) return '🌦️';
  if (f.includes('rain')) return '🌧️';
  if (f.includes('fog') || f.includes('mist')) return '🌫️';
  if (f.includes('wind') || f.includes('breezy') || f.includes('blustery')) return '💨';
  if (f.includes('partly cloudy') || f.includes('mostly sunny')) return '⛅';
  if (f.includes('mostly cloudy') || f.includes('partly sunny')) return '🌥️';
  if (f.includes('cloudy') || f.includes('overcast')) return '☁️';
  if (f.includes('sunny') || f.includes('clear')) return '☀️';
  return '🌡️';
}

const Forecast: React.FC = () => {
  const { location } = useLocation();
  const [periods, setPeriods] = useState<ForecastPeriod[]>([]);
  const [hourly, setHourly] = useState<HourlyPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [view, setView] = useState<'daily' | 'hourly'>('daily');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchedZip, setFetchedZip] = useState('');

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pointRes = await fetch(
        `https://api.weather.gov/points/${location.lat.toFixed(4)},${location.lon.toFixed(4)}`,
        { headers: { 'User-Agent': 'WeatherDashboard/1.0' } }
      );
      if (!pointRes.ok) throw new Error(`NWS points API ${pointRes.status}`);
      const pointData = await pointRes.json();
      const { forecast: forecastUrl, forecastHourly: hourlyUrl } = pointData.properties;

      const [fRes, hRes] = await Promise.all([
        fetch(forecastUrl, { headers: { 'User-Agent': 'WeatherDashboard/1.0' } }),
        fetch(hourlyUrl,   { headers: { 'User-Agent': 'WeatherDashboard/1.0' } }),
      ]);
      if (!fRes.ok) throw new Error(`Forecast API ${fRes.status}`);

      const fData = await fRes.json();
      setPeriods(fData.properties.periods ?? []);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHourly((hData.properties.periods ?? []).slice(0, 24));
      }
      setLastUpdated(new Date());
      setFetchedZip(location.zip);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, [location.lat, location.lon, location.zip]);

  useEffect(() => {
    fetchForecast();
    const id = setInterval(fetchForecast, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchForecast]);

  const dayPeriods   = periods.filter(p => p.isDaytime);
  const nightPeriods = periods.filter(p => !p.isDaytime);
  const dayPairs: [ForecastPeriod, ForecastPeriod | undefined][] = dayPeriods.map((d, i) => [d, nightPeriods[i]]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['daily', 'hourly'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                view === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}>
              {v === 'daily' ? '📅 7-Day' : '⏱️ 24-Hour'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={fetchForecast} className="text-slate-400 hover:text-white">🔄 Refresh</button>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        {location.city}, {location.state} ({location.zip}) • National Weather Service
        {fetchedZip && fetchedZip !== location.zip && (
          <span className="ml-2 text-yellow-400">⟳ Updating to new location…</span>
        )}
      </div>

      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
          Loading NWS forecast for {location.label}…
        </div>
      )}
      {error && !loading && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>
      )}

      {/* Daily */}
      {!loading && !error && view === 'daily' && (
        <div className="space-y-2">
          {dayPairs.map(([day, night], idx) => {
            const isOpen = expanded === idx;
            const precip = day.probabilityOfPrecipitation?.value;
            return (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <button className="w-full text-left px-5 py-4 flex items-center gap-4"
                  onClick={() => setExpanded(isOpen ? null : idx)}>
                  <div className="w-24 shrink-0">
                    <div className="font-semibold">{day.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(day.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-3xl w-10 text-center">{conditionEmoji(day.shortForecast)}</div>
                  <div className="flex items-baseline gap-1 w-20">
                    <span className="text-xl font-bold">{day.temperature}°</span>
                    {night && <span className="text-slate-500 text-sm">/ {night.temperature}°</span>}
                  </div>
                  <div className="flex-1 text-sm text-slate-300 hidden sm:block">{day.shortForecast}</div>
                  <div className="w-16 text-right shrink-0">
                    {precip != null && precip > 0 && (
                      <span className="text-sm font-medium text-blue-300">💧 {precip}%</span>
                    )}
                  </div>
                  <div className="w-24 text-right text-xs text-slate-400 shrink-0 hidden md:block">
                    {day.windDirection} {day.windSpeed}
                  </div>
                  <div className="text-slate-600 text-xs">{isOpen ? '▲' : '▼'}</div>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 border-t border-slate-800 pt-4 grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Day</div>
                      <p className="text-sm text-slate-300 leading-relaxed">{day.detailedForecast}</p>
                    </div>
                    {night && (
                      <div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tonight</div>
                        <p className="text-sm text-slate-300 leading-relaxed">{night.detailedForecast}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hourly */}
      {!loading && !error && view === 'hourly' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="px-4 py-3"></th>
                  <th className="text-right px-4 py-3">Temp</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Condition</th>
                  <th className="text-right px-4 py-3">Rain</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Wind</th>
                </tr>
              </thead>
              <tbody>
                {hourly.map((h, idx) => {
                  const t = new Date(h.startTime);
                  const precip = h.probabilityOfPrecipitation?.value ?? 0;
                  return (
                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs whitespace-nowrap">
                        {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {t.getHours() === 0 && <div className="text-blue-400">{t.toLocaleDateString([], { weekday: 'short' })}</div>}
                      </td>
                      <td className="px-4 py-3 text-xl">{conditionEmoji(h.shortForecast)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{h.temperature}°F</td>
                      <td className="px-4 py-3 text-slate-300 text-xs hidden sm:table-cell">{h.shortForecast}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className={`h-full rounded-full ${precip >= 70 ? 'bg-blue-500' : precip >= 40 ? 'bg-blue-600/70' : 'bg-blue-800/50'}`}
                              style={{ width: `${precip}%` }} />
                          </div>
                          <span className="text-xs text-blue-300 w-8 text-right">{precip > 0 ? `${precip}%` : ''}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400 hidden md:table-cell">{h.windSpeed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Forecast;
