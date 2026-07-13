'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { useDroneStore } from '@/lib/drone-store'
import { DroneLink } from '@/lib/drone-link'
import SectionCard from './SectionCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Settings2,
  Radio,
  MapPin,
  Activity,
  Palette,
  Database,
  Info,
  Sun,
  Moon,
  Trash2,
} from 'lucide-react'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70 leading-snug">{hint}</p>}
    </div>
  )
}

export default function SettingsPanel() {
  const { settings, updateSettings, clearWaypoints, clearLogs } = useDroneStore()
  const { setTheme, resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  return (
    <div className="h-full flex flex-col rounded-xl border border-border/50 bg-card/30 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40 shrink-0">
        <span className="grid place-items-center h-8 w-8 rounded-lg bg-amber-500/15 text-amber-400">
          <Settings2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold tracking-tight leading-none">Settings</h2>
          <p className="text-[10px] text-muted-foreground mt-1">Advanced configuration for your ground station</p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3 max-w-2xl">
          {/* Connection */}
          <SectionCard title="Connection" icon={Radio} accent="emerald">
            <Field label="Relay URL" hint={`Leave blank to auto-detect (${DroneLink.defaultUrl()}). Set this if your drone relay runs elsewhere.`}>
              <Input
                value={settings.relayUrl}
                onChange={(e) => updateSettings({ relayUrl: e.target.value })}
                placeholder={DroneLink.defaultUrl()}
                className="h-8 text-xs font-mono"
              />
            </Field>
          </SectionCard>

          {/* Waypoint defaults */}
          <SectionCard title="Waypoint Defaults" icon={MapPin} accent="amber" bodyClassName="p-2.5 grid grid-cols-2 gap-3">
            <Field label="Altitude (m)">
              <Input
                type="number"
                value={settings.defaultAltitude}
                onChange={(e) => updateSettings({ defaultAltitude: Number(e.target.value) || 0 })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Speed (m/s)">
              <Input
                type="number"
                value={settings.defaultSpeed}
                onChange={(e) => updateSettings({ defaultSpeed: Number(e.target.value) || 0 })}
                className="h-8 text-xs"
              />
            </Field>
          </SectionCard>

          {/* Telemetry */}
          <SectionCard title="Telemetry" icon={Activity} accent="sky">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs">Record flight logs</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Save telemetry snapshots to the database while flying or simulating.</p>
              </div>
              <Switch
                checked={settings.recordFlightLogs}
                onCheckedChange={(v) => updateSettings({ recordFlightLogs: v })}
              />
            </div>
          </SectionCard>

          {/* Appearance */}
          <SectionCard title="Appearance" icon={Palette} accent="violet">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs">Theme</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Dark is recommended for a ground station.</p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant={mounted && resolvedTheme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </Button>
                <Button
                  variant={mounted && resolvedTheme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setTheme('light')}
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Data */}
          <SectionCard title="Data" icon={Database} accent="red">
            <p className="text-[10px] text-muted-foreground mb-2">Clear locally-held data. This cannot be undone.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => clearWaypoints()}>
                <Trash2 className="h-3.5 w-3.5" /> Clear waypoints
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => clearLogs()}>
                <Trash2 className="h-3.5 w-3.5" /> Clear logs
              </Button>
            </div>
          </SectionCard>

          {/* About */}
          <SectionCard title="About" icon={Info} accent="emerald">
            <div className="text-[11px] text-muted-foreground space-y-1.5">
              <div className="flex justify-between"><span>Application</span><span className="font-mono text-foreground">Shaher-136 GCS</span></div>
              <div className="flex justify-between"><span>Version</span><span className="font-mono text-foreground">1.0.0</span></div>
              <div className="flex justify-between"><span>Protocol</span><span className="font-mono text-foreground">MAVLink + WebSocket</span></div>
              <div className="flex justify-between"><span>Hardware</span><span className="font-mono text-foreground">ESP32 · MPU-6050 · NEO-6M</span></div>
            </div>
          </SectionCard>
        </div>
      </ScrollArea>
    </div>
  )
}
