# Task 4 — Drone GCS API Routes

## Summary

Created 4 API route files for the Drone GCS project using Next.js App Router, TypeScript, Zod v4 validation, and Prisma ORM.

## Files Created

### 1. `src/app/api/missions/route.ts`
- **GET** `/api/missions` — Lists all missions with waypoints (ordered by `waypoint.order`), newest first.
- **POST** `/api/missions` — Creates a mission with optional waypoints. Validates with Zod (`name` required, `status` enum, `waypoints` array with `latitude`/`longitude` required). Auto-assigns `order` from array index.

### 2. `src/app/api/missions/[id]/route.ts`
- **GET** `/api/missions/:id` — Returns a single mission with its waypoints (ordered).
- **PUT** `/api/missions/:id` — Updates mission fields and replaces all waypoints if `waypoints` array is provided. Uses delete-then-recreate strategy for waypoints.
- **DELETE** `/api/missions/:id` — Deletes mission (cascade deletes waypoints via Prisma schema).
- Uses `params: Promise<{ id: string }>` pattern for Next.js 16 async params.

### 3. `src/app/api/flight-logs/route.ts`
- **GET** `/api/flight-logs?missionId=xxx` — Lists flight logs (max 500), optionally filtered by `missionId` query param, newest first.
- **POST** `/api/flight-logs` — Creates a flight log entry. Validates telemetry fields with Zod (battery clamped 0–100). Auto-sets `timestamp`.

### 4. `src/app/api/drone/command/route.ts`
- **POST** `/api/drone/command` — Validates drone command shape (strict Zod schema with allowed command enum: `arm`, `disarm`, `takeoff`, `land`, `return_to_launch`, `start_mission`, `pause_mission`, `resume_mission`, `goto`, `set_mode`, `emergency_stop`). Returns validated payload — actual command delivery happens via WebSocket from the frontend.

## Technical Details
- All validation uses `import { z } from 'zod/v4'` (Zod v4).
- All database access uses `import { db } from '@/lib/db'`.
- ESLint passes with zero errors.
- Dev server compiles all routes successfully.