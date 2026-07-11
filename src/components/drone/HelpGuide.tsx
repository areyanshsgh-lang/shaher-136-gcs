'use client'

import { useState, type ElementType } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Radio,
  MapPin,
  Plane,
  Eye,
  Package,
  Settings,
  Wrench,
  Zap,
  Smartphone,
  Wifi,
  Cpu,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

// ─── "How It Works" tab content ───────────────────────────────────────────────

const howItWorksSteps = [
  {
    icon: Radio,
    title: 'Architecture — One Protocol',
    color: 'text-amber-400',
    content: `The GCS, the simulator, and the drone all speak the SAME protocol:
plain WebSocket JSON messages { type, data }, through a small relay.

  Drone / Sim  <—ws—>  Relay (:3004)  <—ws—>  Web GCS (:3000)

The relay forwards telemetry to the dashboard and commands back to the drone.
Nothing proprietary — a bench-tested ESP32 connects exactly like the simulator.`,
  },
  {
    icon: Eye,
    title: 'Simulation Mode (No Hardware)',
    color: 'text-emerald-400',
    content: `Turn ON "Simulation Mode", then click "Start Sim". This is the fully
supported, end-to-end path — no hardware or relay required:

  • Animated drone flying a path on the map
  • Live attitude (roll/pitch/yaw), GPS, altitude, speed
  • Battery draining over time

Use it to explore every panel and plan missions.`,
  },
  {
    icon: Wifi,
    title: 'Connect to Hardware',
    color: 'text-rose-400',
    content: `1. Start the relay (mini-services/drone-service) — it listens on :3004
2. Turn OFF "Simulation Mode"
3. Click "Connect" — the GCS opens ws://<this-computer>:3004
4. A registered drone shows up under "Drones" and telemetry flows in

Set NEXT_PUBLIC_DRONE_URL if the relay runs on another host.`,
  },
  {
    icon: MapPin,
    title: 'Waypoint Planning',
    color: 'text-amber-400',
    content: `1. Click "Add WP" above the map
2. Click the map to place a waypoint
3. Click a waypoint to edit lat, lng, alt, speed, action
4. Actions: Fly To, Loiter, Land, Takeoff
5. Save to the database, or Export / Import as JSON`,
  },
  {
    icon: Plane,
    title: 'Flight Controls',
    color: 'text-red-400',
    content: `Buttons relay commands straight through to the drone:

  • ARM / DISARM — enable/disable motors
  • TAKEOFF / LAND — climb / descend
  • RTL — return to launch
  • E-STOP — emergency stop, kills motors

In Simulation Mode these just drive the on-screen model.`,
  },
  {
    icon: AlertTriangle,
    title: 'Firmware Status — Read This',
    color: 'text-orange-400',
    content: `The downloadable ESP32 sketch is an educational REFERENCE, not flight-ready
firmware. It shows the message protocol and the PID / motor-mix structure, but
it is NOT safe to fly:

  • Blocking delays in the loop (loiter/land) stop stabilization
  • "Altitude hold" uses GPS only — no barometer
  • Output isn't a standard ESC signal; there are no failsafes

Real autonomous flight needs a proven controller (ArduPilot / PX4 / Betaflight).
Treat this as a learning scaffold — bench-test only, props OFF.`,
  },
]

// ─── "Setup" tab content ──────────────────────────────────────────────────────

interface SetupSection {
  icon: ElementType
  title: string
  note?: string
  items: string[]
}

