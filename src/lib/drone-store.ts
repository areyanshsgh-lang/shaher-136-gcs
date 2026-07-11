import { create } from 'zustand'

export interface Waypoint {
  id: string
  order: number
  latitude: number
  longitude: number
  altitude: number
  speed: number
  action: 'fly_to' | 'loiter' | 'land' | 'takeoff'
  loiterTime: number
}

export interface Telemetry {
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

export interface DroneStatus {
  armed: boolean
  mode: string
  gpsFix: boolean
  batteryLevel: number
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: 'drone' | 'gcs' | 'system'
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface DroneState {
  // Connection
  connectionStatus: ConnectionStatus
  connectedDrones: number
  setConnectionStatus: (status: ConnectionStatus) => void
  setConnectedDrones: (count: number) => void

  // Telemetry
  telemetry: Telemetry
  setTelemetry: (data: Partial<Telemetry>) => void

  // Drone Status
  droneStatus: DroneStatus
  setDroneStatus: (data: Partial<DroneStatus>) => void

  // Mission / Waypoints
  waypoints: Waypoint[]
  selectedWaypointId: string | null
  setWaypoints: (waypoints: Waypoint[]) => void
  addWaypoint: (waypoint: Waypoint) => void
  removeWaypoint: (id: string) => void
  updateWaypoint: (id: string, data: Partial<Waypoint>) => void
  clearWaypoints: () => void
  selectWaypoint: (id: string | null) => void
  reorderWaypoints: (waypoints: Waypoint[]) => void

  // Mission
  currentMissionId: string | null
  missionStatus: 'idle' | 'uploading' | 'active' | 'paused' | 'completed' | 'error'
  setCurrentMissionId: (id: string | null) => void
  setMissionStatus: (status: 'idle' | 'uploading' | 'active' | 'paused' | 'completed' | 'error') => void

  // Logs
  logs: LogEntry[]
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void

  // Camera
  cameraActive: boolean
  setCameraActive: (active: boolean) => void

  // Simulation
  simulationMode: boolean
  setSimulationMode: (mode: boolean) => void
  simulationRunning: boolean
  setSimulationRunning: (running: boolean) => void
}

const defaultTelemetry: Telemetry = {
  lat: null,
  lng: null,
  alt: null,
  speed: null,
  heading: null,
  roll: 0,
  pitch: 0,
  yaw: 0,
  battery: null,
  gpsFix: false,
  satellites: 0,
}

const defaultDroneStatus: DroneStatus = {
  armed: false,
  mode: 'STABILIZE',
  gpsFix: false,
  batteryLevel: 100,
}

export const useDroneStore = create<DroneState>((set, get) => ({
  // Connection
  connectionStatus: 'disconnected',
  connectedDrones: 0,
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectedDrones: (count) => set({ connectedDrones: count }),

  // Telemetry
  telemetry: { ...defaultTelemetry },
  setTelemetry: (data) =>
    set((state) => ({ telemetry: { ...state.telemetry, ...data } })),

  // Drone Status
  droneStatus: { ...defaultDroneStatus },
  setDroneStatus: (data) =>
    set((state) => ({ droneStatus: { ...state.droneStatus, ...data } })),

  // Waypoints
  waypoints: [],
  selectedWaypointId: null,
  setWaypoints: (waypoints) => set({ waypoints }),
  addWaypoint: (waypoint) =>
    set((state) => ({
      waypoints: [...state.waypoints, waypoint],
    })),
  removeWaypoint: (id) =>
    set((state) => ({
      waypoints: state.waypoints
        .filter((w) => w.id !== id)
        .map((w, i) => ({ ...w, order: i })),
      selectedWaypointId:
        state.selectedWaypointId === id ? null : state.selectedWaypointId,
    })),
  updateWaypoint: (id, data) =>
    set((state) => ({
      waypoints: state.waypoints.map((w) =>
        w.id === id ? { ...w, ...data } : w
      ),
    })),
  clearWaypoints: () => set({ waypoints: [], selectedWaypointId: null }),
  selectWaypoint: (id) => set({ selectedWaypointId: id }),
  reorderWaypoints: (waypoints) => set({ waypoints }),

  // Mission
  currentMissionId: null,
  missionStatus: 'idle',
  setCurrentMissionId: (id) => set({ currentMissionId: id }),
  setMissionStatus: (status) => set({ missionStatus: status }),

  // Logs
  logs: [],
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs.slice(-499), // Keep last 500
        {
          ...entry,
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
        },
      ],
    })),
  clearLogs: () => set({ logs: [] }),

  // Camera
  cameraActive: false,
  setCameraActive: (active) => set({ cameraActive: active }),

  // Simulation
  simulationMode: false,
  setSimulationMode: (mode) => set({ simulationMode: mode }),
  simulationRunning: false,
  setSimulationRunning: (running) => set({ simulationRunning: running }),
}))