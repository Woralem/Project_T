# Architecture

## Top-level structure
- `server/` — Rust backend that exposes HTTP APIs and WebSocket connections.
- `client/` — Tauri desktop client with application UI and local storage.
- `shared/` — message schemas, protocol enums, and shared identifiers used by both sides.
- `deploy/` — Docker, nginx, and server deployment files.
- `docs/` — design notes, protocol description, and setup instructions.

## Data flow
1. The desktop client authenticates against the backend.
2. The client opens a persistent WebSocket connection for realtime events.
3. Messages are encrypted on the client before being sent.
4. The backend stores and forwards encrypted payloads only.
5. Offline messages are delivered when the recipient reconnects.
6. Voice calls will use WebRTC signaling through the backend, with TURN support on the VPS.

## Design principles
- Keep the backend unaware of message contents.
- Keep client-side state encrypted at rest.
- Keep protocol contracts in `shared/` so server and client stay aligned.
- Keep deployment assets separate from application code.

## Documentation workflow
- Update this file when module boundaries or data flow change.
- Add implementation notes and lessons learned to `local_notes.md`.
- Add iteration summaries to `PROJECT_LOG.md`.
