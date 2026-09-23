/**
 * NWS Weather Alert Monitor
 * Polls the NWS API every 5 minutes and sends new alerts to your phone via ntfy.sh
 *
 * Setup:
 *   1. Copy this file to your server
 *   2. Edit CONFIG below (ntfyTopic + zones)
 *   3. Run once to test: node weather-monitor.mjs
 *   4. Add to crontab to run every 5 min:
 *        crontab -e
 *        *\/5 * * * * /usr/bin/node /path/to/weather-monitor.mjs >> /path/to/weather-monitor.log 2>&1
 *
 * Requirements: Node.js 18+ (uses built-in fetch)
 * No npm install needed.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── CONFIG — edit these ───────────────────────────────────────────────────────

const CONFIG = {
  ntfyTopic:  process.env.NTFY_TOPIC || 'CHANGE-ME-pick-a-long-random-topic', // your ntfy.sh topic (anyone who knows it can read it - make it unguessable)
  nwsZones:   'FLZ325,FLC031',        // NWS zone IDs (from dashboard)
  locationLabel: 'Jacksonville, FL',   // shown in notifications
  checkEveryMs: 5 * 60 * 1000,        // 5 minutes (used when running as daemon)
  maxSeenIds:  200,                    // how many alert IDs to remember
};

// ── State file — tracks which alerts were already sent ────────────────────────

const __dir     = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dir, 'seen-alerts.json');

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

async function sendAlert(alert) {
  const props    = alert.properties;
  const severity = props.severity ?? 'Unknown';
  const title    = `⚠️ ${props.event} — ${CONFIG.locationLabel}`;
  const expires  = props.expires ? new Date(props.expires).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'unknown';
  const body     = `${props.headline ?? props.event}\n\nArea: ${props.areaDesc ?? '—'}\nExpires: ${expires}`;

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
  console.log(`[${new Date().toISOString()}] Checking NWS alerts for zones: ${CONFIG.nwsZones}`);

  let features;
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?zone=${CONFIG.nwsZones}`,
      { headers: { 'User-Agent': 'WeatherDashboard-Monitor/1.0 (https://github.com/ronaldgoodchild/weather-dashboard)' } }
    );
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

    await sendAlert(alert);
    seen.add(id);
    newCount++;

    // Small delay between multiple alerts to avoid rate limiting
    if (newCount < sorted.length) await sleep(500);
  }

  if (newCount === 0) {
    console.log(`[${new Date().toISOString()}] ℹ️  No new alerts (${features.length} active total)`);
  }

  saveSeen(seen);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isDaemon = process.argv.includes('--daemon');

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
