import React, { useState, useEffect } from 'react';

const Hurricane: React.FC = () => {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeBasin, setActiveBasin] = useState<'atl' | 'pac'>('atl');

  useEffect(() => {
    setLastUpdated(new Date());
    const id = setInterval(() => setLastUpdated(new Date()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Basin tabs + header */}
      <div className="flex items-center gap-3 flex-wrap">
        {(['atl', 'pac'] as const).map(basin => (
          <button
            key={basin}
            onClick={() => setActiveBasin(basin)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeBasin === basin
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🌀 {basin === 'atl' ? 'Atlantic Basin' : 'Eastern Pacific'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {lastUpdated && <span>Images refresh hourly • {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <a
            href="https://www.nhc.noaa.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            🔗 nhc.noaa.gov
          </a>
        </div>
      </div>

      {/* NHC Active Storm Tracker embed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">🌀 Active Storm Tracker</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live NHC interactive map — click storms for full details
            </p>
          </div>
          <a
            href="https://www.nhc.noaa.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors"
          >
            Open Full NHC Site ↗
          </a>
        </div>
        <div style={{ height: '480px' }} className="relative">
          <iframe
            src={
              activeBasin === 'atl'
                ? 'https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=5'
                : 'https://www.nhc.noaa.gov/gtwo.php?basin=epac&fdays=5'
            }
            className="w-full h-full border-0"
            title="NHC Storm Tracker"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>

      {/* Tropical Outlook Graphics */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="font-semibold">
            {activeBasin === 'atl' ? 'Atlantic' : 'Eastern Pacific'} Tropical Weather Outlook
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            NHC 2-day & 7-day cyclone formation probabilities • Updated every 6 hours
          </p>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-4">
          {activeBasin === 'atl' ? (
            <>
              <div>
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">2-Day Outlook</div>
                <img
                  src={`https://www.nhc.noaa.gov/xgtwo/two_atl_0d0.png?${Date.now()}`}
                  alt="Atlantic 2-day tropical outlook"
                  className="w-full rounded-xl"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">7-Day Outlook</div>
                <img
                  src={`https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png?${Date.now()}`}
                  alt="Atlantic 7-day tropical outlook"
                  className="w-full rounded-xl"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">2-Day Outlook</div>
                <img
                  src={`https://www.nhc.noaa.gov/xgtwo/two_pac_0d0.png?${Date.now()}`}
                  alt="Eastern Pacific 2-day tropical outlook"
                  className="w-full rounded-xl"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">7-Day Outlook</div>
                <img
                  src={`https://www.nhc.noaa.gov/xgtwo/two_pac_7d0.png?${Date.now()}`}
                  alt="Eastern Pacific 7-day tropical outlook"
                  className="w-full rounded-xl"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'NHC Advisories', icon: '📋', href: 'https://www.nhc.noaa.gov/#ATL', desc: 'All active advisories' },
          { label: 'Storm Surge', icon: '🌊', href: 'https://www.nhc.noaa.gov/surge/', desc: 'Surge risk maps' },
          { label: 'Recon Aircraft', icon: '✈️', href: 'https://www.nhc.noaa.gov/recon.php', desc: 'Live recon missions' },
          { label: 'Spaghetti Models', icon: '🍝', href: 'https://www.tropicaltidbits.com/analysis/storms/', desc: 'Model track forecasts' },
        ].map(link => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 text-sm transition-all text-center group"
          >
            <div className="text-2xl mb-2">{link.icon}</div>
            <div className="font-medium group-hover:text-white transition-colors">{link.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{link.desc}</div>
          </a>
        ))}
      </div>

      <div className="text-xs text-slate-600 text-center">
        Data & graphics from National Hurricane Center • nhc.noaa.gov • Miami, FL
      </div>
    </div>
  );
};

export default Hurricane;
