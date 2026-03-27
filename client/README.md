# Client

## What this is
Tauri + React desktop client for the messenger.

## File roles
- `package.json` — frontend scripts and dependencies.
- `index.html` — React entrypoint.
- `src/main.tsx` — local UI prototype with navigation, chat demo, and settings.
- `src-tauri/Cargo.toml` — Tauri Rust dependencies.
- `src-tauri/build.rs` — Tauri build script.
- `src-tauri/src/main.rs` — desktop app bootstrap.
- `src-tauri/tauri.conf.json` — Tauri dev/build config.

## How to run the desktop app
1. Install Node.js and Rust.
2. In `client/`, install frontend dependencies:
   - `npm install`
3. Run the Tauri desktop app:
   - `npm run tauri:dev`

## Notes
This opens as a desktop application, not as a plain web page, once the Tauri runtime is available.
