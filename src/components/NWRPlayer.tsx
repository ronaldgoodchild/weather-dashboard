import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from '../context/LocationContext';
import { distanceMiles } from '../utils/geo';
import coords from '../data/nwrCoords.json';

// ── Station catalog ───────────────────────────────────────────────────────────
// wxradio.org (a service of noaaweatherradio.org) relays NOAA Weather Radio as SSL audio
// streams. Its server publishes the list of streams that are live right now; we read that
// list in the browser and keep the ones nearest the chosen ZIP. Stream names look like
// "FL-Palatka-WNG522" (state-city-callsign). The table in data/nwrCoords.json maps each
// city to coordinates so stations can be ranked by distance.

interface NWRStation {
  name: string;
  callSign: string;
  freq: string;       // not published by the stream list; left blank
  city: string;       // shown under the name, e.g. "34 mi away"
  streamUrl: string;  // live internet relay
  altUrls?: string[]; // backup relays for the same transmitter
  miles?: number;     // distance from the chosen ZIP
}

const COORDS = coords as unknown as Record<string, [number, number, string, string]>;
const STREAM_BASE = 'https://wxradio.org/';
const CATALOG_URL = 'https://wxradio.org/status-json.xsl';

// Used only if the live list can't be fetched: streams confirmed to be working.
const VERIFIED_MOUNTS = [
  'FL-Palatka-WNG522', 'FL-Orlando-KIH63', 'FL-TampaBay-KHB32', 'FL-Tallahassee-KIH24', 'NY-NewYorkCity-KWO35',
];

let catalogCache: { at: number; mounts: string[] } | null = null;

async function liveMounts(): Promise<string[]> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60 * 1000) return catalogCache.mounts;
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const data = await res.json();
    let src = data?.icestats?.source ?? [];
    if (!Array.isArray(src)) src = [src];
    const mounts: string[] = src
      .map((x: any) => String(x?.listenurl ?? '').split('/').pop() ?? '')
      .filter(Boolean);
    if (!mounts.length) throw new Error('empty catalog');
    catalogCache = { at: Date.now(), mounts };
    return mounts;
  } catch {
    return VERIFIED_MOUNTS;
  }
}

