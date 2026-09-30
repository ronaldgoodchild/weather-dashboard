import React, { useState, useEffect } from 'react';
import { useLocation } from '../context/LocationContext';
import { goesSectorFor, state511 } from '../utils/geo';

type CamView = 'traffic' | 'beach' | 'radar';

function trafficLinks(state: string) {
  const dot = state511(state);
  const links = [
    { name: dot.name, icon: '🚦', desc: `${state || 'State'} DOT live traffic cameras & incidents`, href: dot.url, color: 'border-green-700 hover:border-green-500' },
  ];
  if (state === 'FL') {
    links.push({ name: 'NaviGator FDOT', icon: '🛣️', desc: 'Advanced traffic management cameras', href: 'https://www.navigator.state.fl.us/', color: 'border-orange-700 hover:border-orange-500' });
  }
  links.push({ name: 'Waze Live Map', icon: '🚗', desc: 'Real-time traffic, accidents & hazards', href: 'https://www.waze.com/live-map/', color: 'border-cyan-700 hover:border-cyan-500' });
  return links;
}

const BingMap: React.FC<{ lat: number; lon: number; label: string; zoom?: number }> = ({ lat, lon, label, zoom = 13 }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
      <span className="font-medium text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-slate-500 hidden sm:block">Click layers icon inside map → enable Traffic</span>
        <a href={`https://www.bing.com/maps?cp=${lat}~${lon}&lvl=${zoom}&style=r`}
          target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Open ↗</a>
      </div>
    </div>
    <div style={{ height: '300px' }}>
      <iframe
        key={`${lat}-${lon}`}
        src={`https://www.bing.com/maps/embed?h=300&w=800&cp=${lat}~${lon}&lvl=${zoom}&typ=d&sty=r&src=SHELL&FORM=MBEDV8`}
        className="w-full h-full border-0"
        title={label}
        loading="lazy"
      />
    </div>
  </div>
);

const OSMMap: React.FC<{ lat: number; lon: number; label: string }> = ({ lat, lon, label }) => {
  const bbox = `${lon - 0.12},${lat - 0.08},${lon + 0.12},${lat + 0.08}`;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
          target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Open ↗</a>
      </div>
      <div style={{ height: '260px' }}>
        <iframe
          key={`${lat}-${lon}`}
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`}
          className="w-full h-full border-0"
          title={label}
          loading="lazy"
        />
      </div>
      <div className="px-4 py-2.5 border-t border-slate-800 flex gap-3">
        <a href={`https://www.earthcam.com/`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 bg-blue-800 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors">
          📷 EarthCam ↗
        </a>
        <a href={`https://www.surfline.com/`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors">
          🏄 Surfline ↗
        </a>
      </div>
    </div>
  );
};

const RadarLoop: React.FC<{ station: string }> = ({ station }) => {
  const [key, setKey] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setKey(Date.now()), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <img key={key}
      src={`https://radar.weather.gov/ridge/standard/${station}_loop.gif?${key}`}
      alt={`NWS ${station} Radar`} className="w-full rounded-xl" />
  );
};

const SatImg: React.FC<{ sat: string; code: string; label: string }> = ({ sat, code, label }) => {
  const [key, setKey] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setKey(Date.now()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <img key={key}
      src={`https://cdn.star.nesdis.noaa.gov/${sat}/ABI/SECTOR/${code}/GEOCOLOR/latest.jpg?${key}`}
      alt={`${sat} ${label} satellite`} className="w-full rounded-xl" />
  );
};

