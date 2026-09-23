import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from '../context/LocationContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrafficEvent {
  id: string;
  description: string;
  type: string;
  severity: string;
  eventTypeDesc: string;
  county: string;
  highway: string;
  direction: string;
  name: string;
  crossstreet: string;
  lat: number;
  lon: number;
  updated: string;
}

type SpcDay = 1 | 2 | 3;
type SpcView = 'categorical' | 'tornado' | 'hail' | 'wind';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, { dot: string; badge: string; row: string }> = {
  critical: { dot: 'bg-red-500',    badge: 'bg-red-900/60 text-red-300 border-red-700',    row: 'border-red-800/40'    },
  major:    { dot: 'bg-orange-500', badge: 'bg-orange-900/60 text-orange-300 border-orange-700', row: 'border-orange-800/40' },
  moderate: { dot: 'bg-yellow-400', badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-700', row: 'border-yellow-800/40' },
  minor:    { dot: 'bg-blue-400',   badge: 'bg-blue-900/60 text-blue-300 border-blue-700',   row: 'border-slate-700'    },
};

function severityStyle(s: string) {
  return SEVERITY_STYLES[s?.toLowerCase()] ?? SEVERITY_STYLES.minor;
}

function eventIcon(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('accident') || t.includes('crash')) return '💥';
  if (t.includes('construct') || t.includes('road work')) return '🚧';
  if (t.includes('debris'))  return '🪨';
  if (t.includes('flood') || t.includes('water')) return '🌊';
  if (t.includes('fire'))    return '🔥';
  if (t.includes('weather')) return '⛈️';
  if (t.includes('hazard'))  return '⚠️';
  if (t.includes('closure') || t.includes('closed')) return '🚫';
  return '🚗';
}

function dirLabel(d: string): string {
  const map: Record<string, string> = { n:'NB', s:'SB', e:'EB', w:'WB', nb:'NB', sb:'SB', eb:'EB', wb:'WB' };
  return map[d?.toLowerCase()] ?? d?.toUpperCase() ?? '';
}

// SPC image URLs — all are stable aliases, no timestamp needed
function spcImageUrl(day: SpcDay, view: SpcView, bust: number): string {
  const base = 'https://www.spc.noaa.gov/products/outlook/';
  if (view === 'categorical') return `${base}day${day}otlk.png?t=${bust}`;
  const layer = view === 'tornado' ? 'torn' : view === 'hail' ? 'hail' : 'wind';
  return `${base}day1probotlk_${layer}.png?t=${bust}`;
}

// ── Main Component ────────────────────────────────────────────────────────────

