'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTheme } from 'next-themes'
import { useDroneStore, type Waypoint } from '@/lib/drone-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'

// Real dark/light basemaps (CARTO — free, no API key) instead of a CSS filter hack.
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
const LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

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
  const { resolvedTheme } = useTheme()
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false)
  const [mapReady, setMapReady] = useState(false)
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
      tileLayerRef.current = L.tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
        attribution: TILE_ATTRIB,
        maxZoom: 20,
      }).addTo(map)

      markersLayerRef.current = L.layerGroup().addTo(map)
      pathLineRef.current = L.polyline([], {
        color: '#f59e0b',
        weight: 2,
        opacity: 0.7,
        dashArray: '8, 8',
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)

      // Handle map click for adding waypoints (uses refs to avoid stale closure)
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!addingRef.current) return
        const newWaypoint: Waypoint = {
          id: Math.random().toString(36).substr(2, 9),
          order: waypointsCountRef.current,
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          altitude: 50,
          speed: 10,
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
            const nw: Waypoint = {
              id: Math.random().toString(36).substr(2, 9),
              order: waypointsCountRef.current,
              latitude: e.latlng.lat,
              longitude: e.latlng.lng,
              altitude: 50,
              speed: 10,
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

  // Swap basemap when the theme changes
  useEffect(() => {
    if (!mapReady || !tileLayerRef.current) return
    tileLayerRef.current.setUrl(resolvedTheme === 'dark' ? DARK_TILE_URL : LIGHT_TILE_URL)
  }, [resolvedTheme, mapReady])

  // Fly to waypoint when selected
  const flyToWaypoint = useCallback((wp: Waypoint) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([wp.latitude, wp.longitude], 17, { duration: 0.5 })
    }
  }, [])

  const selectedWp = waypoints.find((w) => w.id === selectedWaypointId)

  return (
    <Card className="border-border/50 h-full flex flex-col">
      <CardHeader className="p-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Navigation className="h-3.5 w-3.5" />
            Mission Map
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {waypoints.length} waypoints
            </Badge>
            <Button
              variant={isAddingWaypoint ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setIsAddingWaypoint(!isAddingWaypoint)}
            >
              {isAddingWaypoint ? (
                <>Click map to place</>
              ) : (
                <><Plus className="h-3 w-3" /> Add WP</>
              )}
            </Button>
            {telemetry.lat != null && telemetry.lng != null && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  mapInstanceRef.current?.flyTo([telemetry.lat!, telemetry.lng!], 17, { duration: 0.5 })
                }}
              >
                <Crosshair className="h-3 w-3" /> Drone
              </Button>
            )}
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