const Cameras: React.FC = () => {
  const { location } = useLocation();
  const [view, setView] = useState<CamView>('traffic');
  const radar = location.radarStation || 'KJAX';
  const sector = goesSectorFor(location.lat, location.lon);
  const sat = sector.sat === 'GOES19' ? 'GOES-19' : 'GOES-18';

  // Nearby beach coords offset from user location
  const beaches = [
    { label: `${location.city} Area`, lat: location.lat, lon: location.lon },
    { label: 'North-East Area', lat: location.lat + 0.4, lon: location.lon + 0.3 },
    { label: 'South Area', lat: location.lat - 0.4, lon: location.lon + 0.2 },
    { label: 'Coastal Area', lat: location.lat - 0.2, lon: location.lon + 0.5 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'traffic' as CamView, label: '🚦 Traffic' },
          { id: 'beach'   as CamView, label: '🏖️ Beach Locations' },
          { id: 'radar'   as CamView, label: '📡 Radar & Satellite' },
        ]).map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              view === v.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            {v.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-slate-500 flex items-center">
          📍 {location.label}
        </div>
      </div>

      {/* TRAFFIC */}
      {view === 'traffic' && (
        <div className="space-y-4">
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3 text-xs text-amber-300 flex items-start gap-2">
            <span className="shrink-0">💡</span>
            <span>Maps centered on <strong>{location.label}</strong> via Bing Maps. Click the layers icon inside each map and enable <strong>Traffic</strong> to see live conditions. For FDOT camera feeds use the links below.</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <BingMap lat={location.lat}          lon={location.lon}          label={`${location.city} — Local Area`}   zoom={12} />
            <BingMap lat={location.lat}          lon={location.lon}          label={`${location.city} — Highway View`}  zoom={10} />
            <BingMap lat={location.lat + 0.35}   lon={location.lon}          label="North of town"              zoom={11} />
            <BingMap lat={location.lat - 0.35}   lon={location.lon}          label="South of town"              zoom={11} />
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-sm text-slate-300">📷 Live Camera Sites</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {trafficLinks(location.state).map(link => (
                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer"
                  className={`bg-slate-900 border ${link.color} rounded-xl p-4 transition-all group`}>
                  <div className="text-2xl mb-2">{link.icon}</div>
                  <div className="font-medium text-sm group-hover:text-white">{link.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{link.desc}</div>
                  <div className="text-[10px] text-blue-400 mt-2">Opens in new tab ↗</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BEACH */}
      {view === 'beach' && (
        <div className="space-y-4">
          <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl px-4 py-3 text-xs text-blue-300 flex items-start gap-2">
            <span className="shrink-0">💡</span>
            <span>Maps centered near <strong>{location.label}</strong>. Beach camera sites (EarthCam, Surfline) block embedding — use the buttons below each map to open live streams in a new tab.</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {beaches.map(b => (
              <OSMMap key={b.label} lat={b.lat} lon={b.lon} label={b.label} />
            ))}
          </div>
        </div>
      )}

      {/* RADAR & SATELLITE */}
      {view === 'radar' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">📡 NWS Radar — {radar} ({location.office || 'local office'})</span>
                <span className="ml-2 text-[10px] text-slate-500">Refreshes every 2 min</span>
              </div>
              <a href={`https://radar.weather.gov/station/${radar}/standard`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline">Full radar ↗</a>
            </div>
            <div className="p-3"><RadarLoop station={radar} /></div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">🛰️ {sat} Satellite — {sector.label}</span>
                <span className="ml-2 text-[10px] text-slate-500">Refreshes every 10 min</span>
              </div>
              <a href={sector.page}
                target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Full loop ↗</a>
            </div>
            <div className="p-3"><SatImg sat={sector.sat} code={sector.code} label={sector.label} /></div>
          </div>
          {/* Windy full radar for user's location */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <span className="font-medium text-sm">🌀 Interactive Radar — {location.label}</span>
            </div>
            <div style={{ height: '400px' }}>
              <iframe
                key={location.zip}
                src={`https://embed.windy.com/embed2.html?lat=${location.lat}&lon=${location.lon}&detailLat=${location.lat}&detailLon=${location.lon}&zoom=8&level=surface&overlay=radar&menu=false&message=false&marker=false&calendar=false&pressure=false&type=map&location=coordinates&detail=false&metricWind=mph&metricTemp=%C2%B0F`}
                className="w-full h-full border-0"
                title="Local Radar"
                allow="fullscreen"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cameras;