const Severe: React.FC = () => {
  const { location } = useLocation();

  // ── Traffic state ──────────────────────────────────────────────────────────
  const [events,        setEvents]       = useState<TrafficEvent[]>([]);
  const [trafficLoading,setTrafficLoad]  = useState(true);
  const [trafficError,  setTrafficError] = useState<string | null>(null);
  const [trafficFilter, setTrafficFilter]= useState<'all' | 'accident' | 'construction' | 'closure'>('all');
  const [lastTrafficFetch, setLastTrafficFetch] = useState<Date | null>(null);

  // ── SPC state ──────────────────────────────────────────────────────────────
  const [spcDay,    setSpcDay]   = useState<SpcDay>(1);
  const [spcView,   setSpcView]  = useState<SpcView>('categorical');
  const [spcBust,   setSpcBust]  = useState(() => Date.now());
  const [spcLoaded, setSpcLoaded]= useState(false);
  const [spcError,  setSpcError] = useState(false);

  // ── Lightning state ────────────────────────────────────────────────────────
  const [lightningRange, setLightningRange] = useState<1 | 2 | 3>(1); // hours

  // ── Fetch traffic events from FDOT DIVAS API ───────────────────────────────
  const fetchTraffic = useCallback(async () => {
    setTrafficLoad(true);
    setTrafficError(null);
    try {
      // Bounding box ±0.75° (~50 miles) around user location
      const pad = 0.75;
      const bbox = {
        xmin: location.lon - pad,
        ymin: location.lat - pad,
        xmax: location.lon + pad,
        ymax: location.lat + pad,
      };
      const geomParam = encodeURIComponent(JSON.stringify(bbox));
      const fields = [
        'id','descriptionen','type','severity','eventtypedesc',
        'county','highway','direction','name','crossstreet',
        'latitude','longitude','datalastupdatedat',
      ].join(',');

      const url =
        `https://gis.fdot.gov/arcgis/rest/services/DIVAS_GetEvent/FeatureServer/0/query` +
        `?where=1%3D1` +
        `&geometry=${geomParam}` +
        `&geometryType=esriGeometryEnvelope` +
        `&spatialRel=esriSpatialRelIntersects` +
        `&outFields=${encodeURIComponent(fields)}` +
        `&f=json` +
        `&resultRecordCount=100`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`FDOT API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const parsed: TrafficEvent[] = (data.features ?? []).map((f: any) => {
        const a = f.attributes;
        return {
          id:          a.id ?? a.oid,
          description: a.descriptionen ?? '',
          type:        a.type ?? '',
          severity:    a.severity ?? 'minor',
          eventTypeDesc: a.eventtypedesc ?? '',
          county:      a.county ?? '',
          highway:     a.highway ?? '',
          direction:   a.direction ?? '',
          name:        a.name ?? '',
          crossstreet: a.crossstreet ?? '',
          lat:         a.latitude ?? 0,
          lon:         a.longitude ?? 0,
          updated:     a.datalastupdatedat ?? '',
        };
      });

      // Sort: severity order
      const sevOrder: Record<string, number> = { critical:0, major:1, moderate:2, minor:3 };
      parsed.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

      setEvents(parsed);
      setLastTrafficFetch(new Date());
    } catch (e: any) {
      setTrafficError(e.message ?? 'Failed to load traffic events');
    } finally {
      setTrafficLoad(false);
    }
  }, [location.lat, location.lon]);

  useEffect(() => {
    fetchTraffic();
    const id = setInterval(fetchTraffic, 3 * 60 * 1000); // refresh every 3 min
    return () => clearInterval(id);
  }, [fetchTraffic]);

  // Filter events
  const filteredEvents = events.filter(e => {
    if (trafficFilter === 'all') return true;
    const t = (e.eventTypeDesc + ' ' + e.type).toLowerCase();
    if (trafficFilter === 'accident')    return t.includes('accident') || t.includes('crash');
    if (trafficFilter === 'construction')return t.includes('construct') || t.includes('road work');
    if (trafficFilter === 'closure')     return t.includes('clos') || t.includes('blockage');
    return true;
  });

  const totalByType = {
    accident:     events.filter(e => (e.eventTypeDesc + e.type).toLowerCase().match(/accident|crash/)).length,
    construction: events.filter(e => (e.eventTypeDesc + e.type).toLowerCase().match(/construct|road work/)).length,
    closure:      events.filter(e => (e.eventTypeDesc + e.type).toLowerCase().match(/clos|blockage/)).length,
  };

  return (
    <div className="space-y-6">

      {/* ── SPC Convective Outlook ─────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span>🌪️</span> SPC Severe Weather Outlook
            </h2>
            <p className="text-sm text-slate-400">Storm Prediction Center · Updated several times daily</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Day selector */}
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {([1, 2, 3] as SpcDay[]).map(d => (
                <button
                  key={d}
                  onClick={() => { setSpcDay(d); setSpcLoaded(false); setSpcError(false); if (d > 1) setSpcView('categorical'); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-all ${
                    spcDay === d ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Day {d}
                </button>
              ))}
            </div>
            {/* View selector (probability layers only available Day 1) */}
            {spcDay === 1 && (
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                {(['categorical', 'tornado', 'hail', 'wind'] as SpcView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => { setSpcView(v); setSpcLoaded(false); setSpcError(false); }}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                      spcView === v ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {v === 'categorical' ? 'Overall' : v === 'tornado' ? '🌪 Tornado' : v === 'hail' ? '🧊 Hail' : '💨 Wind'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setSpcBust(Date.now()); setSpcLoaded(false); setSpcError(false); }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
            >🔄 Refresh</button>
          </div>
        </div>

        <div className="relative bg-slate-950" style={{ minHeight: 340 }}>
          {!spcLoaded && !spcError && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 text-slate-400 text-sm z-10">
              <div className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
              Loading SPC outlook…
            </div>
          )}
          {spcError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm z-10 p-8 text-center">
              <span className="text-3xl">🌪️</span>
              <div>Could not load SPC image. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">View on SPC ↗</a></div>
            </div>
          )}
          <img
            key={`${spcDay}-${spcView}-${spcBust}`}
            src={spcImageUrl(spcDay, spcView, spcBust)}
            alt={`SPC Day ${spcDay} ${spcView} outlook`}
            className={`w-full object-contain transition-opacity duration-300 ${spcLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ maxHeight: 520 }}
            onLoad={() => { setSpcLoaded(true); setSpcError(false); }}
            onError={() => { setSpcError(true); setSpcLoaded(false); }}
          />
        </div>

        <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
          <span>Source: NOAA Storm Prediction Center · <span className="text-slate-400">www.spc.noaa.gov</span></span>
          <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            Full Interactive SPC Map ↗
          </a>
        </div>
      </div>

      {/* ── Lightning Map ───────────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span>⚡</span> Live Lightning Strikes
            </h2>
            <p className="text-sm text-slate-400">Real-time lightning detection · Blitzortung.org global network</p>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(h => (
              <button
                key={h}
                onClick={() => setLightningRange(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  lightningRange === h ? 'bg-yellow-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 480 }}>
          <iframe
            key={`lightning-${lightningRange}`}
            src={`https://map.blitzortung.org/#7/${location.lat.toFixed(2)}/${location.lon.toFixed(2)}`}
            className="w-full h-full border-0"
            title="Live Lightning Map"
            allow="fullscreen"
          />
        </div>
        <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>⚡ Strikes update every few seconds · Centered on {location.label}</span>
          <a href="https://map.blitzortung.org/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            Full Map ↗
          </a>
        </div>
      </div>

      {/* ── FL511 Traffic Incidents ─────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span>🚗</span> Live Traffic Incidents
              {events.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-600/80 text-white text-xs font-bold">
                  {events.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-400">
              FDOT DIVAS · ~50mi radius of {location.label}
              {lastTrafficFetch && (
                <span className="ml-2 text-slate-600">
                  · Updated {lastTrafficFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type filter pills */}
            {(['all', 'accident', 'construction', 'closure'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTrafficFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  trafficFilter === f
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {f === 'all'          ? `All (${events.length})` :
                 f === 'accident'     ? `💥 Accidents (${totalByType.accident})` :
                 f === 'construction' ? `🚧 Construction (${totalByType.construction})` :
                                        `🚫 Closures (${totalByType.closure})`}
              </button>
            ))}
            <button
              onClick={fetchTraffic}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs transition-all"
            >🔄</button>
          </div>
        </div>

        <div className="p-4">
          {trafficLoading && (
            <div className="flex items-center justify-center gap-3 text-slate-400 text-sm py-12">
              <div className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
              Fetching live traffic events from FDOT…
            </div>
          )}
          {trafficError && !trafficLoading && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-400">
              ⚠️ {trafficError}
            </div>
          )}
          {!trafficLoading && !trafficError && filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="text-4xl">🟢</span>
              <div className="font-semibold text-slate-300">No active incidents within ~50 miles</div>
              <div className="text-sm text-slate-500">Roads are clear · Refreshes every 3 minutes</div>
            </div>
          )}
          {!trafficLoading && filteredEvents.length > 0 && (
            <div className="space-y-2">
              {filteredEvents.map(ev => {
                const s = severityStyle(ev.severity);
                return (
                  <div
                    key={ev.id}
                    className={`flex gap-3 px-4 py-3 rounded-xl border bg-slate-800/40 ${s.row}`}
                  >
                    {/* Severity dot */}
                    <div className="flex flex-col items-center pt-1 shrink-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-base">{eventIcon(ev.eventTypeDesc)}</span>
                        <span className="font-semibold text-sm text-white">
                          {ev.highway}{ev.direction ? ` ${dirLabel(ev.direction)}` : ''}{ev.name ? ` · ${ev.name}` : ''}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize ${s.badge}`}>
                          {ev.severity}
                        </span>
                        {ev.county && (
                          <span className="text-[10px] text-slate-500">{ev.county} Co.</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{ev.description}</p>
                      {ev.updated && (
                        <div className="text-[10px] text-slate-600 mt-1">
                          Updated: {ev.updated}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-center text-[10px] text-slate-600 pt-2">
                Source: FDOT DIVAS · All Hazards Traffic Management · Auto-refreshes every 3 min
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>Data: Florida DIVAS (Dynamic Incident & Variable Alert System) — gis.fdot.gov</span>
          <a href="https://fl511.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            FL511 Full Map ↗
          </a>
        </div>
      </div>

    </div>
  );
};

export default Severe;
