'use client'

import { useDroneStore } from '@/lib/drone-store'
import SectionCard from './SectionCard'
import { cn } from '@/lib/utils'
import { Camera, CameraOff } from 'lucide-react'

export default function CameraPanel({ compact = false, full = false }: { compact?: boolean; full?: boolean }) {
  const { cameraActive, setCameraActive, connectionStatus } = useDroneStore()
  const live = cameraActive && connectionStatus === 'connected'

  const liveBadge = (
    <span className={cn('flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider', live ? 'text-emerald-400' : 'text-muted-foreground')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-500 signal-live' : 'bg-muted-foreground/50')} />
      {live ? 'Live' : 'Offline'}
    </span>
  )

  const feed = (
    <div className={cn('relative w-full rounded-md overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 ring-1 ring-border/40', full ? 'flex-1 min-h-0' : 'aspect-video')}>
      <div className="absolute inset-0 flex items-center justify-center">
        {live ? (
          <div className="text-center">
            <Camera className={cn('mx-auto mb-1.5 text-muted-foreground animate-pulse', full ? 'h-12 w-12' : 'h-7 w-7')} />
            <p className={cn('text-muted-foreground', full ? 'text-sm' : 'text-[11px]')}>Awaiting OV2640 stream…</p>
          </div>
        ) : (
          <div className="text-center">
            <CameraOff className={cn('mx-auto mb-1.5 text-muted-foreground/50', full ? 'h-12 w-12' : 'h-7 w-7')} />
            <p className={cn('text-muted-foreground/70', full ? 'text-sm' : 'text-[11px]')}>No Signal</p>
          </div>
        )}
      </div>

      {/* HUD overlay */}
      <div className="absolute top-2 left-2 text-[9px] font-mono text-emerald-400/90 leading-tight">
        <div className={cn(live ? '' : 'opacity-40')}>● REC</div>
        <div className="text-white/40">OV2640 · 640×480</div>
      </div>
      <div className="absolute top-2 right-2 text-[9px] font-mono text-white/50">{live ? 'LIVE' : '—'}</div>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={cn('border border-white/10 rounded-full', full ? 'w-24 h-24' : 'w-14 h-14')} />
        <div className={cn('absolute w-px bg-white/10', full ? 'h-12' : 'h-7')} />
        <div className={cn('absolute h-px bg-white/10', full ? 'w-12' : 'w-7')} />
      </div>
    </div>
  )

  const showButton = !compact || connectionStatus === 'connected'
  const controls = showButton ? (
    <button
      onClick={() => connectionStatus === 'connected' && setCameraActive(!cameraActive)}
      disabled={connectionStatus !== 'connected'}
      className="w-full py-1.5 text-[11px] bg-amber-500/15 text-amber-400 rounded-md border border-amber-500/25 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {connectionStatus !== 'connected' ? 'Connect drone to enable' : cameraActive ? 'Disable Camera' : 'Enable Camera'}
    </button>
  ) : null

  // Full-page mode — fills the available height with a large feed.
  if (full) {
    return (
      <div className="h-full flex flex-col rounded-xl border border-border/50 bg-card/40 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 shrink-0">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
            <span className="grid place-items-center h-5 w-5 rounded bg-sky-500/15 text-sky-400">
              <Camera className="h-3 w-3" />
            </span>
            Camera Feed
          </span>
          {liveBadge}
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
          {feed}
          {controls}
        </div>
      </div>
    )
  }

  return (
    <SectionCard title="Camera Feed" icon={Camera} accent="sky" bodyClassName="p-2.5 space-y-2" action={liveBadge}>
      {feed}
      {controls}
    </SectionCard>
  )
}
