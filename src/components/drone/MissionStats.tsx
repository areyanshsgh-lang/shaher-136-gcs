'use client'

import { useDroneStore } from '@/lib/drone-store'
import SectionCard from './SectionCard'
import { BarChart3, Route, Clock, ArrowUp, Gauge } from 'lucide-react'

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function StatRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
        {label}
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export default function MissionStats() {
  const waypoints = useDroneStore((s) => s.waypoints)
  const sorted = [...waypoints].sort((a, b) => a.order - b.order)

  let distance = 0
  for (let i = 1; i < sorted.length; i++) {
    distance += haversine(sorted[i - 1].latitude, sorted[i - 1].longitude, sorted[i].latitude, sorted[i].longitude)
  }
  const avgSpeed = sorted.length ? sorted.reduce((a, w) => a + w.speed, 0) / sorted.length : 0
  const etaSec = avgSpeed > 0 ? distance / avgSpeed : 0
  const maxAlt = sorted.reduce((m, w) => Math.max(m, w.altitude), 0)
  const maxSpeed = sorted.reduce((m, w) => Math.max(m, w.speed), 0)

  const distStr = distance > 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance.toFixed(0)} m`
  const etaStr = `${Math.floor(etaSec / 60)}:${String(Math.floor(etaSec % 60)).padStart(2, '0')} min`

  // simple altitude profile sparkline
  const pts = sorted.length > 1 ? sorted : []
  const w = 240
  const h = 44
  const maxA = Math.max(maxAlt, 1)
  const path = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w
      const y = h - (p.altitude / maxA) * (h - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <SectionCard title="Mission Stats" icon={BarChart3} accent="emerald" bodyClassName="px-2.5 py-1">
      <StatRow icon={Route} label="Total Distance" value={distStr} />
      <StatRow icon={Clock} label="Est. Flight Time" value={etaStr} />
      <StatRow icon={ArrowUp} label="Max Altitude" value={`${maxAlt.toFixed(0)} m`} />
      <StatRow icon={Gauge} label="Max Speed" value={`${maxSpeed.toFixed(0)} m/s`} />
      <div className="pt-2">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11" preserveAspectRatio="none">
          <defs>
            <linearGradient id="altfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.68 0.16 145)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="oklch(0.68 0.16 145)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {path && (
            <>
              <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#altfill)" />
              <path d={path} fill="none" stroke="oklch(0.68 0.16 145)" strokeWidth="1.5" />
            </>
          )}
          {!path && (
            <text x={w / 2} y={h / 2 + 3} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              no mission
            </text>
          )}
        </svg>
      </div>
    </SectionCard>
  )
}
