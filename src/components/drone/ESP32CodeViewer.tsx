'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Code, Copy, Check, Download, Cpu, Eye, AlertTriangle } from 'lucide-react'

interface CodeFile {
  name: string
  language: string
  description: string
  code: string
}

const ESP32_CODE_FILES: CodeFile[] = [
  {
    name: 'main_flight_controller.ino',
    language: 'cpp',
    description: 'Main flight controller with MPU-6050, GPS, and waypoint navigation',
    code: `/*
 * Shaher-136 Autonomous Drone - ESP32 Flight Controller
 * 
 * Hardware:
 *   - ESP32 DevKit V1
 *   - MPU-6050 (IMU - Accelerometer + Gyroscope)
 *   - NEO-6M GPS Module (UART2)
 *   - OV2640 Camera Module (optional)
 *   - 4x ESCs + Brushless Motors
 *   - Power Module (voltage/current sensor)
 * 
 * Pin Mapping:
 *   MPU-6050: SDA=21, SCL=22
 *   GPS: TX=16, RX=17 (HardwareSerial2)
 *   Motors: GPIO 25, 26, 27, 32 (PWM)
 *   Camera: Uses default I2C/SPI pins
 *   Voltage Sensor: GPIO 34 (ADC)
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <MPU6050.h>
#include <TinyGPSPlus.h>

// ============== CONFIGURATION ==============
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* WS_HOST   = "192.168.1.100"; // GCS IP address
const int   WS_PORT   = 3004;

// Motor pins (PWM)
const int MOTOR_FL = 25;  // Front Left
const int MOTOR_FR = 26;  // Front Right
const int MOTOR_BL = 27;  // Back Left
const int MOTOR_BR = 32;  // Back Right

const int MOTOR_FREQ   = 20000; // 20kHz for ESC
const int MOTOR_RES    = 8;     // 8-bit resolution (0-255)
const int MOTOR_MIN    = 40;    // Minimum throttle
const int MOTOR_MAX    = 200;   // Maximum throttle
const int ARM_THROTTLE = 0;     // Motors off when armed

// PID Gains
struct PID {
  float kp, ki, kd;
  float integral, prev_error;
};

PID pid_roll  = { 0.08, 0.001, 0.04, 0, 0 };
PID pid_pitch = { 0.08, 0.001, 0.04, 0, 0 };
PID pid_yaw   = { 0.1,  0.002, 0.02, 0, 0 };
PID pid_alt   = { 0.5,  0.01,  0.3,  0, 0 };

// State
bool armed = false;
String flight_mode = "STABILIZE";
float base_throttle = 0;

// IMU Data
MPU6050 mpu;
float accel_x, accel_y, accel_z;
float gyro_x, gyro_y, gyro_z;
float roll = 0, pitch = 0, yaw = 0;

// GPS
TinyGPSPlus gps;
HardwareSerial gpsSerial(2); // UART2
bool gps_fix = false;
float lat = 0, lng = 0, alt = 0;
double gps_speed = 0;
int satellites = 0;
double heading = 0;

// Waypoints
struct Waypoint {
  double lat, lng;
  float alt, speed;
  String action;
  int loiter_time;
  bool reached;
};

#define MAX_WAYPOINTS 50
Waypoint waypoints[MAX_WAYPOINTS];
int waypoint_count = 0;
int current_waypoint = 0;
bool mission_active = false;

// Timers
unsigned long last_telemetry = 0;
unsigned long last_gps_read = 0;
const int TELEMETRY_INTERVAL = 100;  // 10Hz telemetry
const int GPS_INTERVAL = 200;        // 5Hz GPS read

// WebSocket
WebSocketsClient webSocket;

// Voltage sensor
const int VOLTAGE_PIN = 34;
const float VOLTAGE_DIVIDER = 11.0; // Adjust based on your divider
float battery_voltage = 0;
float battery_percent = 100;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  Serial.println("[INIT] Shaher-136 Flight Controller Starting...");

  // Initialize motors
  ledcSetup(0, MOTOR_FREQ, MOTOR_RES);
  ledcSetup(1, MOTOR_FREQ, MOTOR_RES);
  ledcSetup(2, MOTOR_FREQ, MOTOR_RES);
  ledcSetup(3, MOTOR_FREQ, MOTOR_RES);
  ledcAttachPin(MOTOR_FL, 0);
  ledcAttachPin(MOTOR_FR, 1);
  ledcAttachPin(MOTOR_BL, 2);
  ledcAttachPin(MOTOR_BR, 3);
  setAllMotors(0);
  Serial.println("[INIT] Motors initialized");

  // Initialize MPU-6050
  Wire.begin(21, 22);
  if (mpu.begin(MPU6050_SCALE_2000DPS, MPU6050_RANGE_2G)) {
    Serial.println("[INIT] MPU-6050 connected");
  } else {
    Serial.println("[ERROR] MPU-6050 not found!");
    while (1) delay(100);
  }
  // Calibrate (keep drone level during startup)
  Serial.println("[INIT] Calibrating IMU... Keep drone LEVEL!");
  delay(2000);
  mpu.calibrateGyro();
  mpu.setThreshold(3);
  Serial.println("[INIT] IMU calibrated");

  // Initialize GPS
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("[INIT] GPS initialized on UART2");

  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WIFI] Connecting");
  int wifi_attempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifi_attempts < 40) {
    delay(500);
    Serial.print(".");
    wifi_attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\\n[WIFI] Connected! IP: %s\\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\\n[WARN] WiFi not connected, running standalone");
  }

  // Connect WebSocket
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.begin(WS_HOST, WS_PORT, "/");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
    Serial.println("[WS] WebSocket client initialized");
  }

  Serial.println("[INIT] System ready - DISARMED");
  Serial.println("[INIT] Send 'arm' command to enable motors");
}

// ============== MAIN LOOP ==============
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }

  // Read IMU at full rate
  readIMU();

  // Read GPS periodically
  if (millis() - last_gps_read >= GPS_INTERVAL) {
    last_gps_read = millis();
    readGPS();
  }

  // Flight control loop (500Hz)
  if (armed) {
    flightControl();
  }

  // Send telemetry (10Hz)
  if (millis() - last_telemetry >= TELEMETRY_INTERVAL) {
    last_telemetry = millis();
    sendTelemetry();
    readBattery();
  }

  // Process waypoint navigation
  if (armed && mission_active && gps_fix) {
    processWaypoints();
  }
}

// ============== IMU ==============
void readIMU() {
  Vector normAccel = mpu.readNormalizeAccel();
  Vector normGyro  = mpu.readNormalizeGyro();

  accel_x = normAccel.XAxis;
  accel_y = normAccel.YAxis;
  accel_z = normAccel.ZAxis;
  gyro_x  = normGyro.XAxis;
  gyro_y  = normGyro.YAxis;
  gyro_z  = normGyro.ZAxis;

  // Complementary filter (alpha = 0.98)
  float dt = 0.01; // ~100Hz loop
  float roll_acc  = atan2(accel_y, accel_z) * 180.0 / PI;
  float pitch_acc = atan2(-accel_x, sqrt(accel_y * accel_y + accel_z * accel_z)) * 180.0 / PI;

  roll  = 0.98 * (roll + gyro_x * dt) + 0.02 * roll_acc;
  pitch = 0.98 * (pitch - gyro_y * dt) + 0.02 * pitch_acc;
  yaw   = yaw + gyro_z * dt;
  if (yaw > 180) yaw -= 360;
  if (yaw < -180) yaw += 360;
}

// ============== GPS ==============
void readGPS() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  if (gps.location.isUpdated()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
    alt = gps.altitude.meters();
    gps_speed = gps.speed.mps();
    heading = gps.course.deg();
    gps_fix = true;
    satellites = gps.satellites.value();
  }
}

// ============== FLIGHT CONTROL ==============
void flightControl() {
  float roll_cmd  = 0;  // Target: 0 degrees
  float pitch_cmd = 0;  // Target: 0 degrees
  float yaw_cmd   = 0;  // Target: current heading

  // If navigating to waypoint, calculate desired roll/pitch
  if (mission_active && current_waypoint < waypoint_count && gps_fix) {
    float bearing = calcBearing(lat, lng, 
      waypoints[current_waypoint].lat, 
      waypoints[current_waypoint].lng);
    
    float heading_error = bearing - heading;
    if (heading_error > 180) heading_error -= 360;
    if (heading_error < -180) heading_error += 360;

    yaw_cmd = heading + heading_error;
    pitch_cmd = constrain(heading_error * 0.5, -15, 15);
  }

  // Altitude hold
  float alt_error = (mission_active && current_waypoint < waypoint_count) 
    ? waypoints[current_waypoint].alt - alt 
    : 0;
  float alt_correction = computePID(&pid_alt, alt_error, 0.1);

  // PID outputs
  float roll_out  = computePID(&pid_roll,  roll_cmd - roll,  0.01);
  float pitch_out = computePID(&pid_pitch, pitch_cmd - pitch, 0.01);
  float yaw_out   = computePID(&pid_yaw,   yaw_cmd - yaw,    0.01);

  // Mix to motors (X configuration)
  int fl = constrain(base_throttle - pitch_out + roll_out - yaw_out + alt_correction, MOTOR_MIN, MOTOR_MAX);
  int fr = constrain(base_throttle - pitch_out - roll_out + yaw_out + alt_correction, MOTOR_MIN, MOTOR_MAX);
  int bl = constrain(base_throttle + pitch_out + roll_out + yaw_out + alt_correction, MOTOR_MIN, MOTOR_MAX);
  int br = constrain(base_throttle + pitch_out - roll_out - yaw_out + alt_correction, MOTOR_MIN, MOTOR_MAX);

  setMotor(0, fl); // FL
  setMotor(1, fr); // FR
  setMotor(2, bl); // BL
  setMotor(3, br); // BR
}

// ============== PID ==============
float computePID(PID* pid, float error, float dt) {
  pid->integral += error * dt;
  pid->integral = constrain(pid->integral, -50, 50); // Anti-windup
  
  float derivative = (error - pid->prev_error) / dt;
  pid->prev_error = error;
  
  return (pid->kp * error) + (pid->ki * pid->integral) + (pid->kd * derivative);
}

// ============== WAYPOINTS ==============
void processWaypoints() {
  if (current_waypoint >= waypoint_count) {
    mission_active = false;
    sendLog("info", "Mission complete - all waypoints reached");
    return;
  }

  Waypoint& wp = waypoints[current_waypoint];
  double dist = calcDistance(lat, lng, wp.lat, wp.lng);

  if (dist < 5.0) { // Within 5 meters
    if (wp.action == "loiter") {
      // Loiter in place
      delay(wp.loiter_time * 1000);
    } else if (wp.action == "land") {
      // Descend and disarm
      base_throttle = MOTOR_MIN;
      delay(3000);
      armed = false;
      setAllMotors(0);
      mission_active = false;
      sendLog("info", "Landed at waypoint");
      return;
    }
    
    wp.reached = true;
    current_waypoint++;
    char buf[64];
    sprintf(buf, "Reached waypoint %d/%d", current_waypoint, waypoint_count);
    sendLog("info", buf);
  }
}

double calcDistance(double lat1, double lon1, double lat2, double lon2) {
  const double R = 6371000;
  double dLat = (lat2 - lat1) * PI / 180;
  double dLon = (lon2 - lon1) * PI / 180;
  double a = sin(dLat/2) * sin(dLat/2) +
    cos(lat1 * PI / 180) * cos(lat2 * PI / 180) *
    sin(dLon/2) * sin(dLon/2);
  return R * 2 * atan2(sqrt(a), sqrt(1-a));
}

float calcBearing(double lat1, double lon1, double lat2, double lon2) {
  double dLon = (lon2 - lon1) * PI / 180;
  double y = sin(dLon) * cos(lat2 * PI / 180);
  double x = cos(lat1 * PI / 180) * sin(lat2 * PI / 180) -
    sin(lat1 * PI / 180) * cos(lat2 * PI / 180) * cos(dLon);
  return atan2(y, x) * 180.0 / PI;
}

// ============== MOTOR CONTROL ==============
void setMotor(int channel, int value) {
  if (!armed && value > 0) value = 0;
  ledcWrite(channel, constrain(value, 0, MOTOR_MAX));
}

void setAllMotors(int value) {
  for (int i = 0; i < 4; i++) setMotor(i, value);
}

// ============== BATTERY ==============
void readBattery() {
  int raw = analogRead(VOLTAGE_PIN);
  battery_voltage = (raw / 4095.0) * 3.3 * VOLTAGE_DIVIDER;
  // LiPo: 3.0V = 0%, 4.2V = 100%
  battery_percent = constrain(
    ((battery_voltage - 3.0) / 1.2) * 100.0, 0, 100
  );
  
  if (battery_percent < 20) {
    sendLog("warn", "LOW BATTERY! Return to land!");
  }
}

// ============== TELEMETRY ==============
void sendTelemetry() {
  StaticJsonDocument<512> doc;
  doc["type"] = "telemetry";
  JsonObject data = doc.createNestedObject("data");
  data["lat"]       = lat;
  data["lng"]       = lng;
  data["alt"]       = alt;
  data["speed"]     = gps_speed;
  data["heading"]   = heading;
  data["roll"]      = roll;
  data["pitch"]     = pitch;
  data["yaw"]       = yaw;
  data["battery"]   = battery_voltage;
  data["gpsFix"]    = gps_fix;
  data["satellites"]= satellites;

  char buffer[512];
  serializeJson(doc, buffer);
  
  if (webSocket.isConnected()) {
    webSocket.sendTXT(buffer);
  }

  // Send status periodically
  StaticJsonDocument<256> statusDoc;
  statusDoc["type"] = "drone-status";
  JsonObject status = statusDoc.createNestedObject("data");
  status["armed"]        = armed;
  status["mode"]         = flight_mode;
  status["gpsFix"]       = gps_fix;
  status["batteryLevel"] = battery_percent;
  
  char statusBuf[256];
  serializeJson(statusDoc, statusBuf);
  
  if (webSocket.isConnected()) {
    webSocket.sendTXT(statusBuf);
  }
}

void sendLog(String level, String message) {
  StaticJsonDocument<256> doc;
  doc["type"] = "drone-log";
  JsonObject data = doc.createNestedObject("data");
  data["level"]   = level;
  data["message"] = message;
  
  char buffer[256];
  serializeJson(doc, buffer);
  Serial.printf("[%s] %s\\n", level.c_str(), message.c_str());
  
  if (webSocket.isConnected()) {
    webSocket.sendTXT(buffer);
  }
}

// ============== WEBSOCKET EVENTS ==============
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[WS] Connected to GCS");
      // Register as drone
      {
        StaticJsonDocument<64> doc;
        doc["role"] = "drone";
        char buf[64];
        serializeJson(doc, buf);
        webSocket.sendTXT(buf);
      }
      break;

    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from GCS");
      break;

    case WStype_TEXT: {
      StaticJsonDocument<1024> doc;
      deserializeJson(doc, payload, length);
      String msgType = doc["type"];

      if (msgType == "command") {
        handleCommand(doc["data"]);
      } else if (msgType == "mission") {
        handleMission(doc["data"]["waypoints"]);
      }
      break;
    }
  }
}

void handleCommand(JsonObject cmd) {
  String command = cmd["command"];
  sendLog("info", "Command received: " + command);

  if (command == "arm") {
    armed = true;
    flight_mode = "STABILIZE";
    base_throttle = ARM_THROTTLE;
    sendLog("info", "MOTORS ARMED - Be careful!");
  }
  else if (command == "disarm") {
    armed = false;
    setAllMotors(0);
    flight_mode = "STABILIZE";
    sendLog("info", "Disarmed");
  }
  else if (command == "takeoff") {
    float target_alt = cmd["params"]["altitude"] | 50.0;
    armed = true;
    flight_mode = "AUTO";
    base_throttle = MOTOR_MIN + 30; // Climb throttle
    mission_active = true;
    sendLog("info", "Taking off to " + String(target_alt) + "m");
  }
  else if (command == "land") {
    flight_mode = "LAND";
    sendLog("info", "Landing...");
    // Gradually reduce throttle
    while (base_throttle > MOTOR_MIN) {
      base_throttle -= 1;
      setAllMotors(base_throttle);
      delay(100);
      readIMU(); // Keep IMU running
    }
    armed = false;
    setAllMotors(0);
    mission_active = false;
    sendLog("info", "Landed and disarmed");
  }
  else if (command == "rtl") {
    sendLog("info", "Return To Launch");
    flight_mode = "RTL";
    mission_active = true;
    // Simple RTL: just reduce altitude
    base_throttle = MOTOR_MIN + 15;
  }
  else if (command == "emergency_stop") {
    armed = false;
    setAllMotors(0);
    mission_active = false;
    flight_mode = "STABILIZE";
    sendLog("error", "EMERGENCY STOP - All motors off!");
  }
}

void handleMission(JsonArray wpArray) {
  waypoint_count = min((int)wpArray.size(), MAX_WAYPOINTS);
  current_waypoint = 0;
  
  for (int i = 0; i < waypoint_count; i++) {
    waypoints[i].lat  = wpArray[i]["lat"];
    waypoints[i].lng  = wpArray[i]["lng"];
    waypoints[i].alt  = wpArray[i]["alt"] | 50.0;
    waypoints[i].speed = wpArray[i]["speed"] | 10.0;
    waypoints[i].action = wpArray[i]["action"] | "fly_to";
    waypoints[i].loiter_time = wpArray[i]["loiterTime"] | 0;
    waypoints[i].reached = false;
  }

  char buf[64];
  sprintf(buf, "Mission loaded: %d waypoints", waypoint_count);
  sendLog("info", buf);
  
  // Don't auto-start, wait for takeoff command
}`,
  },
  {
    name: 'platformio.ini',
    language: 'ini',
    description: 'PlatformIO build configuration for ESP32',
    code: `; PlatformIO Project Configuration File
; Shaher-136 Drone Flight Controller

[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

; Serial monitor speed
monitor_speed = 115200

; Library dependencies
lib_deps =
    bblanchon/ArduinoJson@^6.21.0
    jrowberg/I2Cdevlib-MPU6050@^1.0.0
    mikalhart/TinyGPSPlus@^1.0.3
    Links2004/arduinoWebSockets@^2.4.1

; Build flags
build_flags =
    -DCORE_DEBUG_LEVEL=1

; Upload speed
upload_speed = 921600

; Partition scheme (larger app partition)
board_build.partitions = huge_app.csv`,
  },
  {
    name: 'wiring_diagram.md',
    language: 'markdown',
    description: 'Hardware wiring diagram and connections',
    code: `# Shaher-136 Drone - Wiring Diagram

## Components
- **ESP32 DevKit V1** (Main Controller)
- **MPU-6050** (6-Axis IMU)
- **NEO-6M GPS Module** 
- **OV2640 Camera** (Optional)
- **4x ESCs + Brushless Motors**
- **5V UBEC / Power Module**
- **LiPo Battery (3S-4S)**
- **Voltage Divider** (Battery monitoring)

## Wiring Connections

### MPU-6050 (I2C)
| MPU-6050 | ESP32 |
|----------|-------|
| VCC      | 3.3V  |
| GND      | GND   |
| SDA      | GPIO21|
| SCL      | GPIO22|
| INT      | (Optional) GPIO4 |

### NEO-6M GPS (UART2)
| NEO-6M  | ESP32 |
|---------|-------|
| VCC     | 3.3V  |
| GND     | GND   |
| TX      | GPIO16 (RX2) |
| RX      | GPIO17 (TX2) |
| PPS     | (Optional) |

### Motors (PWM via LEDC)
| Motor Position | ESC Signal | ESP32 GPIO |
|---------------|------------|------------|
| Front Left    | PWM Ch 0   | GPIO 25    |
| Front Right   | PWM Ch 1   | GPIO 26    |
| Back Left     | PWM Ch 2   | GPIO 27    |
| Back Right    | PWM Ch 3   | GPIO 32    |

> All ESCs share 5V BEC and GND

### Battery Monitor (Voltage Divider)
- **Battery+** -> 100KΩ -> GPIO34 -> 33KΩ -> GND
- Ratio = (100K + 33K) / 33K ≈ 4.03
- Max input: ~13.3V (4S LiPo fully charged)

### OV2640 Camera (Optional)
| OV2640  | ESP32 |
|---------|-------|
| VCC     | 3.3V  |
| GND     | GND   |
| SDA     | GPIO21 (shared I2C) |
| SCL     | GPIO22 (shared I2C) |
| SIOD    | GPIO18 (I2C for camera data) |
| SIOC    | GPIO19 |
| D0-D7   | GPIO5,18,19,21,36,39,34,35 |
| PCLK    | GPIO22 |
| VSYNC   | GPIO25 |
| HREF    | GPIO23 |
| XCLK    | GPIO15 |
| PWDN    | GPIO-1 (not used) |
| RESET   | GPIO-1 (not used) |

## Power Distribution
\`\`\`
LiPo Battery (3S/4S)
  ├──> Power Module (5V BEC)
  │     ├──> ESP32 (5V via VIN)
  │     ├──> MPU-6050 (3.3V via ESP32)
  │     ├──> NEO-6M GPS (3.3V via ESP32)
  │     └──> Camera (3.3V via ESP32)
  ├──> Voltage Divider (Monitor)
  └──> 4x ESCs (Direct battery voltage)
        └──> 4x Brushless Motors
\`\`\`

## Notes
1. **Decoupling capacitors**: Place 100μF electrolytic + 100nF ceramic 
   near ESP32 power pins
2. **GPS antenna**: Must face sky - mount on top of drone
3. **MPU-6050**: Mount as close to CG (center of gravity) as possible
4. **Motor order**: Verify rotation directions before first flight!
5. **Propellers**: Use LOCKNUT to secure props!`,
  },
]

