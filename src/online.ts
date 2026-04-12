import { GameState } from './game';
import { GameSocket } from './ws';
import type { StateMsg, MoveMsg, GameOverMsg, MoveRejectedMsg } from './ws';
import type { Color, PieceType } from './types';

export class OnlineGame {
  state = new GameState();
  private socket: GameSocket;
  private onUpdate: () => void;

  myColor: Color | '' = '';
  gameStarted = false;
  whiteTimeMs = 0;
  blackTimeMs = 0;
  clockStart = 0;
  private clockTurn: Color = 'w';

  readyCheckActive = false;
  iAmReady = false;
  opponentReady = false;

  gameOver = false;
  gameResult = '';
  gameReason = '';
  drawOffered = false;

  private pendingMoveNotation: string | null = null;

  constructor(gameId: number, onUpdate: () => void, token?: string | null) {
    this.onUpdate = onUpdate;
    this.socket = new GameSocket();

    this.socket.on('state', (msg: never) => this.handleState(msg as StateMsg));
    this.socket.on('move', (msg: never) => this.handleMove(msg as MoveMsg));
    this.socket.on('game_over', (msg: never) => {
      const m = msg as GameOverMsg;
      this.gameOver = true;
      this.gameResult = m.result;
      this.gameReason = m.reason;
      this.onUpdate();
    });
    this.socket.on('ready_check', () => {
      this.readyCheckActive = true;
      this.iAmReady = false;
      this.opponentReady = false;
      this.onUpdate();
    });
    this.socket.on('player_ready', () => {
      this.opponentReady = true;
      this.onUpdate();
    });
    this.socket.on('game_start', () => {
      this.readyCheckActive = false;
      this.gameStarted = true;
      this.clockStart = performance.now();
      this.onUpdate();
    });
    this.socket.on('ready_timeout', () => {
      this.readyCheckActive = false;
      this.iAmReady = false;
      this.opponentReady = false;
      this.onUpdate();
    });
    this.socket.on('move_rejected', (msg: never) => {
      const m = msg as MoveRejectedMsg;
      console.warn('move rejected:', m.reason);
      this.pendingMoveNotation = null;
      this.socket.send({ type: 'sync' });
    });
    this.socket.on('draw_offered', () => {
      this.drawOffered = true;
      this.onUpdate();
    });
    this.socket.on('error', (msg: never) => {
      console.warn('ws error:', (msg as { message: string }).message);
    });

    this.socket.connect(gameId, token || undefined);
  }

  private handleState(msg: StateMsg): void {
    this.state = new GameState();
    if (msg.moves) {
      for (const m of msg.moves) {
        this.state.applyNotation(m.notation);
      }
    }
    this.myColor = (msg.your_color || '') as Color | '';
    this.gameStarted = msg.game_started;
    this.whiteTimeMs = msg.white_time_ms;
    this.blackTimeMs = msg.black_time_ms;
    this.clockTurn = msg.turn as Color;
    this.pendingMoveNotation = null;
    if (this.gameStarted && !this.gameOver) this.clockStart = performance.now();
    this.onUpdate();
  }

  private handleMove(msg: MoveMsg): void {
    // Skip if this is our own optimistic move
    if (this.pendingMoveNotation === msg.notation) {
      this.pendingMoveNotation = null;
    } else {
      this.state.applyNotation(msg.notation);
    }
    this.whiteTimeMs = msg.white_time_ms;
    this.blackTimeMs = msg.black_time_ms;
    this.clockTurn = this.state.turn;
    this.clockStart = performance.now();
    this.onUpdate();
  }

  handleClick(row: number, col: number): void {
    if (this.gameOver) return;
    if (this.myColor === '') return;
    if (!this.gameStarted) return;
    if (this.myColor !== this.state.turn) return;

    const prevLen = this.state.moveLog.length;
    this.state.click(row, col);

    if (this.state.moveLog.length > prevLen && !this.state.pendingPromotion) {
      this.sendLastMove();
    }
    this.onUpdate();
  }

  handlePromotion(type: PieceType): void {
    const prevLen = this.state.moveLog.length;
    this.state.promote(type);
    if (this.state.moveLog.length > prevLen) {
      this.sendLastMove();
    }
    this.onUpdate();
  }

  private sendLastMove(): void {
    const notation = this.state.moveLog[this.state.moveLog.length - 1];
    this.pendingMoveNotation = notation;
    this.socket.send({ type: 'move', notation });
  }

  getDisplayTime(color: Color): number {
    const base = color === 'w' ? this.whiteTimeMs : this.blackTimeMs;
    if (!this.gameStarted || this.gameOver) return base;
    if (color !== this.clockTurn) return base;
    const elapsed = performance.now() - this.clockStart;
    return Math.max(0, base - elapsed);
  }

  isMyTurn(): boolean {
    return this.myColor === this.state.turn;
  }

  hasClock(): boolean {
    return this.whiteTimeMs > 0 || this.blackTimeMs > 0;
  }

  sendReady(): void {
    this.iAmReady = true;
    this.socket.send({ type: 'ready' });
    this.onUpdate();
  }

  sendResign(): void { this.socket.send({ type: 'resign' }); }
  sendDrawOffer(): void { this.socket.send({ type: 'draw_offer' }); }
  sendDrawAccept(): void { this.drawOffered = false; this.socket.send({ type: 'draw_accept' }); }

  destroy(): void {
    this.socket.close();
  }
}

export function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (ms < 10000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
