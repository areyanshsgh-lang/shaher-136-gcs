import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod/v4'

// ── Schemas ──────────────────────────────────────────────────────────────────

const createFlightLogSchema = z.object({
  missionId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  roll: z.number().optional(),
  pitch: z.number().optional(),
  yaw: z.number().optional(),
  battery: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
})

// ── GET /api/flight-logs ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const missionId = searchParams.get('missionId')

    const flightLogs = await db.flightLog.findMany({
      where: missionId ? { missionId } : undefined,
      orderBy: { timestamp: 'desc' },
      take: 500, // reasonable limit for telemetry data
    })

    return NextResponse.json(flightLogs)
  } catch (error) {
    console.error('Failed to fetch flight logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch flight logs' },
      { status: 500 },
    )
  }
}

// ── POST /api/flight-logs ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createFlightLogSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const flightLog = await db.flightLog.create({
      data: {
        ...parsed.data,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(flightLog, { status: 201 })
  } catch (error) {
    console.error('Failed to create flight log:', error)
    return NextResponse.json(
      { error: 'Failed to create flight log' },
      { status: 500 },
    )
  }
}