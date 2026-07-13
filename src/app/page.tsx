'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import DroneHeader from '@/components/drone/DroneHeader'
import MapPanel from '@/components/drone/MapPanel'
import TelemetryPanel, { AttitudeCard, PowerLinkCard, TelemetryReadoutCard } from '@/components/drone/TelemetryPanel'
import MissionPanel from '@/components/drone/MissionPanel'
import MissionStats from '@/components/drone/MissionStats'
import QuickActions from '@/components/drone/QuickActions'
import ConnectionPanel from '@/components/drone/ConnectionPanel'
import LogConsole from '@/components/drone/LogConsole'
import ESP32CodeViewer from '@/components/drone/ESP32CodeViewer'
import CameraPanel from '@/components/drone/CameraPanel'
import HelpGuide from '@/components/drone/HelpGuide'
import SettingsPanel from '@/components/drone/SettingsPanel'
import { useDroneStore } from '@/lib/drone-store'
import { useFlightLogger } from '@/hooks/use-flight-logger'
import {
  ListOrdered,
  Terminal,
  Cpu,
  Camera,
  HelpCircle,
  MapPin,
  Gauge,
  LayoutDashboard,
  Settings,
} from 'lucide-react'

type View = 'overview' | 'mission' | 'logs' | 'code' | 'camera' | 'help' | 'settings'

const RAIL: { view: View; label: string; icon: React.ElementType }[] = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'mission', label: 'Mission', icon: ListOrdered },
  { view: 'logs', label: 'Logs', icon: Terminal },
  { view: 'camera', label: 'Camera', icon: Camera },
  { view: 'code', label: 'ESP32', icon: Cpu },
  { view: 'help', label: 'Help', icon: HelpCircle },
]

const mobileTabs = [
  { value: 'map', label: 'Map', icon: MapPin },
  { value: 'mission', label: 'Mission', icon: ListOrdered },
  { value: 'logs', label: 'Logs', icon: Terminal },
  { value: 'code', label: 'ESP32', icon: Cpu },
  { value: 'help', label: 'Help', icon: HelpCircle },
] as const

const PANEL = 'flex-1 min-h-0 rounded-xl border border-border/50 bg-card/30 overflow-hidden'

