# Changelog

## [Unreleased]
- **Every tab now follows the ZIP code**: nearby towns (named by the NWS), nearest NOAA tide stations, the ZIP's own NWS radar station and GOES satellite sector, state 511 traffic links (live incidents stay Florida-only), Weather Radio relays sorted by distance, hurricane basin and local NWS office, and a page title/header that use the city. `?zip=` links open a chosen location.
- Invalid or non-U.S. ZIP codes now show a clear error instead of silently falling back to Jacksonville's alert zones.
- Public release: personal ntfy topic and contact email removed from the monitor script (topic now comes from `NTFY_TOPIC`)
- The 5-minute GitHub Actions alert workflow is now an opt-in example in `docs/`
- Added CI (type-check + build), docs, security policy

## [0.1.0] - 2026-06-14
- Dashboard with Overview, Forecast, Severe, Hurricane, Tides, Cameras and NOAA Weather Radio panels
- ntfy.sh push notifications, headless alert monitor, single-file build
