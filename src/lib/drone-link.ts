/*
 * DroneLink — the browser's connection to the drone relay (:3004).
 *
 * A thin wrapper over the native WebSocket that speaks the same
 * `{ type, data }` JSON protocol as the relay and the ESP32 firmware,
 * with a small `on()` / `emit()` API and automatic reconnect.
 *
 * The relay URL defaults to `ws://<this-host>:3004`, so it works out of the
 * box on localhost AND when you open the GCS from a phone on the same WiFi.
 * Override it with `NEXT_PUBLIC_DRONE_URL` if the relay lives elsewhere.
 */

type Handler = (data: unknown) => void

const RECONNECT_MS = 2500
const HEARTBEAT_MS = 15000

export class DroneLink {
  private ws: WebSocket | null = null
  private readonly handlers = new Map<string, Set<Handler>>()
  private readonly url: string
  private shouldReconnect = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(url: string = DroneLink.defaultUrl()) {
    this.url = url
  }

  static defaultUrl(): string {
    const env = process.env.NEXT_PUBLIC_DRONE_URL
    if (env) return env
    if (typeof window !== 'undefined') {
      const host = window.location.hostname || 'localhost'
      return `ws://${host}:3004`
    }
    return 'ws://localhost:3004'
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get endpoint(): string {
    return this.url
  }

  /** Subscribe to a message type. Returns an unsubscribe function. */
  on(type: string, cb: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(cb)
    return () => this.handlers.get(type)?.delete(cb)
  }

  /** Send a `{ type, data }` message to the relay. */
  emit(type: string, data?: unknown): void {
    if (this.connected) this.ws!.send(JSON.stringify({ type, data }))
  }

  connect(): void {
    this.shouldReconnect = true
    this.open()
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      // Detach handlers so the close doesn't trigger a reconnect.
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
  }

  private dispatch(type: string, data: unknown): void {
    this.handlers.get(type)?.forEach((cb) => {
      try {
        cb(data)
      } catch (err) {
        console.error(`[DroneLink] handler for "${type}" threw:`, err)
      }
    })
  }

  private open(): void {
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.startHeartbeat()
      this.dispatch('connect', undefined)
    }

    this.ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: { type?: string; data?: unknown }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg && typeof msg.type === 'string') this.dispatch(msg.type, msg.data)
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.dispatch('disconnect', undefined)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.shouldReconnect) this.open()
    }, RECONNECT_MS)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => this.emit('heartbeat'), HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