const setupSections: SetupSection[] = [
  {
    icon: CheckCircle2,
    title: 'What Works Today',
    items: [
      'Web GCS: map, telemetry, mission planning, logs — fully working',
      'Simulation Mode: complete end-to-end demo, no hardware needed',
      'Relay (:3004): one WebSocket protocol shared by GCS, sim, and ESP32',
      'Missions save to a local database and export / import as JSON',
      'The ESP32 firmware is an educational reference — see "ESP32 Firmware" below',
    ],
  },
  {
    icon: Package,
    title: 'Reference Hardware',
    note: 'The hardware the reference firmware targets — for study, not a flight guarantee.',
    items: [
      'ESP32 DevKit V1 (or similar ESP32 board)',
      'MPU-6050 6-axis IMU module',
      'NEO-6M GPS module',
      '4x ESCs + 4x Brushless Motors (matched to your frame)',
      'LiPo battery (3S or 4S) with XT60 connector',
      '5V UBEC / power module for the ESP32',
      '2x 100KΩ + 1x 33KΩ resistors (battery voltage divider)',
      'Breadboard + jumper wires, and a USB cable for programming',
    ],
  },
  {
    icon: Cpu,
    title: 'ESP32 Firmware (Reference — Not Airworthy)',
    note: 'Flash it to LEARN, not to fly. Motors and props OFF.',
    items: [
      'Download main_flight_controller.ino from the ESP32 tab',
      'Open in PlatformIO or Arduino IDE; libs: ArduinoJson, MPU6050, TinyGPSPlus, arduinoWebSockets',
      'Set WIFI_SSID, WIFI_PASS, and WS_HOST (this computer\'s IP)',
      'It demonstrates the protocol, IMU/GPS reads, and PID + motor-mix layout',
      'It is NOT flight-ready: blocking delays, GPS-only altitude, no ESC calibration, no failsafes',
      'For real flight use ArduPilot / PX4 / Betaflight on a dedicated flight controller',
    ],
  },
  {
    icon: Wrench,
    title: 'Wiring (Props OFF)',
    items: [
      'MPU-6050: SDA → GPIO21, SCL → GPIO22, 3.3V, GND',
      'NEO-6M GPS: TX → GPIO16 (RX2), RX → GPIO17 (TX2), 3.3V, GND',
      'Voltage divider: Battery+ → 100KΩ → GPIO34 → 33KΩ → GND',
      'ESC signals: FL → GPIO25, FR → GPIO26, BL → GPIO27, BR → GPIO32',
      'Power the ESP32 from the UBEC (5V); never leave props on the bench',
    ],
  },
  {
    icon: Zap,
    title: 'Bench Testing (Do Not Fly)',
    items: [
      'Flash with props OFF, open Serial Monitor at 115200 baud',
      'Confirm roll/pitch/yaw respond, and GPS gets a fix outdoors (sats ≥ 4)',
      'Start the relay, click Connect — the drone should appear and stream telemetry',
      'Send arm / disarm / e-stop and watch the logs; motors should idle, not fly',
      'Do NOT attempt autonomous flight on this reference firmware',
    ],
  },
  {
    icon: Smartphone,
    title: 'Network Setup (Phone / Tablet)',
    items: [
      'Find this computer\'s local IP (e.g., 192.168.1.100)',
      'On your phone (same WiFi), open http://192.168.1.100:3000',
      'The GCS auto-connects to ws://<that-IP>:3004 — no config needed',
      'Override with NEXT_PUBLIC_DRONE_URL if the relay lives elsewhere',
      'If it can\'t connect, check the computer\'s firewall for ports 3000 and 3004',
    ],
  },
  {
    icon: AlertTriangle,
    title: 'Safety',
    items: [
      'Keep propellers OFF for all bench testing with this firmware',
      'Do not fly this reference firmware — it has no failsafes and will not stabilize reliably',
      'LiPo batteries can catch fire — keep an extinguisher nearby, never drain below 3.3V/cell',
      'Never operate near people, buildings, aircraft, or restricted airspace',
      'You are responsible for legal and safe operation of anything you build',
    ],
  },
]

// ─── Shared sub-components ────────────────────────────────────────────────────

function StepCard({ step, index }: { step: (typeof howItWorksSteps)[0]; index: number }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${step.color} shrink-0`}>
            <step.icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[9px] font-mono">
                {String(index + 1).padStart(2, '0')}
              </Badge>
              <h3 className="text-xs font-semibold">{step.title}</h3>
            </div>
            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words font-sans leading-relaxed">
              {step.content}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SetupSectionCard({ section }: { section: SetupSection }) {
  return (
    <Card className="border-border/50 bg-muted/20">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <section.icon className="h-4 w-4 text-amber-400 shrink-0" />
          <h4 className="text-xs font-semibold">{section.title}</h4>
        </div>
        {section.note && (
          <p className="text-[10px] text-orange-400/90 mb-2 leading-relaxed">{section.note}</p>
        )}
        <ul className="space-y-1">
          {section.items.map((item, j) => (
            <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-amber-500 mt-1 shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ─── Main component with two subtabs ─────────────────────────────────────────

type HelpSubtab = 'how' | 'setup'

export default function HelpGuide() {
  const [subtab, setSubtab] = useState<HelpSubtab>('how')

  return (
    <div className="h-full flex flex-col">
      {/* Subtab switcher */}
      <div className="flex gap-1 p-2 pb-0 shrink-0">
        <button
          onClick={() => setSubtab('how')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            subtab === 'how'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Radio className="h-3 w-3" />
          How It Works
        </button>
        <button
          onClick={() => setSubtab('setup')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            subtab === 'setup'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Settings className="h-3 w-3" />
          Setup
        </button>
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 pt-3 space-y-2 pb-4">
          {subtab === 'how' ? (
            howItWorksSteps.map((step, i) => (
              <StepCard key={i} step={step} index={i} />
            ))
          ) : (
            setupSections.map((section, i) => (
              <SetupSectionCard key={i} section={section} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
