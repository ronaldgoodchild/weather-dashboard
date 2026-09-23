import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from '../context/LocationContext';

// ── Station data with real working stream URLs (wxradio.org SSL streams) ──────

interface NWRStation {
  name: string;
  callSign: string;
  freq: string;
  city: string;
  streamUrl: string; // Live NOAA Weather Radio internet relay
}

// Florida stations — wxradio.org provides SSL audio relays of NWR 162 MHz
// Palatka (WNG522) is the NWR transmitter that covers NE Florida / Jacksonville area
const FL_STATIONS: NWRStation[] = [
  { name: 'NE Florida (Jacksonville area)', callSign: 'WNG522', freq: '162.425', city: 'Palatka → NE FL',     streamUrl: 'https://wxradio.org/FL-Palatka-WNG522'       },
  { name: 'Orlando',                         callSign: 'KIH63',  freq: '162.475', city: 'Orlando, FL',         streamUrl: 'https://wxradio.org/FL-Orlando-KIH63'         },
  { name: 'Tampa Bay',                       callSign: 'KHB32',  freq: '162.550', city: 'Tampa Bay, FL',       streamUrl: 'https://wxradio.org/FL-TampaBay-KHB32'        },
  { name: 'Tallahassee',                     callSign: 'KIH24',  freq: '162.400', city: 'Tallahassee, FL',     streamUrl: 'https://wxradio.org/FL-Tallahassee-KIH24'     },
  { name: 'Fort Myers / Cape Coral',         callSign: 'WXK83',  freq: '162.400', city: 'Cape Coral, FL',      streamUrl: 'https://wxradio.org/FL-FortMyers-WXK83'       },
  { name: 'Sumterville (Central FL)',        callSign: 'KPS505', freq: '162.500', city: 'Sumterville, FL',     streamUrl: 'https://wxradio.org/FL-Sumterville-KPS505'    },
];

// Other states — wxradio.org pattern: https://wxradio.org/[STATE]-[City]-[CallSign]
// Only listing verified states; others fall back to FL Jacksonville stream
const STATE_STATIONS: Record<string, NWRStation[]> = {
  FL: FL_STATIONS,
  GA: [
    { name: 'Atlanta',    callSign: 'WXL57', freq: '162.550', city: 'Atlanta, GA',      streamUrl: 'https://wxradio.org/GA-Atlanta-WXL57'    },
    { name: 'Savannah',   callSign: 'WXK72', freq: '162.400', city: 'Savannah, GA',     streamUrl: 'https://wxradio.org/GA-Savannah-WXK72'   },
  ],
  SC: [
    { name: 'Charleston', callSign: 'WXK99', freq: '162.400', city: 'Charleston, SC',   streamUrl: 'https://wxradio.org/SC-Charleston-WXK99' },
    { name: 'Columbia',   callSign: 'WXK98', freq: '162.550', city: 'Columbia, SC',     streamUrl: 'https://wxradio.org/SC-Columbia-WXK98'   },
  ],
  NC: [
    { name: 'Charlotte',  callSign: 'WXL58', freq: '162.400', city: 'Charlotte, NC',    streamUrl: 'https://wxradio.org/NC-Charlotte-WXL58'  },
    { name: 'Raleigh',    callSign: 'KEC88', freq: '162.400', city: 'Raleigh, NC',      streamUrl: 'https://wxradio.org/NC-Raleigh-KEC88'    },
  ],
  TX: [
    { name: 'Houston',    callSign: 'KHB35', freq: '162.400', city: 'Houston, TX',      streamUrl: 'https://wxradio.org/TX-Houston-KHB35'    },
    { name: 'Dallas',     callSign: 'WXL44', freq: '162.400', city: 'Dallas, TX',       streamUrl: 'https://wxradio.org/TX-Dallas-WXL44'     },
  ],
  AL: [
    { name: 'Birmingham', callSign: 'WNG645',freq: '162.550', city: 'Birmingham, AL',   streamUrl: 'https://wxradio.org/AL-Birmingham-WNG645'},
    { name: 'Mobile',     callSign: 'KEC72', freq: '162.400', city: 'Mobile, AL',       streamUrl: 'https://wxradio.org/AL-Mobile-KEC72'     },
  ],
  VA: [
    { name: 'Norfolk',    callSign: 'KHB36', freq: '162.550', city: 'Norfolk, VA',      streamUrl: 'https://wxradio.org/VA-Norfolk-KHB36'    },
    { name: 'Richmond',   callSign: 'KHB66', freq: '162.475', city: 'Richmond, VA',     streamUrl: 'https://wxradio.org/VA-Richmond-KHB66'   },
  ],
  NY: [
    { name: 'New York City',callSign:'KWO35',freq: '162.550', city: 'New York, NY',     streamUrl: 'https://wxradio.org/NY-NewYorkCity-KWO35'},
    { name: 'Albany',     callSign: 'WXL52', freq: '162.400', city: 'Albany, NY',       streamUrl: 'https://wxradio.org/NY-Albany-WXL52'     },
  ],
  CA: [
    { name: 'Los Angeles',callSign: 'KHB69', freq: '162.400', city: 'Los Angeles, CA',  streamUrl: 'https://wxradio.org/CA-LosAngeles-KHB69' },
    { name: 'San Francisco',callSign:'KIG72',freq: '162.400', city: 'San Francisco, CA',streamUrl: 'https://wxradio.org/CA-SanFrancisco-KIG72'},
  ],
  IL: [
    { name: 'Chicago',    callSign: 'KEC68', freq: '162.550', city: 'Chicago, IL',      streamUrl: 'https://wxradio.org/IL-Chicago-KEC68'    },
  ],
  OH: [
    { name: 'Columbus',   callSign: 'KEC67', freq: '162.550', city: 'Columbus, OH',     streamUrl: 'https://wxradio.org/OH-Columbus-KEC67'   },
  ],
  PA: [
    { name: 'Philadelphia',callSign:'KWO39',freq: '162.475', city: 'Philadelphia, PA',  streamUrl: 'https://wxradio.org/PA-Philadelphia-KWO39'},
    { name: 'Pittsburgh', callSign: 'KPF78', freq: '162.400', city: 'Pittsburgh, PA',   streamUrl: 'https://wxradio.org/PA-Pittsburgh-KPF78' },
  ],
};

