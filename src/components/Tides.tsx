import React, { useState, useEffect } from 'react';

interface TidePrediction {
  t: string; // "2024-09-01 06:24"
  v: string; // "0.432"
  type: 'H' | 'L';
}

interface WaterLevel {
  t: string;
  v: string;
}

interface Station {
  id: string;
  name: string;
  state: string;
}

const STATIONS: Station[] = [
  { id: '8720218', name: 'Jacksonville', state: 'FL' },
  { id: '8720576', name: 'St. Augustine', state: 'FL' },
  { id: '8720030', name: 'Fernandina Beach', state: 'FL' },
];

function formatTideTime(t: string): string {
  const d = new Date(t.replace(' ', 'T') + ':00');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tideHeightBar(ft: number, maxFt = 6): number {
  return Math.max(4, Math.min(100, (ft / maxFt) * 100));
}

function nextTideLabel(predictions: TidePrediction[]): string {
  const now = new Date();
  const next = predictions.find(p => new Date(p.t.replace(' ', 'T') + ':00') > now);
  if (!next) return '—';
  const diff = Math.round((new Date(next.t.replace(' ', 'T') + ':00').getTime() - now.getTime()) / 60000);
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  const label = next.type === 'H' ? 'High' : 'Low';
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return `${label} tide in ${timeStr} (${parseFloat(next.v).toFixed(1)} ft)`;
}

const Tides: React.FC = () => {
  const [selectedStation, setSelectedStation] = useState<Station>(STATIONS[0]);
  const [predictions, setPredictions] = useState<TidePrediction[]>([]);
  const [waterLevel, setWaterLevel] = useState<WaterLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTides = async (station: Station) => {
    setLoading(true);
    setError(null);
    try {
      const fmt = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
      const today = fmt(new Date());
      const tomorrow = fmt(new Date(Date.now() + 86400000));
      const base = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
      const common = `&station=${station.id}&datum=MLLW&time_zone=lst_ldt&units=english&application=NEFloridaWeatherDash&format=json`;

      const [predRes, wlRes] = await Promise.all([
        fetch(`${base}?begin_date=${today}&end_date=${tomorrow}&product=predictions&interval=hilo${common}`),
        fetch(`${base}?date=today&product=water_level&interval=h${common}`),
      ]);

      if (!predRes.ok) throw new Error(`Tide predictions API ${predRes.status}`);
      const predData = await predRes.json();
      if (predData.error) throw new Error(predData.error.message ?? 'Tide API error');
      setPredictions(predData.predictions ?? []);

      if (wlRes.ok) {
        const wlData = await wlRes.json();
        setWaterLevel(wlData.data ?? []);
      }

      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tide data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTides(selectedStation);
    const id = setInterval(() => fetchTides(selectedStation), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [selectedStation]); // eslint-disable-line

  // Split predictions into today/tomorrow
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const todayPreds = predictions.filter(p => p.t.startsWith(todayStr));
  const tomorrowPreds = predictions.filter(p => p.t.startsWith(tomorrowStr));

  // Current water level (last reading)
  const currentWL = waterLevel.length > 0 ? waterLevel[waterLevel.length - 1] : null;
  const maxHeight = Math.max(...predictions.map(p => parseFloat(p.v)), 4);

  return (
    <div className="space-y-6">
      {/* Station selector */}
      <div className="flex items-center gap-3 flex-wrap">
        {STATIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedStation(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedStation.id === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🌊 {s.name}, {s.state}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => fetchTides(selectedStation)} className="text-slate-400 hover:text-white">
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
          Loading NOAA tide data for {selectedStation.name}…
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Current conditions row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">Current Level</div>
              <div className="text-2xl font-bold text-blue-400">
                {currentWL ? `${parseFloat(currentWL.v).toFixed(2)} ft` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-1">MLLW datum</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-1 md:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Next Tide</div>
              <div className="text-sm font-semibold text-slate-200">{nextTideLabel(predictions)}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">Station</div>
              <div className="text-sm font-semibold">{selectedStation.name}</div>
              <div className="text-xs text-slate-500">NOAA #{selectedStation.id}</div>
            </div>
          </div>

          {/* Tide chart — visual bar chart */}
          {predictions.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="font-semibold mb-4">48-Hour Tide Chart</h3>
              <div className="flex items-end gap-2 h-32">
                {predictions.slice(0, 16).map((p, idx) => {
                  const ft = parseFloat(p.v);
                  const pct = tideHeightBar(ft, maxHeight);
                  const isHigh = p.type === 'H';
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {isHigh ? 'High' : 'Low'} {ft.toFixed(2)}ft<br />{formatTideTime(p.t)}
                      </div>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isHigh ? 'bg-blue-500' : 'bg-blue-900/60'}`}
                        style={{ height: `${pct}%` }}
                      />
                      <div className="text-[9px] text-slate-500 text-center leading-tight">
                        {formatTideTime(p.t)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> High</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-900/60 rounded-sm inline-block" /> Low</span>
                <span className="ml-auto">Hover bars for details</span>
              </div>
            </div>
          )}

          {/* Today / Tomorrow tables */}
          <div className="grid md:grid-cols-2 gap-4">
            {[{ label: "Today's Tides", preds: todayPreds }, { label: "Tomorrow's Tides", preds: tomorrowPreds }].map(({ label, preds }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 font-semibold">{label}</div>
                {preds.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-slate-500">No data</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-800/50">
                        <th className="text-left px-5 py-2">Time</th>
                        <th className="px-5 py-2">Type</th>
                        <th className="text-right px-5 py-2">Height</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preds.map((p, i) => {
                        const ft = parseFloat(p.v);
                        const isPast = new Date(p.t.replace(' ', 'T') + ':00') < new Date();
                        return (
                          <tr key={i} className={`border-b border-slate-800/30 ${isPast ? 'opacity-40' : ''}`}>
                            <td className="px-5 py-3 font-mono">{formatTideTime(p.t)}</td>
                            <td className="px-5 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                p.type === 'H'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}>
                                {p.type === 'H' ? '▲ High' : '▼ Low'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className={`font-semibold ${p.type === 'H' ? 'text-blue-400' : 'text-slate-400'}`}>
                                {ft.toFixed(2)} ft
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-600 text-center">
            NOAA CO-OPS Tides & Currents • tidesandcurrents.noaa.gov • Station {selectedStation.id} • MLLW datum
          </div>
        </>
      )}
    </div>
  );
};

export default Tides;