export default function HomePage() {
  const [mobileTab, setMobileTab] = useState('map')
  const [view, setView] = useState<View>('overview')
  const { waypoints, connectionStatus, simulationMode, addLog } = useDroneStore()

  useFlightLogger()

  useEffect(() => {
    useDroneStore.getState().loadSettings()
    addLog({ level: 'info', message: 'Shaher-136 GCS initialized', source: 'system' })
    addLog({ level: 'info', message: 'Hardware: ESP32 + MPU-6050 + NEO-6M GPS + OV2640', source: 'system' })
    addLog({ level: 'info', message: 'No drone connected. Click "Connect" or enable Simulation Mode.', source: 'system' })
  }, [addLog])

  return (
    <div className="h-screen flex flex-col app-shell overflow-hidden">
      <DroneHeader />

      {/* ====== DESKTOP LAYOUT ====== */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Icon rail — the only navigation */}
        <nav className="w-14 shrink-0 border-r border-border/40 bg-card/30 flex flex-col items-center py-3 gap-1">
          {RAIL.map((item) => {
            const active = view === item.view
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                title={item.label}
                className={cn(
                  'relative grid place-items-center h-9 w-9 rounded-lg transition-colors',
                  active ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50',
                )}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-amber-500" />}
                <item.icon className="h-[18px] w-[18px]" />
              </button>
            )
          })}
          <button
            onClick={() => setView('settings')}
            title="Settings"
            className={cn(
              'relative mt-auto grid place-items-center h-9 w-9 rounded-lg transition-colors',
              view === 'settings'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50',
            )}
          >
            {view === 'settings' && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-amber-500" />}
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </nav>

        {/* Left column — controls (persistent) */}
        <aside className="w-[290px] shrink-0 border-r border-border/40 bg-card/20 flex flex-col min-h-0">
          <ScrollArea type="always" className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <ConnectionPanel />
              <AttitudeCard />
              <PowerLinkCard />
            </div>
          </ScrollArea>
        </aside>

        {/* Center — big map on Overview, full page otherwise */}
        <main className="flex-1 min-w-0 flex flex-col p-3 min-h-0">
          {view === 'overview' && (
            <div className="flex-1 min-h-0">
              <MapPanel />
            </div>
          )}

          {view === 'mission' && (
            <div className={PANEL}>
              <ScrollArea className="h-full">
                <div className="p-3 grid grid-cols-1 2xl:grid-cols-[1.5fr_1fr] gap-3 items-start">
                  <MissionPanel />
                  <MissionStats />
                </div>
              </ScrollArea>
            </div>
          )}

          {view === 'logs' && (
            <div className="flex-1 min-h-0">
              <LogConsole />
            </div>
          )}

          {view === 'code' && (
            <div className={PANEL}>
              <ScrollArea className="h-full">
                <div className="p-3">
                  <ESP32CodeViewer />
                </div>
              </ScrollArea>
            </div>
          )}

          {view === 'camera' && (
            <div className="flex-1 min-h-0">
              <CameraPanel full />
            </div>
          )}

          {view === 'help' && (
            <div className="flex-1 min-h-0">
              <HelpGuide />
            </div>
          )}

          {view === 'settings' && (
            <div className="flex-1 min-h-0">
              <SettingsPanel />
            </div>
          )}
        </main>

        {/* Right column — live telemetry / camera / quick actions (persistent) */}
        <aside className="hidden xl:flex w-[310px] shrink-0 border-l border-border/40 bg-card/20 flex-col min-h-0">
          <ScrollArea type="always" className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <TelemetryReadoutCard />
              <CameraPanel compact />
              <QuickActions />
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* ====== MOBILE LAYOUT ====== */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0">
        <div className="flex-1 relative min-h-0">
          <div className={`absolute inset-0 ${mobileTab === 'map' ? '' : 'hidden'}`}>
            <MapPanel />
          </div>
          <div className={`absolute inset-0 p-2 overflow-auto ${mobileTab === 'mission' ? '' : 'hidden'}`}>
            <MissionPanel />
          </div>
          <div className={`absolute inset-0 p-2 ${mobileTab === 'logs' ? '' : 'hidden'}`}>
            <LogConsole />
          </div>
          <div className={`absolute inset-0 p-2 ${mobileTab === 'code' ? '' : 'hidden'}`}>
            <ESP32CodeViewer />
          </div>
          <div className={`absolute inset-0 p-2 ${mobileTab === 'help' ? '' : 'hidden'}`}>
            <HelpGuide />
          </div>
        </div>

        <div className="border-t border-border/40 px-2 py-1 flex items-center justify-between bg-card/80 backdrop-blur-sm">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" /> Controls
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="p-3 pb-0">
                <SheetTitle className="text-sm">Telemetry &amp; Controls</SheetTitle>
              </SheetHeader>
              <ScrollArea type="always" className="h-[calc(100vh-4rem)]">
                <div className="p-3 space-y-3">
                  <ConnectionPanel />
                  <TelemetryPanel />
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>

        <nav className="flex border-t border-border/40 bg-card/80 backdrop-blur-sm">
          {mobileTabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setMobileTab(t.value)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                mobileTab === t.value ? 'text-amber-500' : 'text-muted-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" />
              <span className="text-[10px]">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-medium">Shaher-136 GCS</span>
          <Separator orientation="vertical" className="h-3" />
          <span className="hidden sm:inline">ESP32 + MPU-6050 + NEO-6M</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-emerald-500' :
              connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground'
            }`} />
            {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>{waypoints.length} WPs</span>
          {simulationMode && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">SIM</Badge>
          )}
        </div>
      </footer>
    </div>
  )
}
