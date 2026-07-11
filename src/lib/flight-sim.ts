/*
 * FlightSim — a lightweight kinematic simulator that actually flies the
 * mission you planned. Given the current waypoint list, it takes off, cruises
 * from waypoint to waypoint at each leg's speed, loiters/lands per the waypoint
 * action, and reports realistic-ish telemetry + status.
 *
 * It's a demo model, not a physics engine: no wind, no real dynamics — just
 * enough to preview a route and drive the whole UI convincingly.
 */

import type { Waypoint, Telemetry, DroneStatus } from './drone-store'

const M_PER_DEG = 111_320 // metres per degree of latitude (good enough locally)
const TIME_SCALE = 4 // run the mission ~4x real-time so it's watchable
const CLIMB_RATE = 4 // m/s vertical
const REACH_RADIUS = 4 // metres — "arrived" threshold
const BATTERY_DRAIN = 0.15 // % per simulated second
const CELLS = 3 // assume a 3S LiPo for the voltage readout

// Base point used only when there is no mission to fly (gentle orbit).
const IDLE_LAT = 12.9716
const IDLE_LNG = 77.5946

type Phase = 'init' | 'takeoff' | 'cruise' | 'loiter' | 'land' | 'hold' | 'done'

interface Pos {
  lat: number
  lng: number
  alt: number
}

