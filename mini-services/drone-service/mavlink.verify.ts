/*
 * Verification for mavlink.ts — builds known MAVLink v2 frames, decodes them,
 * and checks the translated telemetry/status. Run: `bun mavlink.verify.ts`
 */
import { MavlinkTranslator, MavlinkParser, commandToMavlink } from './mavlink'

let failures = 0
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.log(`  ✗ ${name}` + (got !== undefined ? ` (got ${JSON.stringify(got)})` : ''))
  }
}
const near = (a: number | null, b: number, eps = 1e-3) => a != null && Math.abs(a - b) < eps

// Build a MAVLink v2 frame with a dummy CRC (decoder skips CRC validation).
function v2(msgid: number, payload: Uint8Array): Uint8Array {
  const f = new Uint8Array(10 + payload.length + 2)
  f[0] = 0xfd
  f[1] = payload.length
  f[7] = msgid & 0xff
  f[8] = (msgid >> 8) & 0xff
  f[9] = (msgid >> 16) & 0xff
  f.set(payload, 10)
  return f
}
function payload(len: number, fill: (dv: DataView) => void): Uint8Array {
  const b = new Uint8Array(len)
  fill(new DataView(b.buffer))
  return b
}

const t = new MavlinkTranslator()

console.log('HEARTBEAT (armed, AUTO):')
t.push(v2(0, payload(9, (d) => { d.setUint32(0, 3, true); d.setUint8(6, 0x80) })))
check('armed = true', t.status.armed === true, t.status.armed)
check('mode = AUTO', t.status.mode === 'AUTO', t.status.mode)

console.log('ATTITUDE (roll 0.1rad, pitch -0.2, yaw 1.5):')
t.push(v2(30, payload(28, (d) => {
  d.setFloat32(4, 0.1, true); d.setFloat32(8, -0.2, true); d.setFloat32(12, 1.5, true)
})))
check('roll ≈ 5.7296°', near(t.telemetry.roll, 0.1 * 180 / Math.PI, 0.01), t.telemetry.roll)
check('pitch ≈ -11.459°', near(t.telemetry.pitch, -0.2 * 180 / Math.PI, 0.01), t.telemetry.pitch)
check('yaw ≈ 85.94°', near(t.telemetry.yaw, 1.5 * 180 / Math.PI, 0.01), t.telemetry.yaw)

console.log('GLOBAL_POSITION_INT (12.9716, 77.5946, 50m, 5m/s E, hdg 90):')
t.push(v2(33, payload(28, (d) => {
  d.setInt32(4, Math.round(12.9716 * 1e7), true)
  d.setInt32(8, Math.round(77.5946 * 1e7), true)
  d.setInt32(12, 60000, true)  // alt MSL mm (ignored)
  d.setInt32(16, 50000, true)  // relative_alt mm → 50 m
  d.setInt16(20, 500, true)    // vx 5 m/s
  d.setInt16(22, 0, true)
  d.setUint16(26, 9000, true)  // hdg 90.00°
})))
check('lat ≈ 12.9716', near(t.telemetry.lat, 12.9716, 1e-4), t.telemetry.lat)
check('lng ≈ 77.5946', near(t.telemetry.lng, 77.5946, 1e-4), t.telemetry.lng)
check('alt = 50', near(t.telemetry.alt, 50, 0.01), t.telemetry.alt)
check('speed = 5', near(t.telemetry.speed, 5, 0.01), t.telemetry.speed)
check('heading = 90', near(t.telemetry.heading, 90, 0.01), t.telemetry.heading)

console.log('SYS_STATUS (12.0V, 78%):')
t.push(v2(1, payload(31, (d) => { d.setUint16(14, 12000, true); d.setInt8(30, 78) })))
check('battery = 12.0V', near(t.telemetry.battery, 12.0, 0.001), t.telemetry.battery)
check('batteryLevel = 78', t.status.batteryLevel === 78, t.status.batteryLevel)

console.log('GPS_RAW_INT (fix 3D, 11 sats):')
t.push(v2(24, payload(30, (d) => { d.setUint8(28, 3); d.setUint8(29, 11) })))
check('gpsFix = true', t.telemetry.gpsFix === true, t.telemetry.gpsFix)
check('satellites = 11', t.telemetry.satellites === 11, t.telemetry.satellites)

console.log('COMMAND_LONG encode (arm) round-trips through the parser:')
const armFrame = commandToMavlink('arm')!
const parsed = new MavlinkParser().push(armFrame)
check('one frame parsed', parsed.length === 1, parsed.length)
check('msgid = 76 (COMMAND_LONG)', parsed[0]?.msgid === 76, parsed[0]?.msgid)
check('command field = 400 (ARM_DISARM)', parsed[0]?.payload.getUint16(28, true) === 400, parsed[0]?.payload.getUint16(28, true))
check('param1 = 1 (arm)', parsed[0]?.payload.getFloat32(0, true) === 1, parsed[0]?.payload.getFloat32(0, true))

console.log('')
console.log(failures === 0 ? '✅ ALL MAVLINK CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
