/// <reference types="bun-types" />
/*
 * Shaher-136 Drone Relay
 * ----------------------
 * A tiny WebSocket relay between the Web GCS (browser) and the drone (ESP32).
 *
 * ONE protocol for everyone: every message is JSON `{ "type": string, "data"?: any }`.
 * This is deliberately the same plain-WebSocket protocol the ESP32 reference
 * firmware already speaks, so the browser, the simulator, and a real (bench-tested)
 * ESP32 can all talk to this relay without any translation layer.
 *
 *   ESP32 / Sim  <--ws-->  Relay (:3004)  <--ws-->  Web GCS (:3000)
 *
 * Registration: a client sends either `{ "role": "gcs" | "drone" }` (what the
 * firmware sends) or `{ "type": "register", "data": { "role": ... } }`.
 */

import type { ServerWebSocket } from 'bun'
import { MavlinkTranslator, commandToMavlink } from './mavlink'

type ClientRole = 'gcs' | 'drone'

interface WsData {
  id: string
  role: ClientRole | null
  connectedAt: number
  lastHeartbeat: number
  mav?: MavlinkTranslator // set when the drone speaks MAVLink (binary frames)
  lastTelemetryAt?: number
}

const PORT = Number(process.env.DRONE_SERVICE_PORT ?? 3004)
const STALE_MS = 45_000

const clients = new Set<ServerWebSocket<WsData>>()

// Last known drone state, replayed to GCS clients when they connect.
let latestTelemetry: unknown = null
let latestStatus: unknown = null

function send(ws: ServerWebSocket<WsData>, type: string, data?: unknown) {
  ws.send(JSON.stringify({ type, data }))
}

function broadcast(role: ClientRole, type: string, data?: unknown) {
  const frame = JSON.stringify({ type, data })
  for (const ws of clients) {
    if (ws.data.role === role) ws.send(frame)
  }
}

function connectedDrones() {
  const drones: Array<{ id: string; connectedAt: string; lastHeartbeat: string }> = []
  for (const ws of clients) {
    if (ws.data.role === 'drone') {
      drones.push({
        id: ws.data.id,
        connectedAt: new Date(ws.data.connectedAt).toISOString(),
        lastHeartbeat: new Date(ws.data.lastHeartbeat).toISOString(),
      })
    }
  }
  return drones
}

function gcsCount() {
  let n = 0
  for (const ws of clients) if (ws.data.role === 'gcs') n++
  return n
}

function notifyClientsUpdate() {
  broadcast('gcs', 'clients-update', { gcsCount: gcsCount(), drones: connectedDrones() })
}

// A drone sending BINARY frames is speaking MAVLink (real flight controller via a
// bridge). Auto-register it, decode its telemetry, and forward it to GCS clients
// in the exact same shape as a JSON drone — the UI needs no changes.
function handleMavlink(ws: ServerWebSocket<WsData>, raw: string | Uint8Array | ArrayBuffer) {
  if (ws.data.role == null) {
    ws.data.role = 'drone'
    console.log(`[DRONE-SVC] ${ws.data.id} registered as drone (MAVLink)`)
    notifyClientsUpdate()
  }
  ws.data.lastHeartbeat = Date.now()
  if (!ws.data.mav) ws.data.mav = new MavlinkTranslator()

  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
  if (!ws.data.mav.push(bytes)) return

  const now = Date.now()
  if (ws.data.lastTelemetryAt && now - ws.data.lastTelemetryAt < 100) return // ~10Hz cap
  ws.data.lastTelemetryAt = now

  latestTelemetry = ws.data.mav.telemetry
  latestStatus = ws.data.mav.status
  broadcast('gcs', 'telemetry', ws.data.mav.telemetry)
  broadcast('gcs', 'drone-status', ws.data.mav.status)
}

