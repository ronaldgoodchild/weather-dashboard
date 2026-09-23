# Weather Dashboard

A free, **single-file weather dashboard** built with React, TypeScript, Vite and Tailwind. It pulls live data from public U.S. government sources - forecasts, **severe-weather alerts**, hurricane tracking, tides, radar and NOAA Weather Radio - and can push alerts to your phone with [ntfy](https://ntfy.sh). Built for Northeast Florida; change the ZIP code and the location-based panels follow.

> Not affiliated with NOAA or the National Weather Service. Always follow official warnings.

## Features

- **Overview** - current conditions at a glance for your ZIP code
- **Forecast** - multi-day forecast from the NWS API
- **Severe** - active NWS alerts and severe-weather outlooks, with radar and lightning maps
- **Hurricane** - National Hurricane Center products and tropical outlooks
- **Tides** - NOAA Tides & Currents predictions
- **Cameras** - traffic and beach camera links (Florida-specific)
- **NOAA Weather Radio** player
- **Push notifications** through ntfy.sh for new alerts (browser-side, or run the included monitor script)
- Builds to **one self-contained `index.html`** you can host anywhere or open from disk

## Quick start

```bash
git clone https://github.com/ronaldgoodchild/weather-dashboard.git
cd weather-dashboard
npm ci
npm run dev        # http://localhost:5173
npm run build      # single-file build in dist/index.html
```

Requires Node.js 20+.

## Alerts to your phone

1. Pick a long, random **ntfy topic** (anyone who knows the topic name can read it - treat it like a password) and subscribe to it in the ntfy app.
2. Either enter it in the dashboard's notification settings, **or** run the headless monitor:
   ```bash
   NTFY_TOPIC=your-long-random-topic node monitor/weather-monitor.mjs
   ```
   Edit `nwsZones` and `locationLabel` at the top of `monitor/weather-monitor.mjs` for your area (zone IDs are shown in the dashboard).
3. Prefer GitHub Actions? Copy `docs/weather-alerts.workflow.yml.example` into `.github/workflows/` **in your own fork** and add an `NTFY_TOPIC` repository secret. It polls every 5 minutes for free.

## Data sources

api.weather.gov (NWS), NOAA Tides & Currents, National Hurricane Center, Storm Prediction Center, radar.weather.gov, NOAA GOES imagery, wxradio.org, Windy embed, Blitzortung, FL511, and api.zippopotam.us for ZIP lookups. Please respect each provider's terms and rate limits; the NWS API asks for a descriptive `User-Agent`.

## Contributing

Ideas and pull requests welcome - see [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE) (c) 2026 Ronald Goodchild / REGTeches
