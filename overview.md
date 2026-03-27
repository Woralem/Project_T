# Overview

This project is a PC-only secure messenger for a small circle of friends, with a maximum target size of roughly 100 users.

## Goals
- End-to-end encrypted messaging.
- Server should store only encrypted data.
- Desktop application only.
- Central server deployment on a VPS.
- Support for invite-based onboarding.
- Offline delivery and message history.
- Future support for voice calls.

## Intended stack
- Backend: Rust
- Desktop client: Tauri
- Transport: WebSocket over TLS
- Calls: WebRTC
- Server storage: PostgreSQL
- Local storage: SQLite with SQLCipher

## Repository shape
- `server/` for backend services.
- `client/` for the desktop application.
- `shared/` for protocol and common data structures.
- `deploy/` for deployment assets.
- `docs/` for deeper technical documentation.
