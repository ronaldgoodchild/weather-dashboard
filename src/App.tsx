import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from './context/LocationContext';
import { LocationProvider } from './context/LocationProvider';
import Overview  from './components/Overview';
import Hurricane from './components/Hurricane';
import Forecast  from './components/Forecast';
import Tides     from './components/Tides';
import Cameras   from './components/Cameras';
import Severe    from './components/Severe';
import NWRPlayer from './components/NWRPlayer';

// ── Types ────────────────────────────────────────────────────────────────────

interface NWSAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency: string;
  areaDesc: string;
  effective: string;
  expires: string;
  status: string;
}

type TabId = 'overview' | 'hurricane' | 'forecast' | 'tides' | 'cameras' | 'radar' | 'severe';

const TABS = [
  { id: 'overview'  as TabId, label: 'Overview',          icon: '🗺️' },
  { id: 'hurricane' as TabId, label: 'Hurricane Center',   icon: '🌀' },
  { id: 'forecast'  as TabId, label: '7-Day Forecast',    icon: '📅' },
  { id: 'tides'     as TabId, label: 'Tides & Marine',    icon: '🌊' },
  { id: 'severe'    as TabId, label: 'Severe & Traffic',  icon: '⚡' },
  { id: 'cameras'   as TabId, label: 'Cameras',           icon: '📷' },
  { id: 'radar'     as TabId, label: 'Full Radar',        icon: '📡' },
];

const SEVERITY_CONFIG = {
  Extreme: { bg: 'bg-red-950/80',    border: 'border-red-500',    badge: 'bg-red-500',    text: 'text-red-400',    icon: '🚨' },
  Severe:  { bg: 'bg-orange-950/80', border: 'border-orange-500', badge: 'bg-orange-500', text: 'text-orange-400', icon: '⚠️' },
  Moderate:{ bg: 'bg-yellow-950/80', border: 'border-yellow-500', badge: 'bg-yellow-500', text: 'text-yellow-400', icon: '⚡' },
  Minor:   { bg: 'bg-blue-950/80',   border: 'border-blue-700',   badge: 'bg-blue-600',   text: 'text-blue-400',   icon: 'ℹ️' },
  Unknown: { bg: 'bg-slate-900/80',  border: 'border-slate-600',  badge: 'bg-slate-600',  text: 'text-slate-400',  icon: '📢' },
};

function playAlertSound(severity: NWSAlert['severity'], ctx: AudioContext) {
  const now = ctx.currentTime;
  const configs: Record<NWSAlert['severity'], { freqs: number[]; dur: number; reps: number }> = {
    Extreme: { freqs: [880, 660, 880, 660, 880], dur: 0.18, reps: 3 },
    Severe:  { freqs: [660, 440, 660],           dur: 0.20, reps: 2 },
    Moderate:{ freqs: [440, 550],                dur: 0.25, reps: 1 },
    Minor:   { freqs: [350, 440],                dur: 0.30, reps: 1 },
    Unknown: { freqs: [330],                     dur: 0.30, reps: 1 },
  };
  const cfg = configs[severity];
  let offset = 0;
  for (let r = 0; r < cfg.reps; r++) {
    cfg.freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = severity === 'Extreme' || severity === 'Severe' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + cfg.dur);
      osc.start(now + offset); osc.stop(now + offset + cfg.dur + 0.05);
      offset += cfg.dur + 0.02;
    });
    offset += 0.15;
  }
}

// ── Zip Input ─────────────────────────────────────────────────────────────────

