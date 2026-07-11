import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod/v4'

// ── Schemas ──────────────────────────────────────────────────────────────────

const waypointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number().default(50.0),
  speed: z.number().default(10.0),
  action: z.enum(['fly_to', 'loiter', 'land', 'takeoff']).default('fly_to'),
  loiterTime: z.number().int().default(0),
})

const createMissionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'completed', 'aborted']).default('draft'),
  waypoints: z.array(waypointSchema).optional(),
})

// ── GET /api/missions ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const missions = await db.mission.findMany({
      include: {
        waypoints: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(missions)
  } catch (error) {
    console.error('Failed to fetch missions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch missions' },
      { status: 500 },
    )
  }
}

// ── POST /api/missions ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createMissionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { name, description, status, waypoints } = parsed.data

    const mission = await db.mission.create({
      data: {
        name,
        description,
        status,
        waypoints: waypoints
          ? {
              create: waypoints.map((wp, index) => ({
                order: index,
                latitude: wp.latitude,
                longitude: wp.longitude,
                altitude: wp.altitude,
                speed: wp.speed,
                action: wp.action,
                loiterTime: wp.loiterTime,
              })),
            }
          : undefined,
      },
      include: {
        waypoints: {
          orderBy: { order: 'asc' },
        },
      },
    })

    return NextResponse.json(mission, { status: 201 })
  } catch (error) {
    console.error('Failed to create mission:', error)
    return NextResponse.json(
      { error: 'Failed to create mission' },
      { status: 500 },
    )
  }
}