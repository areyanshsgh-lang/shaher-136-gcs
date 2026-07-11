/*
 * Minimal MAVLink (v1 + v2) support for the Shaher-136 relay.
 * ----------------------------------------------------------------
 * Dependency-free. Decodes the handful of telemetry messages the GCS needs
 * and translates them into the same { telemetry, status } shape the rest of
 * the system already speaks, so a real ArduPilot / PX4 flight controller
 * (via a MAVLink bridge) shows up in the dashboard like any other drone.
 *
 * Scope note: this is the DECODE spine (telemetry in) plus arm/disarm/takeoff
 * COMMAND_LONG encoding (commands out). It is not a full MAVLink stack — no
 * parameter/mission protocols yet. CRC is computed for outgoing frames; on
 * incoming frames we parse by length and skip CRC validation for robustness.
 *
 * The core telemetry messages below all happen to be declared largest-field
 * first in the MAVLink XML, so wire order == declared order (no field
 * reordering surprises) — except SYS_STATUS, whose 1-byte battery_remaining
 * is moved to the end of the payload, which is handled explicitly.
 */

// ── Message IDs ────────────────────────────────────────────────────────────────
const MSG = {
  HEARTBEAT: 0,
  SYS_STATUS: 1,
  GPS_RAW_INT: 24,
  ATTITUDE: 30,
  GLOBAL_POSITION_INT: 33,
  VFR_HUD: 74,
  COMMAND_LONG: 76,
} as const

// Full payload length for each decoded message (v2 may send fewer, zero-padded).
const PAYLOAD_LEN: Record<number, number> = {
  [MSG.HEARTBEAT]: 9,
  [MSG.SYS_STATUS]: 31,
  [MSG.GPS_RAW_INT]: 30,
  [MSG.ATTITUDE]: 28,
  [MSG.GLOBAL_POSITION_INT]: 28,
  [MSG.VFR_HUD]: 20,
}

// CRC_EXTRA seeds (from common.xml) — needed to CRC outgoing frames.
const CRC_EXTRA: Record<number, number> = {
  [MSG.COMMAND_LONG]: 152,
}

export interface DecodedMessage {
  msgid: number
  payload: DataView
}

// ── Frame parser (streaming) ───────────────────────────────────────────────────

export class MavlinkParser {
  private buf: number[] = []

  /** Feed raw bytes; returns any complete messages found. */
  push(bytes: Uint8Array): DecodedMessage[] {
    for (const b of bytes) this.buf.push(b)
    const out: DecodedMessage[] = []

    while (this.buf.length > 0) {
      const stx = this.buf[0]
      if (stx === 0xfd) {
        // MAVLink v2: FD len incompat compat seq sys comp msgid(3) payload crc(2) [sig 13]
        if (this.buf.length < 10) break
        const len = this.buf[1]
        const incompat = this.buf[2]
        const sigLen = incompat & 0x01 ? 13 : 0
        const total = 10 + len + 2 + sigLen
        if (this.buf.length < total) break
        const msgid = this.buf[7] | (this.buf[8] << 8) | (this.buf[9] << 16)
        out.push(this.frame(msgid, this.buf.slice(10, 10 + len)))
        this.buf.splice(0, total)
      } else if (stx === 0xfe) {
        // MAVLink v1: FE len seq sys comp msgid payload crc(2)
        if (this.buf.length < 6) break
        const len = this.buf[1]
        const total = 6 + len + 2
        if (this.buf.length < total) break
        const msgid = this.buf[5]
        out.push(this.frame(msgid, this.buf.slice(6, 6 + len)))
        this.buf.splice(0, total)
      } else {
        // not a start byte — resync
        this.buf.shift()
      }
    }
    // guard against unbounded growth on a bad stream
    if (this.buf.length > 4096) this.buf = []
    return out
  }

  private frame(msgid: number, payloadBytes: number[]): DecodedMessage {
    const full = PAYLOAD_LEN[msgid] ?? payloadBytes.length
    const bytes = new Uint8Array(full)
    bytes.set(payloadBytes.slice(0, full))
    return { msgid, payload: new DataView(bytes.buffer) }
  }
}

// ── Translator: MAVLink → GCS telemetry/status ─────────────────────────────────

// ArduCopter custom_mode → label (common subset)
const COPTER_MODE: Record<number, string> = {
  0: 'STABILIZE', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER',
  6: 'RTL', 9: 'LAND', 16: 'POSHOLD',
}

export interface GcsTelemetry {
  lat: number | null
  lng: number | null
  alt: number | null
  speed: number | null
  heading: number | null
  roll: number | null
  pitch: number | null
  yaw: number | null
  battery: number | null
  gpsFix: boolean
  satellites: number
}

export interface GcsStatus {
  armed: boolean
  mode: string
  gpsFix: boolean
  batteryLevel: number
}

const RAD2DEG = 180 / Math.PI

export class MavlinkTranslator {
  private parser = new MavlinkParser()

  readonly telemetry: GcsTelemetry = {
    lat: null, lng: null, alt: null, speed: null, heading: null,
    roll: null, pitch: null, yaw: null, battery: null, gpsFix: false, satellites: 0,
  }
  readonly status: GcsStatus = { armed: false, mode: 'UNKNOWN', gpsFix: false, batteryLevel: 0 }

  /** Feed raw MAVLink bytes; returns true if telemetry/status changed. */
  push(bytes: Uint8Array): boolean {
    let changed = false
    for (const m of this.parser.push(bytes)) changed = this.apply(m) || changed
    return changed
  }