const ZipInput: React.FC = () => {
  const { location, updateZip, loading } = useLocation();
  const [input, setInput] = useState(location.zip);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const err = await updateZip(input.trim());
    if (err) { setError(err); }
    else { setSuccess(true); setTimeout(() => setSuccess(false), 2000); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">📍</span>
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          placeholder="ZIP code"
          maxLength={5}
          className={`pl-8 pr-3 py-1.5 bg-slate-800 border rounded-lg text-sm w-28 font-mono focus:outline-none focus:ring-1 transition-all ${
            error   ? 'border-red-600 focus:ring-red-600' :
            success ? 'border-emerald-600 focus:ring-emerald-600' :
                      'border-slate-700 focus:ring-blue-500'
          }`}
        />
      </div>
      <button
        type="submit"
        disabled={loading || input.length !== 5}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-all"
      >
        {loading ? '…' : success ? '✓' : 'Go'}
      </button>
      {error && <span className="text-xs text-red-400 hidden sm:block">{error}</span>}
    </form>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { location } = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alerts, setAlerts] = useState<NWSAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastAlertIds, setLastAlertIds] = useState<Set<string>>(new Set());
  const [newAlertFlash, setNewAlertFlash] = useState(false);
  // ── ntfy.sh push notifications ────────────────────────────────────────────
  const [ntfyTopic,    setNtfyTopic]   = useState(() => localStorage.getItem('ntfyTopic') ?? '');
  const [ntfyOpen,     setNtfyOpen]    = useState(false);
  const [ntfyInput,    setNtfyInput]   = useState('');
  const [ntfySending,  setNtfySending] = useState(false);
  const [ntfyTestMsg,  setNtfyTestMsg] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Save topic to localStorage whenever it changes
  const saveTopic = useCallback((topic: string) => {
    const clean = topic.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    setNtfyTopic(clean);
    localStorage.setItem('ntfyTopic', clean);
    return clean;
  }, []);

  // Send a push via ntfy.sh — use query params to avoid CORS preflight on custom headers
  const sendNtfy = useCallback(async (title: string, body: string, priority: string, tags: string) => {
    if (!ntfyTopic) return;
    try {
      const params = new URLSearchParams({ title, priority, tags });
      await fetch(`https://ntfy.sh/${ntfyTopic}?${params.toString()}`, {
        method: 'POST',
        body,
      });
    } catch { /* silently fail — don't interrupt dashboard */ }
  }, [ntfyTopic]);

  const fireNotification = useCallback((alert: NWSAlert) => {
    const priorityMap: Record<string, string> = {
      Extreme: 'urgent', Severe: 'high', Moderate: 'default', Minor: 'low', Unknown: 'low',
    };
    const tagMap: Record<string, string> = {
      Extreme: 'rotating_light,warning', Severe: 'warning', Moderate: 'cloud_with_lightning', Minor: 'information_source', Unknown: 'information_source',
    };
    sendNtfy(
      `⚠️ ${alert.event}`,
      `${alert.headline}\n\nArea: ${alert.areaDesc}\nExpires: ${alert.expires ? new Date(alert.expires).toLocaleString() : 'unknown'}`,
      priorityMap[alert.severity] ?? 'default',
      tagMap[alert.severity] ?? 'information_source',
    );
  }, [sendNtfy]);

  const testNtfy = useCallback(async () => {
    const topic = saveTopic(ntfyInput);
    if (!topic) return;
    setNtfySending(true);
    setNtfyTestMsg(null);
    try {
      const params = new URLSearchParams({ title: '✅ Weather Dashboard Connected', priority: 'default', tags: 'white_check_mark' });
      const res = await fetch(`https://ntfy.sh/${topic}?${params.toString()}`, {
        method: 'POST',
        body: `Alert notifications for ${location.label} are now active. You'll receive NWS alerts here.`,
      });
      setNtfyTestMsg(res.ok ? 'success' : 'error');
    } catch {
      setNtfyTestMsg('error');
    } finally {
      setNtfySending(false);
    }
  }, [ntfyInput, saveTopic, location.label]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    try {
      // Fetch by all three zone types (forecast + county + fire weather)
      // county zones carry heat advisories; forecast zones carry severe wx
      const res = await fetch(
        `https://api.weather.gov/alerts/active?zone=${location.nwsZone}`,
        { headers: { 'User-Agent': 'WeatherDashboard/1.0' } }
      );
      if (!res.ok) throw new Error(`NWS API ${res.status}`);
      const data = await res.json();
      const order: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
      const parsed: NWSAlert[] = (data.features ?? [])
        .map((f: any) => ({
          id: f.id, event: f.properties.event,
          headline: f.properties.headline ?? f.properties.event,
          description: f.properties.description ?? '',
          severity: f.properties.severity ?? 'Unknown',
          urgency: f.properties.urgency ?? '',
          areaDesc: f.properties.areaDesc ?? '',
          effective: f.properties.effective ?? '',
          expires: f.properties.expires ?? '',
          status: f.properties.status ?? '',
        }))
        .sort((a: NWSAlert, b: NWSAlert) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

      if (isRefresh) {
        const brandNew = parsed.filter(a => !lastAlertIds.has(a.id));
        if (brandNew.length > 0) {
          if (soundEnabled) {
            playAlertSound(brandNew[0].severity, getAudioCtx());
            setNewAlertFlash(true);
            setTimeout(() => setNewAlertFlash(false), 2000);
          }
          // Fire browser push notification for each new alert
          brandNew.forEach(a => fireNotification(a));
        }
      }
      setLastAlertIds(new Set(parsed.map(a => a.id)));
      setAlerts(parsed);
      setAlertsError(null);
    } catch (e: any) {
      setAlertsError(e.message ?? 'Failed to load alerts');
    } finally {
      setAlertsLoading(false);
    }
  }, [location.lat, location.lon, location.nwsZone, lastAlertIds, soundEnabled, getAudioCtx, fireNotification]);

  // Re-fetch alerts when location changes (new zip)
  useEffect(() => {
    setAlertsLoading(true);
    setAlerts([]);
    fetchAlerts(false);
  }, [location.lat, location.lon]); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => fetchAlerts(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const activeAlerts = alerts.filter(a => a.status !== 'Test');
  const highPriorityCount = activeAlerts.filter(a => a.severity === 'Extreme' || a.severity === 'Severe').length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* High-priority banner */}
      {highPriorityCount > 0 && (
        <div className={`w-full bg-red-600 text-white text-center py-2 text-sm font-semibold flex items-center justify-center gap-3 ${newAlertFlash ? 'animate-pulse' : ''}`}>
          🚨 {highPriorityCount} ACTIVE HIGH-PRIORITY ALERT{highPriorityCount > 1 ? 'S' : ''} — {location.label.toUpperCase()} 🚨
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">

          {/* Left — Branding */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
              <span className="text-xl">🌊</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">NE Florida Weather</h1>
                <span className="text-slate-600 text-xl font-light">·</span>
                <span className="text-xl font-bold tracking-tight text-white">RegTechES</span>
              </div>
              <p className="text-xs text-slate-400">Live Weather Dashboard • {location.label}</p>
            </div>
          </div>

          {/* Right — Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <ZipInput />
            <button
              onClick={() => { setSoundEnabled(p => !p); getAudioCtx(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-xs font-medium ${
                soundEnabled
                  ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
            </button>
            {/* ntfy.sh push notifications */}
            <div className="relative">
              <button
                onClick={() => { setNtfyOpen(p => !p); setNtfyInput(ntfyTopic); setNtfyTestMsg(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-xs font-medium ${
                  ntfyTopic
                    ? 'bg-emerald-900/40 border-emerald-600 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
                title="Send NWS alerts to your phone via ntfy.sh"
              >
                📲 {ntfyTopic ? 'Alerts ON' : 'Alert Me'}
              </button>

              {ntfyOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/70 z-[200] overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-emerald-950 to-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">📲 Push Alerts to Phone</div>
                      <div className="text-[10px] text-emerald-400">via ntfy.sh · free · no account needed</div>
                    </div>
                    <button onClick={() => setNtfyOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* How it works */}
                    <div className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-300 space-y-1.5">
                      <div className="font-semibold text-white mb-1">How to set up (30 seconds):</div>
                      <div className="flex items-start gap-2"><span className="text-emerald-400 font-bold shrink-0">1.</span><span>Install the <span className="text-white font-medium">ntfy</span> app on your phone — iOS or Android, free</span></div>
                      <div className="flex items-start gap-2"><span className="text-emerald-400 font-bold shrink-0">2.</span><span>Pick any unique topic name below (like <span className="font-mono text-yellow-300">jax-wx-ronald</span>)</span></div>
                      <div className="flex items-start gap-2"><span className="text-emerald-400 font-bold shrink-0">3.</span><span>Subscribe to that topic in the ntfy app</span></div>
                      <div className="flex items-start gap-2"><span className="text-emerald-400 font-bold shrink-0">4.</span><span>Hit <span className="text-white font-medium">Test & Save</span> — your phone buzzes instantly</span></div>
                    </div>

                    {/* Topic input */}
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-semibold">Your ntfy topic name</label>
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center bg-slate-800 border border-slate-600 rounded-lg overflow-hidden">
                          <span className="text-[10px] text-slate-500 pl-2 pr-1 shrink-0">ntfy.sh/</span>
                          <input
                            type="text"
                            value={ntfyInput}
                            onChange={e => { setNtfyInput(e.target.value); setNtfyTestMsg(null); }}
                            placeholder="your-unique-topic"
                            className="flex-1 bg-transparent py-2 pr-2 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                            maxLength={64}
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-600 mt-1">Use letters, numbers, hyphens. Make it unique — anyone who knows it can subscribe.</div>
                    </div>

                    {/* Test & Save button */}
                    <button
                      onClick={testNtfy}
                      disabled={!ntfyInput.trim() || ntfySending}
                      className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                      {ntfySending ? (<><span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Sending test…</>) : '📲 Test & Save'}
                    </button>

                    {/* Feedback */}
                    {ntfyTestMsg === 'success' && (
                      <div className="bg-emerald-950/60 border border-emerald-700 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
                        <span className="text-base">✅</span>
                        <div><div className="font-semibold">Connected! Check your phone.</div><div className="text-emerald-500 mt-0.5">NWS alerts will now push to <span className="font-mono">{ntfyTopic}</span></div></div>
                      </div>
                    )}
                    {ntfyTestMsg === 'error' && (
                      <div className="bg-red-950/60 border border-red-700 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                        <span>⚠️</span> Failed to send. Check your internet connection and try again.
                      </div>
                    )}

                    {/* Current status */}
                    {ntfyTopic && ntfyTestMsg !== 'success' && (
                      <div className="text-[10px] text-slate-500 text-center">
                        Currently sending to: <span className="font-mono text-slate-400">ntfy.sh/{ntfyTopic}</span>
                        <button onClick={() => { saveTopic(''); setNtfyInput(''); }} className="ml-2 text-red-500 hover:text-red-400">remove</button>
                      </div>
                    )}

                    {/* Links */}
                    <div className="flex gap-2">
                      <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs text-center transition-all">ntfy.sh ↗</a>
                      <a href="https://apps.apple.com/us/app/ntfy/id1625396347" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs text-center transition-all"> iOS App ↗</a>
                      <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs text-center transition-all">Android ↗</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* NWR radio player — positioned relative so dropdown anchors correctly */}
            <div className="relative">
              <NWRPlayer />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium text-xs">LIVE</span>
            </div>
            <div className="text-slate-400 font-mono text-xs">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto pb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {(tab.id === 'overview' || tab.id === 'severe') && activeAlerts.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {activeAlerts.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Alerts — overview tab only */}
        {activeTab === 'overview' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                className="font-semibold text-lg flex items-center gap-2 hover:text-slate-200"
                onClick={() => setAlertsOpen(p => !p)}
              >
                <span>⚠️</span>
                NWS Alerts — {location.city}, {location.state}
                {activeAlerts.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
                    {activeAlerts.length}
                  </span>
                )}
                <span className="text-slate-500 text-sm ml-1">{alertsOpen ? '▲' : '▼'}</span>
              </button>
              <button onClick={() => { setAlertsLoading(true); fetchAlerts(true); }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                🔄 Refresh
              </button>
            </div>
            {alertsOpen && (
              <>
                {alertsLoading && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-400 flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                    Fetching NWS alerts for {location.label}…
                  </div>
                )}
                {alertsError && !alertsLoading && (
                  <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-400">
                    ⚠️ {alertsError}
                  </div>
                )}
                {!alertsLoading && !alertsError && activeAlerts.length === 0 && (
                  <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 text-sm text-emerald-400 flex items-center gap-3">
                    <span className="text-xl">✅</span>
                    <div>
                      <div className="font-semibold">No active alerts for {location.label}</div>
                      <div className="text-emerald-500/70 text-xs mt-0.5">All clear • Refreshes every 5 minutes</div>
                    </div>
                  </div>
                )}
                {!alertsLoading && activeAlerts.length > 0 && (
                  <div className="space-y-2">
                    {activeAlerts.map(alert => {
                      const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.Unknown;
                      const isExpanded = expandedAlert === alert.id;
                      const expiresDate = alert.expires ? new Date(alert.expires) : null;
                      const isExpiringSoon = expiresDate && (expiresDate.getTime() - Date.now()) < 2 * 60 * 60 * 1000;
                      return (
                        <div key={alert.id} className={`${cfg.bg} border ${cfg.border} rounded-xl overflow-hidden`}>
                          <button
                            className="w-full text-left px-4 py-3 flex items-start gap-3"
                            onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                          >
                            <span className="text-xl mt-0.5 shrink-0">{cfg.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge} text-white uppercase tracking-wider`}>
                                  {alert.severity}
                                </span>
                                <span className="font-semibold text-sm">{alert.event}</span>
                                {isExpiringSoon && (
                                  <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-700">
                                    Expiring soon
                                  </span>
                                )}
                              </div>
                              <div className={`text-xs mt-1 ${cfg.text} line-clamp-2`}>{alert.headline}</div>
                              <div className="text-xs text-slate-500 mt-1 truncate">{alert.areaDesc}</div>
                            </div>
                            <div className="text-slate-500 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</div>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-black/20 rounded-lg p-2">
                                  <div className="text-slate-500 mb-0.5">Effective</div>
                                  <div className="text-slate-300">{alert.effective ? new Date(alert.effective).toLocaleString() : '—'}</div>
                                </div>
                                <div className="bg-black/20 rounded-lg p-2">
                                  <div className="text-slate-500 mb-0.5">Expires</div>
                                  <div className={isExpiringSoon ? 'text-yellow-400 font-semibold' : 'text-slate-300'}>
                                    {expiresDate ? expiresDate.toLocaleString() : '—'}
                                  </div>
                                </div>
                              </div>
                              <div className="bg-black/20 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                {alert.description || 'No description available.'}
                              </div>
                              <button
                                onClick={() => soundEnabled && playAlertSound(alert.severity, getAudioCtx())}
                                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                              >
                                🔔 Preview alert sound
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab content — key={location.zip} forces full remount on location change */}
        {activeTab === 'overview'  && <Overview  key={location.zip} />}
        {activeTab === 'hurricane' && <Hurricane key={location.zip} />}
        {activeTab === 'forecast'  && <Forecast  key={location.zip} />}
        {activeTab === 'tides'     && <Tides     key={location.zip} />}
        {activeTab === 'severe'    && <Severe     key={location.zip} />}
        {activeTab === 'cameras'   && <Cameras   key={location.zip} />}
        {activeTab === 'radar'     && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="font-semibold text-lg">📡 Full-Screen Live Radar — {location.label}</h2>
              <p className="text-sm text-slate-400">Interactive Windy.com radar • Animate, zoom & pan freely</p>
            </div>
            <div style={{ height: 'calc(100vh - 260px)', minHeight: '600px' }}>
              <iframe
                key={location.zip}
                src={`https://embed.windy.com/embed2.html?lat=${location.lat}&lon=${location.lon}&detailLat=${location.lat}&detailLon=${location.lon}&zoom=7&level=surface&overlay=radar&menu=true&message=true&marker=false&calendar=false&pressure=false&type=map&location=coordinates&detail=false&metricWind=mph&metricTemp=%C2%B0F&radarRange=-1`}
                frameBorder="0"
                className="w-full h-full"
                title="Full Radar"
                allow="fullscreen"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 pb-6 space-y-2">
          <div>NWS Alerts • NHC Storms • NWS Forecast • NOAA Tides • Windy.com Radar — All live, no API key required</div>
          <div className="flex items-center justify-center gap-3 pt-1">
            <span className="text-slate-700">|</span>
            <span className="text-slate-500 font-medium tracking-wide">Developed by Ronald Goodchild</span>
            <span className="text-slate-700">|</span>
            <span className="px-2 py-0.5 rounded bg-blue-900/30 border border-blue-800/40 text-blue-400 font-bold tracking-widest uppercase text-[10px]">RegTechES</span>
            <span className="text-slate-700">|</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <LocationProvider>
    <Dashboard />
  </LocationProvider>
);

export default App;
