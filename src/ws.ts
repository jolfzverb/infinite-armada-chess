export interface MoveData {
  move_number: number;
  color: string;
  notation: string;
}

export interface StateMsg { type: 'state'; moves: MoveData[]; white_time_ms: number; black_time_ms: number; status: string; turn: string; your_color: string; game_started: boolean; }
export interface MoveMsg { type: 'move'; move_number: number; color: string; notation: string; white_time_ms: number; black_time_ms: number; }
export interface GameOverMsg { type: 'game_over'; result: string; reason: string; }
export interface ReadyCheckMsg { type: 'ready_check'; deadline_ms: number; }
export interface PlayerReadyMsg { type: 'player_ready'; color: string; }
export interface GameStartMsg { type: 'game_start'; }
export interface ReadyTimeoutMsg { type: 'ready_timeout'; }
export interface MoveRejectedMsg { type: 'move_rejected'; reason: string; }
export interface PremovesClearedMsg { type: 'premoves_cleared'; }
export interface DrawOfferedMsg { type: 'draw_offered'; }
export interface ErrorMsg { type: 'error'; message: string; }

export type ServerMsg = StateMsg | MoveMsg | GameOverMsg | ReadyCheckMsg | PlayerReadyMsg | GameStartMsg | ReadyTimeoutMsg | MoveRejectedMsg | PremovesClearedMsg | DrawOfferedMsg | ErrorMsg;

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ((msg: never) => void)[]>();
  private gameId = 0;
  private token?: string;
  private attempt = 0;
  private closed = false;
  private reconnectTimer = 0;

  connect(gameId: number, token?: string): void {
    this.gameId = gameId;
    this.token = token;
    this.closed = false;
    this.attempt = 0;
    this.dial();
  }

  private buildURL(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (this.token) {
      // Connect directly to backend, bypassing dev proxy
      const host = location.hostname + ':8080';
      return `${proto}//${host}/ws/games/${this.gameId}?token=${this.token}`;
    }
    return `${proto}//${location.host}/ws/games/${this.gameId}`;
  }

  private dial(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.buildURL());

    ws.onopen = () => {
      this.attempt = 0;
      this.ws = ws;
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const fns = this.handlers.get(msg.type);
      if (fns) fns.forEach(fn => fn(msg));
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (this.closed) return;
      this.ws = null;
      const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
      this.attempt++;
      this.reconnectTimer = window.setTimeout(() => this.dial(), delay);
    };
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: (msg: never) => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }
}