Bun.serve<WsData>({
  port: PORT,
  fetch(req, server) {
    const upgraded = server.upgrade(req, {
      data: {
        id: crypto.randomUUID(),
        role: null,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      },
    })
    if (upgraded) return
    return new Response('Shaher-136 drone relay — WebSocket endpoint (connect via ws://)', {
      status: 200,
    })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      console.log(`[DRONE-SVC] Client connected: ${ws.data.id}`)
    },

    message(ws, raw) {
      // Binary frame → MAVLink stream from a real flight controller.
      if (typeof raw !== 'string') {
        handleMavlink(ws, raw as unknown as Uint8Array)
        return
      }

      let msg: { type?: string; role?: ClientRole; data?: unknown }
      try {
        msg = JSON.parse(raw)
      } catch {
        return // ignore non-JSON frames
      }

      ws.data.lastHeartbeat = Date.now()

      // ── Registration ──────────────────────────────────────────────────────
      const role =
        msg.role ??
        (msg.type === 'register' ? (msg.data as { role?: ClientRole } | undefined)?.role : undefined)
      if (role === 'gcs' || role === 'drone') {
        ws.data.role = role
        console.log(`[DRONE-SVC] ${ws.data.id} registered as ${role}`)
        if (role === 'gcs') {
          send(ws, 'drones-list', { drones: connectedDrones() })
          if (latestTelemetry) send(ws, 'telemetry', latestTelemetry)
          if (latestStatus) send(ws, 'drone-status', latestStatus)
        }
        notifyClientsUpdate()
        return
      }

      const { type, data } = msg

      switch (type) {
        case 'heartbeat':
          send(ws, 'heartbeat-ack', { timestamp: Date.now() })
          break

        // ── From drone ──
        case 'telemetry':
          if (ws.data.role === 'drone') {
            latestTelemetry = data
            broadcast('gcs', 'telemetry', data)
          }
          break
        case 'drone-status':
          if (ws.data.role === 'drone') {
            latestStatus = data
            broadcast('gcs', 'drone-status', data)
          }
          break
        case 'drone-log':
          if (ws.data.role === 'drone') {
            broadcast('gcs', 'drone-log', {
              ...(data as Record<string, unknown>),
              sourceId: ws.data.id,
              timestamp: new Date().toISOString(),
            })
          }
          break

        // ── From GCS ──
        case 'command':
          if (ws.data.role === 'gcs') {
            const cmd = data as { command?: string; params?: Record<string, unknown> } | undefined
            console.log('[DRONE-SVC] Command from GCS:', data)
            for (const c of clients) {
              if (c.data.role !== 'drone') continue
              if (c.data.mav) {
                // MAVLink drone → encode a COMMAND_LONG frame
                const frame = commandToMavlink(cmd?.command ?? '', cmd?.params)
                if (frame) c.send(frame)
              } else {
                // JSON (reference firmware) drone
                c.send(JSON.stringify({ type: 'command', data }))
              }
            }
            send(ws, 'command-ack', { command: cmd?.command, status: 'sent', timestamp: Date.now() })
          }
          break
        case 'mission':
          if (ws.data.role === 'gcs') {
            const count = (data as { waypoints?: unknown[] } | undefined)?.waypoints?.length ?? 0
            console.log(`[DRONE-SVC] Mission uploaded: ${count} waypoints`)
            for (const c of clients) {
              // MAVLink mission upload (MISSION_COUNT/ITEM protocol) isn't implemented yet,
              // so only JSON-firmware drones receive the waypoint list for now.
              if (c.data.role === 'drone' && !c.data.mav) {
                c.send(JSON.stringify({ type: 'mission', data }))
              }
            }
            send(ws, 'mission-ack', { status: 'uploaded', waypointCount: count })
          }
          break
      }
    },

    close(ws) {
      const { role, id } = ws.data
      clients.delete(ws)
      console.log(`[DRONE-SVC] ${role ?? 'unregistered'} disconnected: ${id}`)
      if (role === 'drone') {
        broadcast('gcs', 'drone-disconnected', { droneId: id, reason: 'closed' })
      }
      notifyClientsUpdate()
    },
  },
})

console.log(`[DRONE-SVC] Drone WebSocket relay running on ws://0.0.0.0:${PORT}`)

// Warn GCS clients about stale drone links (no heartbeat/telemetry for a while).
setInterval(() => {
  const now = Date.now()
  for (const ws of clients) {
    if (now - ws.data.lastHeartbeat > STALE_MS) {
      send(ws, 'stale-warning', { lastHeartbeat: new Date(ws.data.lastHeartbeat).toISOString() })
    }
  }
}, 10_000)
