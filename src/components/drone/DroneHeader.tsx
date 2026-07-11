'use client'

import { useSyncExternalStore } from 'react'
import { useDroneStore } from '@/lib/drone-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Plane,
  Battery,
  BatteryWarning,
  BatteryFull,
  Satellite,
  Cpu,
  Moon,
  Sun,
  Mountain,
  Gauge,
  Compass,
  Radio,
  Shield,
} from 'lucide-react'
import { useTheme } from 'next-themes'

type Tone = 'default' | 'good' | 'warn' | 'bad'

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
}
const TONE_ICON: Record<Tone, string> = {
  default: 'text-muted-foreground/60',
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
}

function Instrument({
  icon: Icon,
  label,
  value,
  unit,
  tone = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string | number | null | undefined
  unit?: string
  tone?: Tone
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-card/50 px-3 py-1.5 w-full">
      <Icon className={cn('h-4 w-4 shrink-0', TONE_ICON[tone])} />
      <div className="leading-tight">
        <div className="text-[8px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
          {label}
        </div>
        <div className={cn('font-mono text-sm font-semibold tabular-nums leading-none', TONE_TEXT[tone])}>
          {value ?? '—'}
          {unit && <span className="text-[9px] text-muted-foreground ml-0.5 font-normal">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export default function DroneHeader() {
  const { connectionStatus, droneStatus, telemetry, simulationMode, simulationRunning } = useDroneStore()
  const { setTheme, resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  const batt = droneStatus.batteryLevel ?? 0
  const battTone: Tone = batt > 60 ? 'good' : batt > 25 ? 'warn' : 'bad'
  const BatteryIcon = batt > 60 ? BatteryFull : batt > 25 ? Battery : BatteryWarning

  const connColor =
    connectionStatus === 'connected'
      ? 'bg-emerald-500'
      : connectionStatus === 'connecting'
      ? 'bg-amber-500 animate-pulse'
      : 'bg-muted-foreground/50'

  return (
    <header className="border-b border-border/40 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-md sticky top-0 z-50 shrink-0 accent-underline">
      {/* Row 1 — brand + system status */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="bg-gradient-to-br from-amber-400/25 to-amber-600/5 p-1.5 rounded-md ring-1 ring-amber-500/30 shadow-[0_0_14px_-3px] shadow-amber-500/50">
              <Plane className="h-4 w-4 text-amber-400" />
            </div>
            <div className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${connColor} ring-2 ring-background`} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-tight">
              Shaher-136 <span className="text-amber-500/80 font-mono text-[11px] font-medium">GCS</span>
            </h1>
            <p className="text-[9px] text-muted-foreground leading-tight tracking-[0.15em] uppercase">
              Ground Control Station
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {simulationMode && (
            <Badge variant="secondary" className="text-[9px] h-5 px-1.5 gap-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
              <Cpu className="h-2.5 w-2.5" /> SIM
            </Badge>
          )}
          {simulationRunning && (
            <Badge variant="default" className="text-[9px] h-5 px-1.5 gap-1">
              <Radio className="h-2.5 w-2.5" /> ACTIVE
            </Badge>
          )}
          {connectionStatus === 'connected' && !simulationMode && (
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 text-emerald-400 border-emerald-500/30">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LINK
            </Badge>
          )}
          {droneStatus.armed && (
            <Badge variant="destructive" className="text-[9px] h-5 px-1.5 gap-1">
              <Shield className="h-2.5 w-2.5" /> ARMED
            </Badge>
          )}
          <span
            className={cn(
              'text-[11px] font-mono font-semibold px-2 py-0.5 rounded border',
              droneStatus.armed
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                : 'bg-muted/50 text-muted-foreground border-border/40',
            )}
          >
            {droneStatus.mode}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {mounted ? (
              resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
            ) : (
              <div className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Row 2 — instrument cluster, spread across the full width */}
      <div className="border-t border-border/30 px-3 py-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Instrument
          icon={Satellite}
          label="GPS"
          value={telemetry.gpsFix ? `${telemetry.satellites}` : 'NO FIX'}
          unit={telemetry.gpsFix ? 'sats' : undefined}
          tone={telemetry.gpsFix ? 'good' : 'bad'}
        />
        <Instrument icon={BatteryIcon} label="Battery" value={batt.toFixed(0)} unit="%" tone={battTone} />
        <Instrument icon={Mountain} label="Altitude" value={telemetry.alt?.toFixed(1)} unit="m" />
        <Instrument icon={Gauge} label="Speed" value={telemetry.speed?.toFixed(1)} unit="m/s" />
        <Instrument icon={Compass} label="Heading" value={telemetry.heading?.toFixed(0)} unit="°" />
      </div>
    </header>
  )
}
