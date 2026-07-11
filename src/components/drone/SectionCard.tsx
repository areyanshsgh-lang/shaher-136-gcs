'use client'

import type { ReactNode, ElementType } from 'react'
import { cn } from '@/lib/utils'

type Accent = 'amber' | 'emerald' | 'sky' | 'violet' | 'red'

const ACCENTS: Record<Accent, { chip: string; grad: string; bar: string }> = {
  amber: { chip: 'bg-amber-500/15 text-amber-400', grad: 'from-amber-500/10', bar: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-400', grad: 'from-emerald-500/10', bar: 'bg-emerald-500' },
  sky: { chip: 'bg-sky-500/15 text-sky-400', grad: 'from-sky-500/10', bar: 'bg-sky-500' },
  violet: { chip: 'bg-violet-500/15 text-violet-400', grad: 'from-violet-500/10', bar: 'bg-violet-500' },
  red: { chip: 'bg-red-500/15 text-red-400', grad: 'from-red-500/10', bar: 'bg-red-500' },
}

/**
 * A titled panel with a colored accent bar + icon chip. Gives each sidebar
 * section its own visual identity instead of a uniform card wall.
 */
export default function SectionCard({
  title,
  icon: Icon,
  accent = 'amber',
  action,
  children,
  bodyClassName,
}: {
  title: string
  icon: ElementType
  accent?: Accent
  action?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  const a = ACCENTS[accent]
  return (
    <div className="relative rounded-lg border border-border/50 bg-card/40 overflow-hidden shadow-sm">
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] opacity-70', a.bar)} />
      <div className={cn('flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/40 bg-gradient-to-r to-transparent', a.grad)}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('grid place-items-center h-5 w-5 rounded shrink-0', a.chip)}>
            <Icon className="h-3 w-3" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/80 truncate">
            {title}
          </span>
        </div>
        {action}
      </div>
      <div className={cn('p-2.5', bodyClassName)}>{children}</div>
    </div>
  )
}
