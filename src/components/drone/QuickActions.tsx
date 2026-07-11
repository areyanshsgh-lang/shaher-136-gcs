'use client'

import { useDroneStore } from '@/lib/drone-store'
import SectionCard from './SectionCard'
import { cn } from '@/lib/utils'
import { Zap, Play, Pause, RotateCw, Home } from 'lucide-react'

function sendCommand(command: string, params?: Record<string, unknown>) {
  const addLog = useDroneStore.getState().addLog
  const sock = (window as unknown as Record<string, unknown>).__droneSocket as
    | { connected?: boolean; emit: (e: string, d: unknown) => void }
    | undefined
  if (sock && sock.connected !== false) {
    sock.emit('command', { command, params })
    addLog({ level: 'info', message: `Sending command: ${command}`, source: 'gcs' })
  } else {
    addLog({ level: 'warn', message: `Cannot send "${command}": not connected`, source: 'gcs' })
  }
}

const ACTIONS = [
  { label: 'Start Mission', command: 'start_mission', icon: Play, cls: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' },
  { label: 'Pause Mission', command: 'pause_mission', icon: Pause, cls: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10' },
  { label: 'Loiter', command: 'loiter', icon: RotateCw, cls: 'text-sky-400 border-sky-500/30 hover:bg-sky-500/10' },
  { label: 'Return Home', command: 'rtl', icon: Home, cls: 'text-violet-400 border-violet-500/30 hover:bg-violet-500/10' },
] as const

export default function QuickActions() {
  return (
    <SectionCard title="Quick Actions" icon={Zap} accent="amber" bodyClassName="p-2.5 grid grid-cols-2 gap-1.5">
      {ACTIONS.map((a) => (
        <button
          key={a.command}
          onClick={() => sendCommand(a.command)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border bg-card/40 px-2.5 py-2 text-[11px] font-medium transition-colors',
            a.cls,
          )}
        >
          <a.icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{a.label}</span>
        </button>
      ))}
    </SectionCard>
  )
}
