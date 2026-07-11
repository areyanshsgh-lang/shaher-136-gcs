'use client'

import { useDroneStore } from '@/lib/drone-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Terminal, Trash2 } from 'lucide-react'

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-muted-foreground',
}

const LEVEL_BADGES: Record<string, string> = {
  info: 'bg-emerald-500/20 text-emerald-400',
  warn: 'bg-amber-500/20 text-amber-400',
  error: 'bg-red-500/20 text-red-400',
  debug: 'bg-muted text-muted-foreground',
}

export default function LogConsole() {
  const { logs, clearLogs } = useDroneStore()

  return (
    <Card className="border-border/50 h-full flex flex-col">
      <CardHeader className="p-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5" />
            Log Console
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{logs.length} entries</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-destructive hover:text-destructive"
              onClick={clearLogs}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <ScrollArea className="h-full max-h-[200px]">
          <div className="p-2 font-mono text-[11px] space-y-0.5">
            {logs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No log entries yet
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-1.5 py-0.5 hover:bg-muted/50 rounded px-1">
                  <span className="text-muted-foreground text-[9px] shrink-0 mt-px">
                    {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span className={`text-[9px] px-1 rounded shrink-0 mt-px ${LEVEL_BADGES[log.level]}`}>
                    {log.level.toUpperCase().slice(0, 4)}
                  </span>
                  <span className={`text-[9px] px-1 rounded shrink-0 mt-px bg-muted text-muted-foreground`}>
                    {log.source.toUpperCase().slice(0, 4)}
                  </span>
                  <span className={LEVEL_COLORS[log.level]}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}