export default function ESP32CodeViewer() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)

  const handleCopy = (code: string, fileId: string) => {
    navigator.clipboard.writeText(code)
    setCopiedId(fileId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDownload = (file: CodeFile) => {
    const blob = new Blob([file.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="border-border/50 h-full flex flex-col">
      <CardHeader className="p-3 pb-2 flex-shrink-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5" />
            ESP32 Firmware
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {ESP32_CODE_FILES.length} files
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div className="mx-3 mt-2 mb-1 flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-orange-200/90">
            <span className="font-semibold text-orange-300">Educational reference — not flight-ready.</span>{' '}
            This sketch demonstrates the WebSocket protocol and PID / motor-mix layout, but has blocking delays in
            the control loop, GPS-only altitude, no ESC calibration, and no failsafes. Flash it to study or to
            bench-test telemetry with <span className="font-semibold">props OFF</span> — do not fly it. For real
            autonomous flight use ArduPilot, PX4, or Betaflight on a dedicated flight controller.
          </p>
        </div>
        <ScrollArea className="h-full max-h-[400px]">
          <Accordion
            type="single"
            collapsible
            value={expandedFile || undefined}
            onValueChange={(v) => setExpandedFile(v || null)}
          >
            {ESP32_CODE_FILES.map((file) => (
              <AccordionItem key={file.name} value={file.name}>
                <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/50 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Code className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-mono truncate">{file.name}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">({file.language})</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <div className="px-3 pb-2">
                    <p className="text-[10px] text-muted-foreground mb-2">{file.description}</p>
                    <div className="flex gap-1.5 mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => handleCopy(file.code, file.name)}
                      >
                        {copiedId === file.name ? (
                          <><Check className="h-3 w-3" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="h-3 w-3" /> Download
                      </Button>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3 overflow-x-auto">
                      <pre className="text-[10px] leading-relaxed font-mono text-foreground/80 whitespace-pre">
                        {file.code}
                      </pre>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}