// Fallback if state not in map
const FALLBACK_STATION: NWRStation = {
  name: 'NE Florida (Jacksonville area)',
  callSign: 'WNG522',
  freq: '162.425',
  city: 'Palatka → NE FL',
  streamUrl: 'https://wxradio.org/FL-Palatka-WNG522',
};

function getStations(state: string): NWRStation[] {
  return STATE_STATIONS[state] ?? [FALLBACK_STATION];
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

  const stations = getStations(location.state);
  const station  = stations[Math.min(selectedIdx, stations.length - 1)];

  // When location state changes, reset to first station and stop audio
  useEffect(() => {
    setSelectedIdx(0);
    stopAudio();
  }, [location.state]); // eslint-disable-line

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
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;

    audio.src = station.streamUrl;
    audio.volume = volume;

    audio.onwaiting  = () => setPlayState('loading');
    audio.onplaying  = () => { setPlayState('playing'); setErrMsg(''); };
    audio.onpause    = () => { if (audio.src) setPlayState('paused'); };
    audio.onerror    = () => {
      setPlayState('error');
      setErrMsg('Stream unavailable — try a different station or check your connection.');
    };
    audio.onended = () => setPlayState('idle');
    audio.onstalled = () => setPlayState('loading');

    setPlayState('loading');
    setErrMsg('');
    audio.play().catch(e => {
      setPlayState('error');
      setErrMsg(e?.message ?? 'Playback blocked by browser — click play to retry.');
    });
  }, [playState, station.streamUrl, volume]);

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
              {location.state} Stations
            </div>
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
                    <span className="font-mono text-slate-500">{s.freq} MHz</span>
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
                {playState === 'playing' ? `▶ Live · ${station.callSign} — ${station.freq} MHz` :
                 playState === 'loading' ? `Connecting to ${station.callSign}…` :
                 playState === 'paused'  ? 'Paused — click Play to resume' :
                 playState === 'error'   ? (errMsg || 'Stream error — try another station') :
                 `Ready · ${station.callSign} · ${station.city}`}
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
