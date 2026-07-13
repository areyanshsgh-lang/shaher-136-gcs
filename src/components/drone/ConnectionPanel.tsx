'use client'

import { useEffect, useRef } from 'react'
import { DroneLink } from '@/lib/drone-link'
import { FlightSim } from '@/lib/flight-sim'
import { useDroneStore } from '@/lib/drone-store'
import SectionCard from './SectionCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Wifi,
  WifiOff,
  Radio,
  Send,
  Shield,
  ShieldOff,
  PlaneTakeoff,
  PlaneLanding,
  Home,
  RotateCcw,
  Play,
  Pause,
  Gauge,
} from 'lucide-react'

interface TelemetryMsg {
  lat: number; lng: number; alt: number; speed: number; heading: number
  roll: number; pitch: number; yaw: number; battery: number
  gpsFix: boolean; satellites: number
}
interface StatusMsg { armed: boolean; mode: string; gpsFix: boolean; batteryLevel: number }

export default function ConnectionPanel() {
  const socketRef = useRef<DroneLink | null>(null)
  const {
    connectionStatus,
    setConnectionStatus,
    connectedDrones,
    setConnectedDrones,
    droneStatus,
    setDroneStatus,
    setTelemetry,
    missionStatus,
    setMissionStatus,
    addLog,
    simulationMode,
    setSimulationMode,
    simulationRunning,
    setSimulationRunning,
  } = useDroneStore()

  const connect = () => {
    if (socketRef.current?.connected) return
    setConnectionStatus('connecting')

    const relayUrl = useDroneStore.getState().settings.relayUrl
    const link = new DroneLink(relayUrl || undefined)
    addLog({ level: 'info', message: `Connecting to drone service (${link.endpoint})...`, source: 'gcs' })

    link.on('connect', () => {
      setConnectionStatus('connected')
      link.emit('register', { role: 'gcs' })
      addLog({ level: 'info', message: 'Connected to drone service', source: 'gcs' })
      ;(window as unknown as Record<string, unknown>).__droneSocket = link
    })

    link.on('disconnect', () => {
      setConnectionStatus('disconnected')
      addLog({ level: 'warn', message: 'Disconnected from drone service (retrying...)', source: 'gcs' })
    })

    link.on('telemetry', (raw) => {
      const d = raw as TelemetryMsg
      setTelemetry({
        lat: d.lat, lng: d.lng, alt: d.alt, speed: d.speed,
        heading: d.heading, roll: d.roll, pitch: d.pitch, yaw: d.yaw,
        battery: d.battery, gpsFix: d.gpsFix, satellites: d.satellites,
      })
    })

    link.on('drone-status', (raw) => {
      const d = raw as StatusMsg
      setDroneStatus({ armed: d.armed, mode: d.mode, gpsFix: d.gpsFix, batteryLevel: d.batteryLevel })
    })

    link.on('drone-log', (raw) => {
      const d = raw as { level?: 'info' | 'warn' | 'error' | 'debug'; message: string }
      addLog({ level: d.level || 'info', message: d.message, source: 'drone' })
    })

    link.on('drones-list', (raw) => { setConnectedDrones((raw as { drones?: unknown[] }).drones?.length || 0) })
    link.on('clients-update', (raw) => { setConnectedDrones((raw as { drones?: unknown[] }).drones?.length || 0) })

    link.on('drone-disconnected', (raw) => {
      addLog({ level: 'warn', message: `Drone disconnected: ${(raw as { reason?: string }).reason ?? 'unknown'}`, source: 'system' })
      setConnectedDrones(0)
    })

    link.on('command-ack', (raw) => {
      addLog({ level: 'info', message: `Command "${(raw as { command?: string }).command ?? ''}" acknowledged`, source: 'gcs' })
    })

    link.on('mission-ack', (raw) => {
      addLog({ level: 'info', message: `Mission uploaded: ${(raw as { waypointCount?: number }).waypointCount ?? 0} waypoints`, source: 'gcs' })
      setMissionStatus('idle')
    })

    socketRef.current = link
    link.connect()
  }

  const disconnect = () => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null }
    ;(window as unknown as Record<string, unknown>).__droneSocket = null
    setConnectionStatus('disconnected')
    setConnectedDrones(0)
    addLog({ level: 'info', message: 'Disconnected from drone service', source: 'gcs' })
  }

  const sendCommand = (command: string, params?: Record<string, unknown>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('command', { command, params })
      addLog({ level: 'info', message: `Sending command: ${command}`, source: 'gcs' })
    } else {
      addLog({ level: 'error', message: `Cannot send command: not connected`, source: 'gcs' })
    }
  }

  useEffect(() => {
    if (!simulationMode || !simulationRunning) return
    const sim = new FlightSim()
    sim.reset()
    const interval = setInterval(() => {
      // Read waypoints live so editing the mission doesn't restart the sim.
      const waypoints = useDroneStore.getState().waypoints
      const { telemetry, status } = sim.tick(0.04, waypoints)
      setTelemetry(telemetry)
      setDroneStatus(status)
    }, 40)
    return () => clearInterval(interval)
  }, [simulationMode, simulationRunning, setTelemetry, setDroneStatus])

  // Tear the link down if this panel unmounts.
  useEffect(() => {
    return () => { socketRef.current?.disconnect() }
  }, [])

  const statusColor =
    connectionStatus === 'connected' ? 'text-emerald-500' :
    connectionStatus === 'connecting' ? 'text-amber-500' : 'text-muted-foreground'

  const statusText =
    connectionStatus === 'connected' ? 'Connected' :
    connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'

  return (
    <div className="space-y-2">
      {/* Connection */}
      <SectionCard
        title="Connection"
        icon={Radio}
        accent="emerald"
        bodyClassName="p-2.5 space-y-2.5"
        action={
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-emerald-500 signal-live' :
              connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/40'
            }`} />
            <span className={`text-[10px] font-medium ${statusColor}`}>{statusText}</span>
          </div>
        }
      >
          <Button
            variant={connectionStatus === 'connected' ? 'outline' : 'default'}
            size="sm"
            className="w-full h-7 text-xs gap-1.5"
            onClick={connectionStatus === 'connected' ? disconnect : connect}
          >
            {connectionStatus === 'connected'
              ? <><WifiOff className="h-3 w-3" /> Disconnect</>
              : <><Wifi className="h-3 w-3" /> Connect</>
            }
          </Button>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Drones</span>
            <Badge variant={connectedDrones > 0 ? 'default' : 'secondary'} className="text-[9px] h-4 px-1.5">
              {connectedDrones}
            </Badge>
          </div>

          <Separator />

          {/* Simulation */}
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Simulation Mode</Label>
            <Switch checked={simulationMode} onCheckedChange={setSimulationMode} />
          </div>

          {simulationMode && (
            <Button
              variant={simulationRunning ? 'destructive' : 'default'}
              size="sm"
              className="w-full h-7 text-xs gap-1.5"
              onClick={() => {
                setSimulationRunning(!simulationRunning)
                addLog({ level: 'info', message: simulationRunning ? 'Simulation paused' : 'Simulation started', source: 'system' })
              }}
            >
              {simulationRunning
                ? <><Pause className="h-3 w-3" /> Pause Sim</>
                : <><Play className="h-3 w-3" /> Start Sim</>
              }
            </Button>
          )}
      </SectionCard>

      {/* Flight Controls */}
      <SectionCard title="Flight Controls" icon={Gauge} accent="amber" bodyClassName="p-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => sendCommand('arm')}>
              <Shield className="h-3 w-3" /> Arm
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => sendCommand('disarm')}>
              <ShieldOff className="h-3 w-3" /> Disarm
            </Button>
            <Button variant="default" size="sm" className="h-7 text-[10px] gap-1" onClick={() => sendCommand('takeoff', { altitude: 50 })}>
              <PlaneTakeoff className="h-3 w-3" /> Takeoff
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => sendCommand('land')}>
              <PlaneLanding className="h-3 w-3" /> Land
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => sendCommand('rtl')}>
              <Home className="h-3 w-3" /> RTL
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={() => sendCommand('emergency_stop')}>
              <RotateCcw className="h-3 w-3" /> E-Stop
            </Button>
          </div>

          <Separator />

          {/* Quick Command */}
          <div className="flex gap-1">
            <Input
              placeholder="Command..."
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendCommand((e.target as HTMLInputElement).value)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
            />
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={(e) => {
              const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
              if (input.value.trim()) { sendCommand(input.value); input.value = '' }
            }}>
              <Send className="h-3 w-3" />
            </Button>
          </div>
      </SectionCard>
    </div>
  )
}