// Nearest live relays, closest first, with their distance from the chosen ZIP.
function buildStations(mounts: string[], lat: number, lon: number): NWRStation[] {
  const groups = new Map<string, string[]>();
  for (const m of mounts) {
    const base = m.replace(/-alt\d*$/, '');
    groups.set(base, [...(groups.get(base) ?? []), m]);
  }
  return [...groups.entries()]
    .filter(([base]) => COORDS[base])
    .map(([base, ms]) => {
      const [la, lo, place, st] = COORDS[base];
      const parts = base.split('-');
      const callSign = parts[parts.length - 1];
      const miles = distanceMiles(lat, lon, la, lo);
      const primary = ms.find(x => x === base) ?? ms[0];
      return {
        name: st ? `${place}, ${st}` : place,
        callSign,
        freq: '',
        city: `${Math.round(miles)} mi away`,
        streamUrl: STREAM_BASE + primary,
        altUrls: ms.filter(x => x !== primary).map(x => STREAM_BASE + x),
        miles,
      } as NWRStation;
    })
    .sort((x, y) => (x.miles ?? 0) - (y.miles ?? 0))
    .slice(0, 6);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// ── Component ─────────────────────────────────────────────────────────────────

const NWRPlayer: React.FC = () => {
  const { location } = useLocation();

  const [open,         setOpen]        = useState(false);
  const [playState,    setPlayState]   = useState<PlayState>('idle');
  const [volume,       setVolume]      = useState(0.85);
  const [selectedIdx,  setSelectedIdx] = useState(0);
  const [errMsg,       setErrMsg]      = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [catalog, setCatalog] = useState<string[] | null>(null);
  const altTry = useRef(0);

  useEffect(() => {
    let cancelled = false;
    liveMounts().then(m => { if (!cancelled) setCatalog(m); });
    return () => { cancelled = true; };
  }, []);

  const stations = React.useMemo(
    () => (catalog ? buildStations(catalog, location.lat, location.lon) : []),
    [catalog, location.lat, location.lon]
  );
  const station: NWRStation | undefined = stations[Math.min(selectedIdx, stations.length - 1)];

  // When location state changes, reset to first station and stop audio
  useEffect(() => {
    setSelectedIdx(0);
    stopAudio();
  }, [location.zip]); // eslint-disable-line

  // Keep volume in sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }
    setPlayState('idle');
    setErrMsg('');
  }, []);

  const handlePlay = useCallback(() => {
    if (playState === 'playing') {
      audioRef.current?.pause();
      setPlayState('paused');
      return;
    }
    if (playState === 'paused' && audioRef.current) {
      audioRef.current.play().catch(() => setPlayState('error'));
      setPlayState('playing');
      return;
    }

    // Fresh start / retry
    if (!station) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;

    altTry.current = 0;
    audio.src = station.streamUrl;
    audio.volume = volume;

    audio.onwaiting  = () => setPlayState('loading');
    audio.onplaying  = () => { setPlayState('playing'); setErrMsg(''); };
    audio.onpause    = () => { if (audio.src) setPlayState('paused'); };
    audio.onerror    = () => {
      // try this transmitter's backup relay (if it has one) before giving up
      const alt = station.altUrls?.[altTry.current];
      if (alt) {
        altTry.current += 1;
        audio.src = alt;
        audio.play().catch(() => {});
        return;
      }
      setPlayState('error');
      setErrMsg('This stream is offline right now — try another station.');
    };
    audio.onended = () => setPlayState('idle');
    audio.onstalled = () => setPlayState('loading');

    setPlayState('loading');
    setErrMsg('');
    audio.play().catch(e => {
      setPlayState('error');
      setErrMsg(e?.message ?? 'Playback blocked by browser — click play to retry.');
    });
  }, [playState, station, volume]);

  const handleStation = (idx: number) => {
    stopAudio();
    setSelectedIdx(idx);
  };

  // Close panel and stop on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const panel = document.getElementById('nwr-panel');
      const btn   = document.getElementById('nwr-btn');
      if (panel && !panel.contains(e.target as Node) &&
          btn   && !btn.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isPlaying  = playState === 'playing';
  const isLoading  = playState === 'loading';

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        id="nwr-btn"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-xs font-medium ${
          isPlaying
            ? 'bg-indigo-900/70 border-indigo-400 text-indigo-200'
            : open
              ? 'bg-slate-700 border-slate-500 text-slate-200'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
        }`}
        title="NOAA National Weather Radio"
      >
        <span className={isPlaying ? 'animate-pulse' : ''}>📻</span>
        <span className="hidden sm:inline">NWR</span>
        {isPlaying && (
          <span className="flex gap-px items-end h-3 ml-0.5">
            {[8, 14, 10].map((h, i) => (
              <span
                key={i}
                className="w-0.5 bg-indigo-400 rounded-full"
                style={{
                  height: `${h}px`,
                  animation: `nwr-bar ${0.5 + i * 0.15}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </span>
        )}
        {isLoading && (
          <span className="h-2 w-2 rounded-full border border-indigo-400 border-t-transparent animate-spin ml-1" />
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          id="nwr-panel"
          className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/70 z-[200] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-950 to-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">📻</span>
              <div>
                <div className="font-bold text-sm text-white">NOAA Weather Radio</div>
                <div className="text-[10px] text-indigo-400 tracking-wide">All Hazards · 24/7 Live Broadcast</div>
              </div>
            </div>
            <button
              onClick={() => { setOpen(false); stopAudio(); }}
              className="text-slate-500 hover:text-white text-xl leading-none transition-colors"
            >✕</button>
          </div>

          {/* Station picker */}
          <div className="px-4 pt-3 pb-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">
              Nearest stations to {location.label}
            </div>
            {(stations[0]?.miles ?? 0) > 100 && (
              <div className="text-[10px] text-amber-400/90 mb-2 leading-snug">
                The closest relay in this list is about {Math.round(stations[0].miles ?? 0)} miles away. Find the NOAA Weather Radio
                transmitter for your exact area at{' '}
                <a href="https://www.weather.gov/nwr/" target="_blank" rel="noopener noreferrer" className="underline">weather.gov/nwr</a>.
              </div>
            )}
            {!catalog && (
              <div className="text-xs text-slate-400 py-2">Finding weather radio streams near {location.label}…</div>
            )}
            {catalog && stations.length === 0 && (
              <div className="text-xs text-amber-300 py-2">
                No live streams were found. Try again later or visit{' '}
                <a href="https://noaaweatherradio.org/" target="_blank" rel="noopener noreferrer" className="underline">noaaweatherradio.org</a>.
              </div>
            )}
            <div className="flex flex-col gap-1">
              {stations.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleStation(i)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-all ${
                    i === selectedIdx
                      ? 'bg-indigo-900/60 border border-indigo-600/60 text-white'
                      : 'bg-slate-800/50 border border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {i === selectedIdx && isPlaying && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                    )}
                    <span className="font-medium truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2 text-[10px]">
                    <span className="font-mono text-slate-500">{s.city}</span>
                    <span className="text-indigo-400 font-mono font-bold">{s.callSign}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Player controls */}
          <div className="px-4 pb-3 space-y-3">
            {/* Status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all ${
              playState === 'playing' ? 'bg-emerald-950/60 border border-emerald-700/50 text-emerald-300' :
              playState === 'loading' ? 'bg-indigo-950/60 border border-indigo-700/50 text-indigo-300' :
              playState === 'error'   ? 'bg-red-950/60   border border-red-700/50   text-red-300'     :
              playState === 'paused'  ? 'bg-yellow-950/60 border border-yellow-700/50 text-yellow-300' :
                                        'bg-slate-800/60   border border-slate-700    text-slate-400'
            }`}>
              {playState === 'playing' && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
              {playState === 'loading' && <span className="h-2 w-2 rounded-full border border-indigo-400 border-t-transparent animate-spin shrink-0" />}
              {playState === 'error'   && <span className="shrink-0">⚠</span>}
              {playState === 'paused'  && <span className="shrink-0">⏸</span>}
              <span className="leading-tight">
                {!station ? 'Looking for nearby streams…' :
                 playState === 'playing' ? `▶ Live · ${station.callSign} · ${station.name}` :
                 playState === 'loading' ? `Connecting to ${station.callSign}…` :
                 playState === 'paused'  ? 'Paused — click Play to resume' :
                 playState === 'error'   ? (errMsg || 'Stream error — try another station') :
                 `Ready · ${station.callSign} · ${station.name}`}
              </span>
            </div>

            {/* Play / Stop buttons */}
            <div className="flex gap-2">
              <button
                onClick={handlePlay}
                disabled={playState === 'loading'}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  playState === 'loading'
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : playState === 'playing'
                      ? 'bg-indigo-700 hover:bg-indigo-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white'
                }`}
              >
                {playState === 'playing' ? '⏸ Pause' :
                 playState === 'loading' ? 'Buffering…' :
                 playState === 'paused'  ? '▶ Resume' :
                 playState === 'error'   ? '↺ Retry' :
                                           '▶ Play Live'}
              </button>
              {(playState === 'playing' || playState === 'paused') && (
                <button
                  onClick={stopAudio}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-sm font-bold transition-all"
                  title="Stop"
                >■</button>
              )}
            </div>

            {/* Volume slider */}
            <div className="flex items-center gap-2.5">
              <span className="text-base select-none">{volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : volume < 0.75 ? '🔉' : '🔊'}</span>
              <input
                type="range"
                min={0} max={1} step={0.02}
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500 bg-slate-700"
              />
              <span className="text-xs text-slate-500 font-mono w-8 text-right tabular-nums">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          {/* Footer info */}
          <div className="px-4 pb-4 space-y-2">
            <div className="bg-slate-950/50 rounded-xl p-3 text-[10px] text-slate-500 leading-relaxed space-y-1">
              <div>📡 Streaming via <span className="text-slate-400">wxradio.org</span> — SSL relay of NOAA 162 MHz broadcast</div>
              <div>⚠️ Not for life-safety use · Official alerts still appear in the Alerts panel above</div>
            </div>
            <div className="flex gap-2">
              <a
                href="https://www.weather.gov/nwr/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs text-center transition-all"
              >
                NOAA NWR Info ↗
              </a>
              <a
                href="https://noaaweatherradio.org"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs text-center transition-all"
              >
                More Streams ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe style for audio bars */}
      <style>{`
        @keyframes nwr-bar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
    </>
  );
};

export default NWRPlayer;
