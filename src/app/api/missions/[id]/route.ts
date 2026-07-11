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

const updateMissionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'aborted']).optional(),
  waypoints: z.array(waypointSchema).optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> }

async function getMissionById(id: string) {
  return db.mission.findUnique({
    where: { id },
    include: {
      waypoints: { orderBy: { order: 'asc' } },
    },
  })
}

// ── GET /api/missions/:id ────────────────────────────────────────────────────

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const mission = await getMissionById(id)

    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
    }

    return NextResponse.json(mission)
  } catch (error) {
    console.error('Failed to fetch mission:', error)
    return NextResponse.json(
      { error: 'Failed to fetch mission' },
      { status: 500 },
    )
  }
}

// ── PUT /api/missions/:id ────────────────────────────────────────────────────

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const existing = await getMissionById(id)

    if (!existing) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateMissionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { name, description, status, waypoints } = parsed.data

    // If waypoints are provided, replace all existing waypoints
    if (waypoints !== undefined) {
      await db.waypoint.deleteMany({ where: { missionId: id } })
    }

    const mission = await db.mission.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(waypoints !== undefined && {
          waypoints: {
            create: waypoints.map((wp, index) => ({
              order: index,
              latitude: wp.latitude,
              longitude: wp.longitude,
              altitude: wp.altitude,
              speed: wp.speed,
              action: wp.action,
              loiterTime: wp.loiterTime,
            })),
          },
        }),
      },
      include: {
        waypoints: { orderBy: { order: 'asc' } },
      },
    })

    return NextResponse.json(mission)
  } catch (error) {
    console.error('Failed to update mission:', error)
    return NextResponse.json(
      { error: 'Failed to update mission' },
      { status: 500 },
    )
  }
}

// ── DELETE /api/missions/:id ─────────────────────────────────────────────────

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const existing = await getMissionById(id)

    if (!existing) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
    }

    // Cascade delete handles waypoints automatically via schema
    await db.mission.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete mission:', error)
    return NextResponse.json(
      { error: 'Failed to delete mission' },
      { status: 500 },
    )
  }
}