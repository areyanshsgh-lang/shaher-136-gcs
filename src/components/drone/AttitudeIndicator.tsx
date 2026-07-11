'use client'

import { useEffect, useRef } from 'react'
import { useDroneStore } from '@/lib/drone-store'

export default function AttitudeIndicator({ size = 160 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { telemetry } = useDroneStore()
  const roll = telemetry.roll ?? 0
  const pitch = telemetry.pitch ?? 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 4

    ctx.clearRect(0, 0, size, size)

    // Clip to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()

    // Rotate for roll
    ctx.translate(cx, cy)
    ctx.rotate((-roll * Math.PI) / 180)

    // Sky
    const pitchOffset = (pitch / 90) * r * 2
    ctx.fillStyle = '#1a5276'
    ctx.fillRect(-r * 2, -r * 2 + pitchOffset, r * 4, r * 2 - pitchOffset)

    // Ground
    ctx.fillStyle = '#6b3a1f'
    ctx.fillRect(-r * 2, pitchOffset, r * 4, r * 2 + pitchOffset)

    // Horizon line
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-r * 2, pitchOffset)
    ctx.lineTo(r * 2, pitchOffset)
    ctx.stroke()

    // Pitch lines
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.textAlign = 'center'
    for (let deg = -60; deg <= 60; deg += 10) {
      if (deg === 0) continue
      const y = pitchOffset - (deg / 90) * r * 2
      const w = Math.abs(deg) % 20 === 0 ? 30 : 15
      ctx.beginPath()
      ctx.moveTo(-w, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      if (Math.abs(deg) % 20 === 0) {
        ctx.fillText(`${Math.abs(deg)}`, -w - 12, y + 3)
        ctx.fillText(`${Math.abs(deg)}`, w + 12, y + 3)
      }
    }

    ctx.restore()

    // Fixed aircraft symbol (center)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - 40, cy)
    ctx.lineTo(cx - 15, cy)
    ctx.lineTo(cx - 10, cy + 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + 40, cy)
    ctx.lineTo(cx + 15, cy)
    ctx.lineTo(cx + 10, cy + 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#f59e0b'
    ctx.fill()

    // Outer ring
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    // Roll scale marks
    ctx.save()
    ctx.translate(cx, cy)
    for (let deg = -60; deg <= 60; deg += 10) {
      const rad = ((deg - 90) * Math.PI) / 180
      const len = Math.abs(deg) % 30 === 0 ? 12 : 6
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = Math.abs(deg) % 30 === 0 ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(Math.cos(rad) * (r - len), Math.sin(rad) * (r - len))
      ctx.lineTo(Math.cos(rad) * r, Math.sin(rad) * r)
      ctx.stroke()
    }
    // Roll pointer (top)
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.moveTo(0, -r + 1)
    ctx.lineTo(-6, -r + 10)
    ctx.lineTo(6, -r + 10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

  }, [roll, pitch, size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="rounded-full"
    />
  )
}