  private apply(m: DecodedMessage): boolean {
    const p = m.payload
    switch (m.msgid) {
      case MSG.HEARTBEAT: {
        const customMode = p.getUint32(0, true)
        const baseMode = p.getUint8(6)
        this.status.armed = (baseMode & 0x80) !== 0 // MAV_MODE_FLAG_SAFETY_ARMED
        this.status.mode = COPTER_MODE[customMode] ?? `MODE_${customMode}`
        return true
      }
      case MSG.SYS_STATUS: {
        this.telemetry.battery = p.getUint16(14, true) / 1000 // mV → V
        const remaining = p.getInt8(30) // battery_remaining %, -1 if unknown
        this.status.batteryLevel = remaining < 0 ? 0 : remaining
        return true
      }
      case MSG.GPS_RAW_INT: {
        const fixType = p.getUint8(28)
        this.telemetry.satellites = p.getUint8(29)
        this.telemetry.gpsFix = fixType >= 3
        this.status.gpsFix = fixType >= 3
        return true
      }
      case MSG.ATTITUDE: {
        this.telemetry.roll = p.getFloat32(4, true) * RAD2DEG
        this.telemetry.pitch = p.getFloat32(8, true) * RAD2DEG
        this.telemetry.yaw = p.getFloat32(12, true) * RAD2DEG
        return true
      }
      case MSG.GLOBAL_POSITION_INT: {
        this.telemetry.lat = p.getInt32(4, true) / 1e7
        this.telemetry.lng = p.getInt32(8, true) / 1e7
        this.telemetry.alt = p.getInt32(16, true) / 1000 // relative_alt mm → m
        const vx = p.getInt16(20, true) / 100
        const vy = p.getInt16(22, true) / 100
        this.telemetry.speed = Math.hypot(vx, vy)
        this.telemetry.heading = p.getUint16(26, true) / 100 // cdeg → deg
        return true
      }
      case MSG.VFR_HUD: {
        if (this.telemetry.speed == null) this.telemetry.speed = p.getFloat32(4, true)
        if (this.telemetry.heading == null) this.telemetry.heading = p.getInt16(16, true)
        return true
      }
      default:
        return false
    }
  }
}

// ── Command encoding (GCS → flight controller) ─────────────────────────────────

function crcAccumulate(byte: number, crc: number): number {
  let tmp = byte ^ (crc & 0xff)
  tmp = (tmp ^ (tmp << 4)) & 0xff
  return (((crc >> 8) & 0xff) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff
}

function mavCrc(bytes: number[], crcExtra: number): number {
  let crc = 0xffff
  for (const b of bytes) crc = crcAccumulate(b, crc)
  crc = crcAccumulate(crcExtra, crc)
  return crc
}

/**
 * Encode a MAVLink v1 COMMAND_LONG frame. Used for arm/disarm/takeoff.
 * CRC is computed correctly; still, validate against real hardware before flight.
 */
export function encodeCommandLong(opts: {
  seq?: number
  targetSystem?: number
  targetComponent?: number
  command: number
  params?: number[]
}): Uint8Array {
  const seq = opts.seq ?? 0
  const targetSystem = opts.targetSystem ?? 1
  const targetComponent = opts.targetComponent ?? 1
  const params = (opts.params ?? []).slice(0, 7)
  while (params.length < 7) params.push(0)

  // COMMAND_LONG payload (33 bytes): 7×float params, uint16 command, u8 tsys, u8 tcomp, u8 confirmation
  const payload = new Uint8Array(33)
  const dv = new DataView(payload.buffer)
  for (let i = 0; i < 7; i++) dv.setFloat32(i * 4, params[i], true)
  dv.setUint16(28, opts.command, true)
  dv.setUint8(30, targetSystem)
  dv.setUint8(31, targetComponent)
  dv.setUint8(32, 0) // confirmation

  const len = payload.length
  const header = [len, seq, 255 /*GCS sysid*/, 190 /*GCS compid*/, MSG.COMMAND_LONG]
  const crc = mavCrc([...header, ...payload], CRC_EXTRA[MSG.COMMAND_LONG])

  const frame = new Uint8Array(6 + len + 2)
  frame[0] = 0xfe
  frame.set(header, 1)
  frame.set(payload, 6)
  frame[6 + len] = crc & 0xff
  frame[6 + len + 1] = (crc >> 8) & 0xff
  return frame
}

// MAV_CMD constants used by the flight controls
export const MAV_CMD = {
  COMPONENT_ARM_DISARM: 400,
  NAV_TAKEOFF: 22,
  NAV_RETURN_TO_LAUNCH: 20,
  NAV_LAND: 21,
} as const

/** Map a GCS command name to a MAVLink COMMAND_LONG frame (or null if unmapped). */
export function commandToMavlink(command: string, params?: Record<string, unknown>): Uint8Array | null {
  switch (command) {
    case 'arm':
      return encodeCommandLong({ command: MAV_CMD.COMPONENT_ARM_DISARM, params: [1] })
    case 'disarm':
      return encodeCommandLong({ command: MAV_CMD.COMPONENT_ARM_DISARM, params: [0] })
    case 'takeoff': {
      const alt = typeof params?.altitude === 'number' ? params.altitude : 10
      return encodeCommandLong({ command: MAV_CMD.NAV_TAKEOFF, params: [0, 0, 0, 0, 0, 0, alt] })
    }
    case 'rtl':
      return encodeCommandLong({ command: MAV_CMD.NAV_RETURN_TO_LAUNCH })
    case 'land':
      return encodeCommandLong({ command: MAV_CMD.NAV_LAND })
    default:
      return null
  }
}
