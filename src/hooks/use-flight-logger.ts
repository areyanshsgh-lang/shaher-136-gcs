'use client'

import { useEffect } from 'react'
import { useDroneStore } from '@/lib/drone-store'

const LOG_INTERVAL_MS = 3000

/**
 * Records periodic telemetry snapshots to the FlightLog table while a mission
 * is live — either the simulator is running or a real drone is connected.
 * Fire-and-forget: a failed write never disrupts the UI.
 */
export function useFlightLogger() {
  const simulationRunning = useDroneStore((s) => s.simulationRunning)
  const connectionStatus = useDroneStore((s) => s.connectionStatus)
  const active = simulationRunning || connectionStatus === 'connected'

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      const { telemetry, droneStatus, currentMissionId } = useDroneStore.getState()
      if (telemetry.lat == null || telemetry.lng == null) return
      fetch('/api/flight-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: currentMissionId ?? undefined,
          latitude: telemetry.lat,
          longitude: telemetry.lng,
          altitude: telemetry.alt ?? undefined,
          speed: telemetry.speed ?? undefined,
          heading: telemetry.heading ?? undefined,
          roll: telemetry.roll ?? undefined,
          pitch: telemetry.pitch ?? undefined,
          yaw: telemetry.yaw ?? undefined,
          battery: droneStatus.batteryLevel ?? undefined,
        }),
      }).catch(() => {})
    }, LOG_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [active])
}
