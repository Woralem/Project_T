# Client Architecture

## Frontend stack
- React + TypeScript in `src/main.tsx`
- Vite for local dev and build tooling
- Tauri for desktop packaging

## File roles
- `package.json` defines the frontend toolchain.
- `vite.config.ts` defines the web dev server.
- `index.html` loads the React bundle.
- `src/main.tsx` renders the current local-only messenger UI.
- `src-tauri/Cargo.toml` defines the Rust-side desktop app dependencies.
- `src-tauri/src/main.rs` launches the Tauri shell.
- `src-tauri/tauri.conf.json` configures the desktop window and frontend paths.

## Current app flow
1. Tauri opens the desktop window.
2. React renders the offline UI.
3. Navigation switches between placeholder screens.
4. Messages are stored in memory only for now.

## Future work
- Add shared protocol types.
- Connect login and chat UI to the backend.
- Move UI state into smaller React components.
- Add persistent local storage.
