# Client Overview

This folder contains the Tauri + React desktop frontend for the messenger.

## Key files
- `package.json` — frontend scripts and React/Vite dependencies.
- `vite.config.ts` — Vite dev server configuration.
- `index.html` — HTML entrypoint for the React app.
- `src/main.tsx` — React UI entrypoint and current placeholder messenger screens.
- `src-tauri/Cargo.toml` — Rust-side Tauri dependencies.
- `src-tauri/src/main.rs` — Tauri application bootstrap.
- `src-tauri/tauri.conf.json` — Tauri app configuration and dev/build settings.

## UI behavior
The current React UI is offline-only and provides:
- welcome screen
- login screen
- chat list
- chat view with local message sending
- calls screen placeholder
- settings screen with dark mode toggle

## Maintenance rule
When the client structure changes, update this file and `architecture.md` so future agents can quickly understand what each file does.
