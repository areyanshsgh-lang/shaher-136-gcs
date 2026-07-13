'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useDroneStore, type Waypoint } from '@/lib/drone-store'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MapPin,
  Plus,
  Trash2,
  Upload,
  Crosshair,
  Navigation,
  LocateFixed,
  Globe,
  Flag,
} from 'lucide-react'

// Real dark/light basemaps (CARTO — free, no API key) instead of a CSS filter hack.
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
const LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
// Satellite / aerial imagery (Esri World Imagery — free, no API key) for a realistic 3D-ish look.
const SAT_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SAT_ATTRIB = 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
// "You are here" marker (cyan dot) — distinct from the blue drone marker.
const USER_LOC_HTML =
  '<div style="width:16px;height:16px;background:#22d3ee;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(34,211,238,0.9);"></div>'

const ACTION_COLORS: Record<string, string> = {
  fly_to: '#f59e0b',
  loiter: '#3b82f6',
  land: '#ef4444',
  takeoff: '#22c55e',
}

const ACTION_LABELS: Record<string, string> = {
  fly_to: 'Fly To',
  loiter: 'Loiter',
  land: 'Land',
  takeoff: 'Takeoff',
}

export default function MapPanel() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const pathLineRef = useRef<L.Polyline | null>(null)
  const droneMarkerRef = useRef<L.Marker | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const userLocRef = useRef<{ lat: number; lng: number } | null>(null)
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [coordInput, setCoordInput] = useState('')
  const addingRef = useRef(false)
  const waypointsCountRef = useRef(0)

  const {
    waypoints,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    selectWaypoint,
    selectedWaypointId,
    telemetry,
    addLog,
  } = useDroneStore()

  // Keep refs in sync with state so the map click handler always reads fresh values
  addingRef.current = isAddingWaypoint
  waypointsCountRef.current = waypoints.length

  // Initialize Leaflet map
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    // Dynamic import to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icon paths
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, {
        center: [12.9716, 77.5946], // Bangalore, India (user timezone)
        zoom: 15,
        zoomControl: true,
        zoomSnap: 0.25,
        zoomDelta: 0.25,
        wheelPxPerZoomLevel: 480,
        scrollWheelZoom: 'center',
      })

      const isDark = document.documentElement.classList.contains('dark')
      const tacticalLayer = L.tileLayer(DARK_TILE_URL, { attribution: TILE_ATTRIB, maxZoom: 20 })
      const streetsLayer = L.tileLayer(LIGHT_TILE_URL, { attribution: TILE_ATTRIB, maxZoom: 20 })
      const satelliteLayer = L.tileLayer(SAT_TILE_URL, { attribution: SAT_ATTRIB, maxZoom: 19 })

      const baseLayer = isDark ? tacticalLayer : streetsLayer
      baseLayer.addTo(map)
      tileLayerRef.current = baseLayer

      // Basemap switcher (top-right): Tactical dark · Satellite (aerial) · Streets
      L.control
        .layers(
          { Tactical: tacticalLayer, Satellite: satelliteLayer, Streets: streetsLayer },
          {},
          { position: 'topright', collapsed: true },
        )
        .addTo(map)

      markersLayerRef.current = L.layerGroup().addTo(map)
      pathLineRef.current = L.polyline([], {
        color: '#f59e0b',
        weight: 2,
        opacity: 0.7,
        dashArray: '8, 8',
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)

      // Open over the user's real location if they allow it (falls back to the default view).
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords
            userLocRef.current = { lat: latitude, lng: longitude }
            map.setView([latitude, longitude], 15)
            userMarkerRef.current = L.marker([latitude, longitude], {
              icon: L.divIcon({ className: 'user-loc-marker', html: USER_LOC_HTML, iconSize: [16, 16], iconAnchor: [8, 8] }),
              title: 'Your location',
            }).addTo(map)
          },
          () => {
            /* permission denied / unavailable → keep the default center */
          },
          { enableHighAccuracy: true, timeout: 8000 },
        )
      }

      // Handle map click for adding waypoints (uses refs to avoid stale closure)
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!addingRef.current) return
        const s = useDroneStore.getState().settings
        const newWaypoint: Waypoint = {
          id: Math.random().toString(36).substr(2, 9),
          order: waypointsCountRef.current,
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          altitude: s.defaultAltitude,
          speed: s.defaultSpeed,
          action: 'fly_to',
          loiterTime: 0,
        }
        addWaypoint(newWaypoint)
        selectWaypoint(newWaypoint.id)
        setIsAddingWaypoint(false)
      })

      return () => {
        map.remove()
        mapInstanceRef.current = null
      }
    })
  }, [])

  // Update markers and path when waypoints change
  useEffect(() => {
    if (!mapReady || !markersLayerRef.current || !pathLineRef.current) return

    import('leaflet').then((L) => {
      const layer = markersLayerRef.current!
      const line = pathLineRef.current!

      layer.clearLayers()

      const latlngs: L.LatLngExpression[] = []
      const sortedWps = [...waypoints].sort((a, b) => a.order - b.order)

      sortedWps.forEach((wp, idx) => {
        const color = ACTION_COLORS[wp.action] || '#f59e0b'
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            background: ${color};
            color: white;
            width: 28px; height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            border: 2px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            cursor: pointer;
          ">${idx + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([wp.latitude, wp.longitude], { icon })
        marker.bindTooltip(
          `<b>WP ${idx + 1}</b> - ${ACTION_LABELS[wp.action]}<br/>` +
          `Alt: ${wp.altitude}m | Spd: ${wp.speed}m/s<br/>` +
          `(${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)})`,
          { direction: 'top', offset: [0, -16] }
        )

        marker.on('click', (e: L.LeafletMouseEvent) => {
          if (addingRef.current) {
            // In "Add WP" mode a click means "place a waypoint here" — even on top
            // of an existing marker — instead of opening the existing one's editor.
            const s = useDroneStore.getState().settings
            const nw: Waypoint = {
              id: Math.random().toString(36).substr(2, 9),
              order: waypointsCountRef.current,
              latitude: e.latlng.lat,
              longitude: e.latlng.lng,
              altitude: s.defaultAltitude,
              speed: s.defaultSpeed,
              action: 'fly_to',
              loiterTime: 0,
            }
            addWaypoint(nw)
            selectWaypoint(nw.id)
            setIsAddingWaypoint(false)
          } else {
            selectWaypoint(wp.id)
          }
        })
        layer.addLayer(marker)
        latlngs.push([wp.latitude, wp.longitude])
      })

      line.setLatLngs(latlngs)
    })
  }, [waypoints, mapReady, selectWaypoint, addWaypoint])

  // Update drone marker position
  useEffect(() => {
    if (!mapReady || telemetry.lat == null || telemetry.lng == null) return
    const lat = telemetry.lat
    const lng = telemetry.lng
    import('leaflet').then((L) => {
      if (droneMarkerRef.current) {
        droneMarkerRef.current.setLatLng([lat, lng])
      } else {
        const droneIcon = L.divIcon({
          className: 'drone-marker',
          html: `<div style="
            width: 20px; height: 20px;
            background: #3b82f6;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(59,130,246,0.6), 0 0 20px rgba(59,130,246,0.3);
            animation: pulse 2s infinite;
          "></div>
          <style>
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 10px rgba(59,130,246,0.6), 0 0 20px rgba(59,130,246,0.3); }
              50% { box-shadow: 0 0 15px rgba(59,130,246,0.8), 0 0 30px rgba(59,130,246,0.5); }
            }
          </style>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        })
        droneMarkerRef.current = L.marker([lat, lng], { icon: droneIcon })
          .addTo(mapInstanceRef.current!)
      }
    })
  }, [telemetry.lat, telemetry.lng, mapReady])

  // Fly to waypoint when selected
  const flyToWaypoint = useCallback((wp: Waypoint) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([wp.latitude, wp.longitude], 17, { duration: 0.5 })
    }
  }, [])

  // Locate the user; optionally drop a waypoint at their position.
  const showUserLocation = useCallback(
    (opts: { fly?: boolean; addWp?: boolean } = {}) => {
      const { fly = true, addWp = false } = opts
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        addLog({ level: 'error', message: 'Geolocation is not available in this browser', source: 'gcs' })
        return
      }
      addLog({ level: 'info', message: 'Getting your location…', source: 'gcs' })
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          userLocRef.current = { lat, lng }
          import('leaflet').then((L) => {
            const map = mapInstanceRef.current
            if (!map) return
            if (userMarkerRef.current) {
              userMarkerRef.current.setLatLng([lat, lng])
            } else {
              userMarkerRef.current = L.marker([lat, lng], {
                icon: L.divIcon({ className: 'user-loc-marker', html: USER_LOC_HTML, iconSize: [16, 16], iconAnchor: [8, 8] }),
                title: 'Your location',
              }).addTo(map)
            }
            if (fly) map.flyTo([lat, lng], 16, { duration: 0.6 })
            if (addWp) {
              const s = useDroneStore.getState().settings
              const nw: Waypoint = {
                id: Math.random().toString(36).substr(2, 9),
                order: waypointsCountRef.current,
                latitude: lat,
                longitude: lng,
                altitude: s.defaultAltitude,
                speed: s.defaultSpeed,
                action: 'takeoff', // your current location is the launch point
                loiterTime: 0,
              }
              addWaypoint(nw)
              selectWaypoint(nw.id)
            }
          })
          addLog({ level: 'info', message: `Your location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'gcs' })
        },
        (err) => {
          const reason =
            err.code === 1
              ? "Location permission is blocked. Click the location / site-info icon in your browser's address bar and allow it. On Mac also turn ON System Settings → Privacy & Security → Location Services (and enable it for your browser)."
              : err.code === 2
                ? 'Your location is unavailable. On Mac, turn ON System Settings → Privacy & Security → Location Services and enable it for your browser, then try again.'
                : err.code === 3
                  ? 'The location request timed out — click again.'
                  : err.message
          addLog({ level: 'error', message: `Location failed: ${reason}`, source: 'gcs' })
          if (typeof window !== 'undefined') window.alert('Could not get your location.\n\n' + reason)
        },
        { enableHighAccuracy: true, timeout: 10000 },
      )
    },
    [addLog, addWaypoint, selectWaypoint],
  )

  // Fly to typed "lat, lng" coordinates.
  const goToCoords = useCallback(() => {
    const nums = coordInput.split(/[\s,]+/).map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n))
    if (nums.length < 2) {
      addLog({ level: 'warn', message: 'Enter coordinates as "lat, lng"', source: 'gcs' })
      return
    }
    const [lat, lng] = nums
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      addLog({ level: 'warn', message: 'Coordinates out of range (lat ±90, lng ±180)', source: 'gcs' })
      return
    }
    mapInstanceRef.current?.flyTo([lat, lng], 15, { duration: 0.6 })
    addLog({ level: 'info', message: `Flying to ${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'gcs' })
  }, [coordInput, addLog])

  const selectedWp = waypoints.find((w) => w.id === selectedWaypointId)

  return (
    <Card className="relative border-border/50 h-full flex flex-col overflow-hidden">
      {/* glowing edge accents — cyan (left) · amber (right) */}
      <div className="pointer-events-none absolute left-0 top-10 bottom-10 w-[3px] rounded-full bg-gradient-to-b from-transparent via-cyan-400/60 to-transparent z-20" />
      <div className="pointer-events-none absolute right-0 top-10 bottom-10 w-[3px] rounded-full bg-gradient-to-b from-transparent via-amber-500/60 to-transparent z-20" />
      <CardHeader className="relative p-3 flex-shrink-0 space-y-2.5">
        {/* soft dual glows behind the header */}
        <div className="pointer-events-none absolute -top-16 left-8 h-28 w-56 rounded-full bg-cyan-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -top-16 right-8 h-28 w-56 rounded-full bg-amber-500/5 blur-3xl" />

        {/* Row 1 — title + waypoints + Add WP */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Navigation className="h-6 w-6 text-cyan-400 shrink-0 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight leading-none">
                <span className="text-foreground">MISSION</span> <span className="text-cyan-400">MAP</span>
              </h2>
              <div className="mt-1.5 h-0.5 w-24 rounded-full bg-gradient-to-r from-cyan-400 via-cyan-400/40 to-transparent" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {telemetry.lat != null && telemetry.lng != null && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1.5 rounded-lg font-medium border-cyan-500/50 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20"
                onClick={() => {
                  mapInstanceRef.current?.flyTo([telemetry.lat!, telemetry.lng!], 17, { duration: 0.5 })
                }}
              >
                <Crosshair className="h-3.5 w-3.5" /> Drone
              </Button>
            )}
            <div className="hidden sm:flex items-center gap-1.5 h-9 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3">
              <Flag className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-300 whitespace-nowrap tabular-nums">{waypoints.length} waypoints</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs rounded-lg font-semibold border-amber-500/60 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
              onClick={() => setIsAddingWaypoint(!isAddingWaypoint)}
            >
              {isAddingWaypoint ? (
                <>Click map…</>
              ) : (
                <><Plus className="h-3.5 w-3.5" /> Add WP</>
              )}
            </Button>
          </div>
        </div>

        {/* Row 2 — location tools + coordinate go-to */}
        <div className="relative flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs rounded-lg font-medium border-cyan-500/50 text-foreground bg-cyan-500/5 hover:bg-cyan-500/15"
            onClick={() => showUserLocation({ fly: true })}
          >
            <LocateFixed className="h-3.5 w-3.5 text-cyan-400" /> My Location
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs rounded-lg font-medium border-amber-500/50 text-foreground bg-amber-500/5 hover:bg-amber-500/15"
            onClick={() => showUserLocation({ fly: true, addWp: true })}
          >
            <MapPin className="h-3.5 w-3.5 text-amber-400" /> WP Here
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={coordInput}
                onChange={(e) => setCoordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') goToCoords()
                }}
                placeholder="lat, lng"
                className="h-9 pl-8 w-40 text-xs rounded-lg font-mono"
              />
            </div>
            <Button
              size="sm"
              className="h-9 px-5 text-xs rounded-lg font-semibold bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/30 border-0"
              onClick={goToCoords}
            >
              Go
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 relative min-h-0 map-viewport overflow-hidden rounded-b-xl">
        <div ref={mapRef} className="absolute inset-0 z-0" />

        {/* Selected Waypoint Editor (overlay on map) */}
        {selectedWp && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-500" />
                Waypoint {selectedWp.order + 1}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => flyToWaypoint(selectedWp)}
                >
                  <Crosshair className="h-3 w-3 mr-0.5" /> Focus
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-destructive hover:text-destructive"
                  onClick={() => removeWaypoint(selectedWp.id)}
                >
                  <Trash2 className="h-3 w-3 mr-0.5" /> Remove
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => selectWaypoint(null)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Lat</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={selectedWp.latitude}
                  onChange={(e) => updateWaypoint(selectedWp.id, { latitude: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Lng</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={selectedWp.longitude}
                  onChange={(e) => updateWaypoint(selectedWp.id, { longitude: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Alt (m)</Label>
                <Input
                  type="number"
                  value={selectedWp.altitude}
                  onChange={(e) => updateWaypoint(selectedWp.id, { altitude: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Speed (m/s)</Label>
                <Input
                  type="number"
                  value={selectedWp.speed}
                  onChange={(e) => updateWaypoint(selectedWp.id, { speed: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Action</Label>
                <Select
                  value={selectedWp.action}
                  onValueChange={(v) => updateWaypoint(selectedWp.id, { action: v as Waypoint['action'] })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedWp.action === 'loiter' && (
              <div className="mt-2">
                <Label className="text-[10px] text-muted-foreground">Loiter Time (s)</Label>
                <Input
                  type="number"
                  value={selectedWp.loiterTime}
                  onChange={(e) => updateWaypoint(selectedWp.id, { loiterTime: parseInt(e.target.value) || 0 })}
                  className="h-7 text-xs w-24"
                />
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  )
}