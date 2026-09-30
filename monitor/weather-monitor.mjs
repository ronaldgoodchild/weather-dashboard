/**
 * NWS Weather Alert Monitor
 * Polls the NWS API and sends new alerts for ANY U.S. ZIP code to your phone via ntfy.sh
 *
 * Setup:
 *   1. Copy this file to your server
 *   2. Pick your ZIP code and ntfy topic (environment variables or the CONFIG block below):
 *        WX_ZIP=90210 NTFY_TOPIC=your-long-random-topic node weather-monitor.mjs
 *      (or pass the ZIP on the command line: node weather-monitor.mjs --zip 90210)
 *   3. Test without sending anything:  node weather-monitor.mjs --zip 90210 --dry-run
 *   4. Add to crontab to run every 5 min:
 *        crontab -e
 *        *\/5 * * * * WX_ZIP=90210 NTFY_TOPIC=your-topic /usr/bin/node /path/to/weather-monitor.mjs >> /path/to/weather-monitor.log 2>&1
 *
 * The ZIP is turned into coordinates and your NWS alert zones (forecast, county and
 * fire-weather) once, then cached in location.json next to this file, so the dashboard
 * and this monitor always watch the same area.
 *
 * Requirements: Node.js 18+ (uses built-in fetch)
 * No npm install needed.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── CONFIG ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argValue = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const CONFIG = {
  ntfyTopic:  process.env.NTFY_TOPIC || 'CHANGE-ME-pick-a-long-random-topic', // your ntfy.sh topic (anyone who knows it can read it - make it unguessable)
  zip:        argValue('--zip') || process.env.WX_ZIP || '',                   // 5-digit U.S. ZIP code to watch
  // Legacy manual override (skips the ZIP lookup): NWS zone IDs + a label for notifications
  nwsZones:      process.env.NWS_ZONES || '',
  locationLabel: process.env.LOCATION || '',
  checkEveryMs: 5 * 60 * 1000,        // 5 minutes (used when running as daemon)
  maxSeenIds:  200,                    // how many alert IDs to remember
  dryRun:      args.includes('--dry-run'),
};

const UA = { 'User-Agent': 'WeatherDashboard-Monitor/1.0 (https://github.com/ronaldgoodchild/weather-dashboard)' };

// ── State files ───────────────────────────────────────────────────────────────

const __dir      = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, 'seen-alerts.json');
const LOC_FILE   = join(__dir, 'location.json');

function loadSeen() {
  try {
    return new Set(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveSeen(seen) {
  // Keep only most recent IDs so the file doesn't grow forever
  const arr = [...seen].slice(-CONFIG.maxSeenIds);
  writeFileSync(STATE_FILE, JSON.stringify(arr), 'utf8');
}

// ── Location: ZIP -> coordinates -> NWS zones (cached) ────────────────────────

const LOC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCachedLocation(zip) {
  try {
    const c = JSON.parse(readFileSync(LOC_FILE, 'utf8'));
    return c.zip === zip ? c : null;
  } catch {
    return null;
  }
}

async function lookupLocation(zip) {
  const geo = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!geo.ok) throw new Error(`ZIP ${zip} not found`);
  const place = (await geo.json()).places?.[0];
  if (!place) throw new Error(`No location data for ZIP ${zip}`);
  const lat = parseFloat(place.latitude);
  const lon = parseFloat(place.longitude);

  const pr = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: UA });
  if (!pr.ok) throw new Error(`The National Weather Service has no data for ZIP ${zip} (U.S. locations only)`);
  const p = (await pr.json()).properties ?? {};
  const zones = [...new Set(
    [p.forecastZone, p.county, p.fireWeatherZone].filter(Boolean).map(u => u.split('/').pop())
  )];
  if (!zones.length) throw new Error(`No NWS alert zones found for ZIP ${zip}`);

  return {
    zip, lat, lon,
    label: `${place['place name']}, ${place['state abbreviation']} ${zip}`,
    zones: zones.join(','),
    timeZone: p.timeZone || 'America/New_York',
    at: Date.now(),
  };
}

async function resolveLocation() {
  // Legacy: explicit zones, no ZIP
  if (!CONFIG.zip && CONFIG.nwsZones) {
    return { label: CONFIG.locationLabel || CONFIG.nwsZones, zones: CONFIG.nwsZones, timeZone: 'America/New_York' };
  }
  if (!/^\d{5}$/.test(CONFIG.zip)) {
    throw new Error('Set a 5-digit ZIP code: WX_ZIP=90210 node weather-monitor.mjs  (or --zip 90210)');
  }
  const cached = readCachedLocation(CONFIG.zip);
  if (cached && Date.now() - cached.at < LOC_MAX_AGE_MS) return cached;
  try {
    const fresh = await lookupLocation(CONFIG.zip);
    writeFileSync(LOC_FILE, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  } catch (err) {
    if (cached) {
      console.error(`[${new Date().toISOString()}] ⚠️ Location refresh failed (${err.message}); using cached zones`);
      return cached;
    }
    throw err;
  }
}

// ── ntfy.sh sender ────────────────────────────────────────────────────────────

const PRIORITY_MAP = {
  Extreme: 'urgent',
  Severe:  'high',
  Moderate:'default',
  Minor:   'low',
  Unknown: 'min',
};

const TAG_MAP = {
  Extreme: 'rotating_light,warning',
  Severe:  'warning,cloud_with_lightning',
  Moderate:'cloud_with_lightning',
  Minor:   'information_source',
  Unknown: 'information_source',
};

async function sendAlert(alert, loc) {
  const props    = alert.properties;
  const severity = props.severity ?? 'Unknown';
  const title    = `⚠️ ${props.event} — ${loc.label}`;
  const expires  = props.expires ? new Date(props.expires).toLocaleString('en-US', { timeZone: loc.timeZone }) : 'unknown';
  const body     = `${props.headline ?? props.event}\n\nArea: ${props.areaDesc ?? '—'}\nExpires: ${expires}`;

  if (CONFIG.dryRun) {
    console.log(`[dry-run] would send (${severity}) → ${title}\n${body}\n`);
    return;
  }

  const params = new URLSearchParams({
    title,
    priority: PRIORITY_MAP[severity] ?? 'default',
    tags:     TAG_MAP[severity]     ?? 'warning',
  });

  const url = `https://ntfy.sh/${CONFIG.ntfyTopic}?${params}`;
  const res  = await fetch(url, { method: 'POST', body });

  if (res.ok) {
    console.log(`[${new Date().toISOString()}] ✅ Sent: ${props.event} (${severity})`);
  } else {
    console.error(`[${new Date().toISOString()}] ❌ ntfy error ${res.status} for: ${props.event}`);
  }
}

// ── NWS poller ────────────────────────────────────────────────────────────────

async function checkAlerts() {
  let loc;
  try {
    loc = await resolveLocation();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[${new Date().toISOString()}] Checking NWS alerts for ${loc.label} (zones: ${loc.zones})`);

  let features;
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?zone=${loc.zones}`, { headers: UA });
    if (!res.ok) throw new Error(`NWS API returned ${res.status}`);
    const data = await res.json();
    features = data.features ?? [];
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ NWS fetch error: ${err.message}`);
    return;
  }

  const seen    = loadSeen();
  const order   = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  const sorted  = [...features].sort((a, b) =>
    (order[a.properties?.severity] ?? 4) - (order[b.properties?.severity] ?? 4)
  );

  let newCount = 0;
  for (const alert of sorted) {
    const id     = alert.id;
    const status = alert.properties?.status;
    if (status === 'Test') continue;   // skip test alerts
    if (seen.has(id)) continue;        // already sent this one

    await sendAlert(alert, loc);
    if (!CONFIG.dryRun) seen.add(id);  // a dry run must not mark anything as sent
    newCount++;

    // Small delay between multiple alerts to avoid rate limiting
    if (newCount < sorted.length) await sleep(500);
  }

  if (newCount === 0) {
    console.log(`[${new Date().toISOString()}] ℹ️  No new alerts (${features.length} active total)`);
  }

  if (!CONFIG.dryRun) saveSeen(seen);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isDaemon = args.includes('--daemon');

if (isDaemon) {
  // Run as a long-lived process (alternative to cron)
  console.log(`[${new Date().toISOString()}] 🚀 Weather monitor started (daemon mode, interval: ${CONFIG.checkEveryMs / 1000}s)`);
  (async () => {
    while (true) {
      await checkAlerts();
      await sleep(CONFIG.checkEveryMs);
    }
  })();
} else {
  // Single run — perfect for cron
  checkAlerts().catch(err => {
    console.error(`[${new Date().toISOString()}] Fatal: ${err.message}`);
    process.exit(1);
  });
}