export interface SimFrame {
  telemetry: Partial<Telemetry>
  status: Partial<DroneStatus>
}

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = (bLng - aLng) * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  const y = bLat - aLat
  return Math.sqrt(x * x + y * y) * M_PER_DEG
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((bLat * Math.PI) / 180)
  const x =
    Math.cos((aLat * Math.PI) / 180) * Math.sin((bLat * Math.PI) / 180) -
    Math.sin((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

export class FlightSim {
  private t = 0
  private pos: Pos = { lat: IDLE_LAT, lng: IDLE_LNG, alt: 0 }
  private wpIndex = 0
  private phase: Phase = 'init'
  private loiterLeft = 0
  private heading = 0
  private prevHeading = 0
  private roll = 0
  private pitch = 0
  private battery = 100

  /** Restart the mission from the top. */
  reset(): void {
    this.t = 0
    this.wpIndex = 0
    this.phase = 'init'
    this.loiterLeft = 0
    this.heading = 0
    this.prevHeading = 0
    this.roll = 0
    this.pitch = 0
    this.battery = 100
    this.pos = { lat: IDLE_LAT, lng: IDLE_LNG, alt: 0 }
  }

  /** Advance the simulation by `dtReal` seconds and return a telemetry frame. */
  tick(dtReal: number, waypoints: Waypoint[]): SimFrame {
    const dt = dtReal * TIME_SCALE
    this.t += dt
    this.battery = Math.max(0, this.battery - dt * BATTERY_DRAIN)

    // No mission → gentle orbit so there is still something on the map.
    if (waypoints.length === 0) {
      const r = 0.0015
      this.pos = {
        lat: IDLE_LAT + Math.sin(this.t * 0.25) * r,
        lng: IDLE_LNG + Math.cos(this.t * 0.25) * r,
        alt: 40,
      }
      this.heading = (this.t * 25) % 360
      return this.frame(11, false, 'STABILIZE', 0)
    }

    const sorted = [...waypoints].sort((a, b) => a.order - b.order)

    if (this.phase === 'init') {
      const start = sorted[0]
      this.pos = { lat: start.latitude, lng: start.longitude, alt: 0 }
      this.wpIndex = 0
      this.phase = 'takeoff'
    }

    let speed = 0
    this.prevHeading = this.heading

    switch (this.phase) {
      case 'takeoff': {
        const target = sorted[Math.min(this.wpIndex, sorted.length - 1)]
        this.pos.alt = Math.min(target.altitude, this.pos.alt + CLIMB_RATE * dt)
        if (this.pos.alt >= target.altitude - 0.5) {
          this.phase = sorted.length > 1 ? 'cruise' : 'hold'
          if (sorted.length > 1) this.wpIndex = 1
        }
        break
      }
      case 'cruise': {
        const target = sorted[this.wpIndex]
        speed = target.speed
        const dist = metresBetween(this.pos.lat, this.pos.lng, target.latitude, target.longitude)
        this.heading = bearingDeg(this.pos.lat, this.pos.lng, target.latitude, target.longitude)
        // ramp altitude toward this leg's target
        const dAlt = target.altitude - this.pos.alt
        this.pos.alt += Math.sign(dAlt) * Math.min(Math.abs(dAlt), CLIMB_RATE * dt)

        const stepM = speed * dt
        if (dist <= Math.max(stepM, REACH_RADIUS)) {
          this.pos.lat = target.latitude
          this.pos.lng = target.longitude
          this.arriveAt(target, sorted)
        } else {
          const frac = stepM / dist
          this.pos.lat += (target.latitude - this.pos.lat) * frac
          this.pos.lng += (target.longitude - this.pos.lng) * frac
        }
        break
      }
      case 'loiter': {
        this.loiterLeft -= dt
        // slow circle in place
        this.heading = (this.heading + 40 * dt) % 360
        speed = 1
        if (this.loiterLeft <= 0) this.advance(sorted)
        break
      }
      case 'land': {
        this.pos.alt = Math.max(0, this.pos.alt - CLIMB_RATE * dt)
        if (this.pos.alt <= 0.1) this.phase = 'done'
        break
      }
      case 'hold': {
        // hover at the last point with a tiny heading drift
        this.heading = (this.heading + 5 * dt) % 360
        speed = 0
        break
      }
      case 'done':
        speed = 0
        break
    }

    // Derive a little roll from how fast we're turning, and pitch from speed.
    let dHead = this.heading - this.prevHeading
    if (dHead > 180) dHead -= 360
    if (dHead < -180) dHead += 360
    const turnRate = dt > 0 ? dHead / dt : 0
    // Ease roll/pitch toward their targets so the attitude reads smoothly.
    const rollTarget = Math.max(-25, Math.min(25, turnRate * 0.4))
    this.roll += (rollTarget - this.roll) * 0.18
    const pitchTarget = speed > 0.5 ? -Math.min(8, speed * 0.6) : 0
    this.pitch += (pitchTarget - this.pitch) * 0.18

    const armed = this.phase !== 'done'
    const mode =
      this.phase === 'loiter' ? 'LOITER' : this.phase === 'land' ? 'LAND' : this.phase === 'done' ? 'STABILIZE' : 'AUTO'

    return this.frame(12, armed, mode, speed, this.pitch)
  }

  private arriveAt(wp: Waypoint, sorted: Waypoint[]): void {
    if (wp.action === 'loiter') {
      this.phase = 'loiter'
      this.loiterLeft = Math.max(3, wp.loiterTime) // at least a visible pause
    } else if (wp.action === 'land') {
      this.phase = 'land'
    } else {
      this.advance(sorted)
    }
  }

  private advance(sorted: Waypoint[]): void {
    this.wpIndex += 1
    if (this.wpIndex >= sorted.length) {
      this.phase = 'hold'
    } else {
      this.phase = 'cruise'
    }
  }

  private frame(sats: number, armed: boolean, mode: string, speed: number, pitch = 0): SimFrame {
    const vMin = 3.3 * CELLS
    const vMax = 4.2 * CELLS
    const voltage = vMin + (this.battery / 100) * (vMax - vMin)
    return {
      telemetry: {
        lat: this.pos.lat,
        lng: this.pos.lng,
        alt: this.pos.alt,
        speed,
        heading: this.heading,
        roll: this.roll,
        pitch,
        yaw: this.heading,
        battery: Number(voltage.toFixed(2)),
        gpsFix: true,
        satellites: sats,
      },
      status: {
        armed,
        mode,
        gpsFix: true,
        batteryLevel: Math.round(this.battery),
      },
    }
  }
}
