'use client'

import { useState } from 'react'
import { useDroneStore, type Waypoint } from '@/lib/drone-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  MapPin,
  Trash2,
  Download,
  Upload,
  Save,
  Plus,
  GripVertical,
  Play,
  Square,
  ListOrdered,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const ACTION_COLORS: Record<string, string> = {
  fly_to: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  loiter: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  land: 'bg-red-500/20 text-red-400 border-red-500/30',
  takeoff: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

const ACTION_LABELS: Record<string, string> = {
  fly_to: 'Fly',
  loiter: 'Loiter',
  land: 'Land',
  takeoff: 'Takeoff',
}

function SortableWaypointRow({
  wp,
  idx,
  isSelected,
  onSelect,
  onRemove,
}: {
  wp: Waypoint
  idx: number
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: wp.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-xs group
        ${isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted border border-transparent'
        }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {idx + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">
            {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
          </span>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ACTION_COLORS[wp.action]}`}>
            {ACTION_LABELS[wp.action]}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Alt: {wp.altitude}m | Spd: {wp.speed}m/s
          {wp.action === 'loiter' && ` | Hold: ${wp.loiterTime}s`}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}

export default function MissionPanel() {
  const {
    waypoints,
    selectWaypoint,
    selectedWaypointId,
    removeWaypoint,
    clearWaypoints,
    reorderWaypoints,
    missionStatus,
    setMissionStatus,
    addLog,
  } = useDroneStore()

  const [missionName, setMissionName] = useState('Shaher-136 Mission 1')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const sortedWaypoints = [...waypoints].sort((a, b) => a.order - b.order)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedWaypoints.findIndex((w) => w.id === active.id)
    const newIndex = sortedWaypoints.findIndex((w) => w.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(sortedWaypoints, oldIndex, newIndex).map((w, i) => ({ ...w, order: i }))
    reorderWaypoints(reordered)
    addLog({ level: 'info', message: 'Waypoints reordered', source: 'gcs' })
  }

  const totalDistance = waypoints.reduce((acc, wp, i) => {
    if (i === 0) return 0
    const prev = waypoints[i - 1]
    const R = 6371000
    const dLat = ((wp.latitude - prev.latitude) * Math.PI) / 180
    const dLon = ((wp.longitude - prev.longitude) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prev.latitude * Math.PI) / 180) *
        Math.cos((wp.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return acc + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }, 0)

  const estimatedTime = waypoints.length > 1
    ? (totalDistance / 1000) / (waypoints.reduce((a, w) => a + w.speed, 0) / waypoints.length) * 3600
    : 0

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}m ${s}s`
  }

  const handleSaveMission = async () => {
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: missionName,
          description: `${waypoints.length} waypoints, ${totalDistance.toFixed(0)}m total distance`,
          waypoints: waypoints.map((wp, i) => ({
            ...wp,
            order: i,
          })),
        }),
      })
      if (res.ok) {
        addLog({ level: 'info', message: `Mission "${missionName}" saved successfully`, source: 'gcs' })
        setSaveDialogOpen(false)
      }
    } catch {
      addLog({ level: 'error', message: 'Failed to save mission', source: 'gcs' })
    }
  }

  const handleUploadMission = () => {
    // Send via WebSocket
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__droneSocket) {
      const socket = (window as unknown as Record<string, unknown>).__droneSocket as { emit: (event: string, data: unknown) => void }
      socket.emit('mission', {
        waypoints: waypoints.map((wp, i) => ({
          lat: wp.latitude,
          lng: wp.longitude,
          alt: wp.altitude,
          speed: wp.speed,
          action: wp.action,
          loiterTime: wp.loiterTime,
          order: i,
        })),
      })
      setMissionStatus('uploading')
      addLog({ level: 'info', message: `Uploading mission with ${waypoints.length} waypoints to drone...`, source: 'gcs' })
      setTimeout(() => setMissionStatus('idle'), 3000)
    } else {
      addLog({ level: 'warn', message: 'Not connected to drone. Connect first.', source: 'gcs' })
    }
  }

  const handleExportJSON = () => {
    const data = {
      name: missionName,
      created: new Date().toISOString(),
      waypoints: waypoints.map((wp, i) => ({ ...wp, order: i })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${missionName.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
    addLog({ level: 'info', message: `Mission exported as JSON`, source: 'gcs' })
  }

  const handleImportJSON = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.waypoints && Array.isArray(data.waypoints)) {
          const wps: Waypoint[] = data.waypoints.map((wp: Record<string, unknown>, i: number) => ({
            id: Math.random().toString(36).substr(2, 9),
            order: i,
            latitude: wp.latitude as number,
            longitude: wp.longitude as number,
            altitude: (wp.altitude as number) ?? 50,
            speed: (wp.speed as number) ?? 10,
            action: (wp.action as Waypoint['action']) ?? 'fly_to',
            loiterTime: (wp.loiterTime as number) ?? 0,
          }))
          useDroneStore.getState().setWaypoints(wps)
          addLog({ level: 'info', message: `Imported ${wps.length} waypoints from file`, source: 'gcs' })
        }
      } catch {
        addLog({ level: 'error', message: 'Failed to import mission file', source: 'gcs' })
      }
    }
    input.click()
  }

  return (
    <Card className="border-border/50 h-full flex flex-col">
      <CardHeader className="p-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ListOrdered className="h-3.5 w-3.5" />
            Mission Planner
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5" onClick={handleImportJSON}>
              <Download className="h-3 w-3" /> Import
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5" onClick={handleExportJSON}>
              <Upload className="h-3 w-3" /> Export
            </Button>
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5">
                  <Save className="h-3 w-3" /> Save
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Save Mission</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Mission Name</label>
                    <Input
                      value={missionName}
                      onChange={(e) => setMissionName(e.target.value)}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveMission} className="flex-1" size="sm">
                      <Save className="h-4 w-4 mr-2" /> Save to Database
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>{waypoints.length} WPs</span>
          <span>{totalDistance > 1000 ? `${(totalDistance / 1000).toFixed(2)} km` : `${totalDistance.toFixed(0)} m`}</span>
          <span>~{formatTime(estimatedTime)}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <ScrollArea className="h-full max-h-[280px]">
          <div className="p-2 space-y-1">
            {waypoints.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <MapPin className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">No waypoints</p>
                <p className="text-[10px] mt-0.5">Use the map to add waypoints</p>
              </div>
            ) : (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortedWaypoints.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                    {sortedWaypoints.map((wp, idx) => (
                      <SortableWaypointRow
                        key={wp.id}
                        wp={wp}
                        idx={idx}
                        isSelected={wp.id === selectedWaypointId}
                        onSelect={() => selectWaypoint(wp.id === selectedWaypointId ? null : wp.id)}
                        onRemove={() => removeWaypoint(wp.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="flex gap-1 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[10px] text-destructive hover:text-destructive"
                    onClick={clearWaypoints}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Clear All
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-7 text-[10px] gap-1"
                    onClick={handleUploadMission}
                    disabled={waypoints.length === 0}
                  >
                    <Upload className="h-3 w-3" /> Upload to Drone
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}