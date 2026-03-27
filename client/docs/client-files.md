# Client File Map

- `package.json` — browser-side dependencies and scripts.
- `vite.config.ts` — local React development settings.
- `index.html` — root HTML file for the React app.
- `src/main.tsx` — single-file React UI for now.
- `src-tauri/Cargo.toml` — Rust dependencies for the Tauri shell.
- `src-tauri/src/main.rs` — Tauri startup entrypoint.
- `src-tauri/tauri.conf.json` — application metadata and dev server URLs.

This file should be split later when the UI grows into multiple components.
