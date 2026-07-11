import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'

// ── Schemas ──────────────────────────────────────────────────────────────────

const droneCommandSchema = z
  .object({
    command: z.enum([
      'arm',
      'disarm',
      'takeoff',
      'land',
      'rtl',
      'start_mission',
      'pause_mission',
      'resume_mission',
      'goto',
      'set_mode',
      'emergency_stop',
    ]),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

// ── POST /api/drone/command ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = droneCommandSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    // Commands are sent directly via WebSocket from the frontend.
    // This endpoint validates the command shape and returns success so
    // the caller knows the command is well-formed before emitting it
    // over the socket.
    return NextResponse.json({
      success: true,
      validated: parsed.data,
      message: 'Command validated — send via WebSocket to the drone service',
    })
  } catch (error) {
    console.error('Failed to validate drone command:', error)
    return NextResponse.json(
      { error: 'Failed to validate drone command' },
      { status: 500 },
    )
  }
}