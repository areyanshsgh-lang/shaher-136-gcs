'use client'

import { useDroneStore } from '@/lib/drone-store'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import AttitudeIndicator from './AttitudeIndicator'
import SectionCard from './SectionCard'
import {
  Plane,
  BatteryMedium,
  Activity,
  Signal,
  Zap,
  Satellite,
  Mountain,
  Gauge,
  Compass,
  Cpu,
  MapPin,
} from 'lucide-react'

// ── Attitude ────────────────────────────────────────────────────────────────
export function AttitudeCard() {
  const telemetry = useDroneStore((s) => s.telemetry)
  return (
    <SectionCard
      title="Attitude"
      icon={Plane}
      accent="violet"
      bodyClassName="flex flex-col items-center gap-2 p-2.5"
      action={
        <div className="flex gap-1">
          {[
            ['R', telemetry.roll],
            ['P', telemetry.pitch],
            ['Y', telemetry.yaw],
          ].map(([k, v]) => (
            <span key={k as string} className="text-[9px] font-mono bg-muted/60 px-1 py-0.5 rounded text-muted-foreground tabular-nums">
              {k} {(v as number | null)?.toFixed(0) ?? '0'}°
            </span>
          ))}
        </div>
      }
    >
      <AttitudeIndicator size={158} />
    </SectionCard>
  )
}

// ── Power & Link ──────────────────────────────────────────────────────────────
export function PowerLinkCard() {
  const { droneStatus, connectionStatus } = useDroneStore()
  const pct = droneStatus.batteryLevel ?? 0
  const color = pct > 60 ? 'text-emerald-400' : pct > 25 ? 'text-amber-400' : 'text-red-400'
  const linked = connectionStatus === 'connected'
  return (
    <SectionCard
      title="Power &amp; Link"
      icon={BatteryMedium}
      accent="emerald"
      action={
        <Badge
          variant="outline"
          className={cn('text-[9px] h-4 px-1.5', droneStatus.armed ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'text-muted-foreground')}
        >
          {droneStatus.armed ? 'ARMED' : 'DISARMED'}
        </Badge>
      }
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground">Battery</span>
        <span className={cn('font-mono text-lg font-bold tabular-nums leading-none', color)}>
          {pct.toFixed(0)}
          <span className="text-[10px] text-muted-foreground ml-0.5">%</span>
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Signal className="h-3 w-3" /> Signal
        </span>
        <span className={cn('font-mono font-medium', linked ? 'text-emerald-400' : 'text-muted-foreground')}>
          {linked ? 'Strong' : connectionStatus === 'connecting' ? 'Linking' : 'None'}
        </span>
      </div>
    </SectionCard>
  )
}

// ── Detailed telemetry readout (right column) ─────────────────────────────────
function ReadoutRow({
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string | number | null | undefined
  unit?: string
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
        {label}
      </span>
      <span className={cn('font-mono text-xs font-semibold tabular-nums', tone)}>
        {value ?? '—'}
        {unit && <span className="text-[10px] text-muted-foreground ml-0.5 font-normal">{unit}</span>}
      </span>
    </div>
  )
}

export function TelemetryReadoutCard() {
  const { telemetry, droneStatus } = useDroneStore()
  const gpsTone = telemetry.gpsFix ? 'text-emerald-400' : 'text-red-400'
  return (
    <SectionCard title="Telemetry" icon={Activity} accent="sky" bodyClassName="px-2.5 py-1">
      <ReadoutRow icon={Zap} label="Voltage" value={telemetry.battery?.toFixed(1)} unit="V" />
      <ReadoutRow icon={BatteryMedium} label="Battery" value={(droneStatus.batteryLevel ?? 0).toFixed(0)} unit="%" />
      <ReadoutRow icon={Satellite} label="GPS" value={telemetry.gpsFix ? `${telemetry.satellites} sats` : 'No Fix'} tone={gpsTone} />
      <ReadoutRow icon={MapPin} label="Position" value={telemetry.lat != null ? `${telemetry.lat.toFixed(4)}, ${telemetry.lng?.toFixed(4)}` : null} />
      <ReadoutRow icon={Mountain} label="Altitude" value={telemetry.alt?.toFixed(1)} unit="m" />
      <ReadoutRow icon={Gauge} label="Speed" value={telemetry.speed?.toFixed(1)} unit="m/s" />
      <ReadoutRow icon={Compass} label="Heading" value={telemetry.heading?.toFixed(0)} unit="°" />
      <ReadoutRow icon={Cpu} label="Flight Mode" value={droneStatus.mode} tone="text-amber-400" />
    </SectionCard>
  )
}

// Full panel (used on mobile / in the controls sheet)
export default function TelemetryPanel() {
  return (
    <div className="space-y-2.5">
      <AttitudeCard />
      <PowerLinkCard />
      <TelemetryReadoutCard />
    </div>
  )
}
