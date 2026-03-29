import type { Color, Piece, PieceType } from './types';

type Row = (Piece | null)[];

const BACK_RANK: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

// Default row for virtual (unmaterialized) rows: all queens of the appropriate color
function defaultRow(r: number): Row {
  const color: Color = r < 0 ? 'b' : 'w';
  return Array.from({ length: 8 }, (): Piece => ({ type: 'Q', color }));
}

function initialRow(r: number): Row {
  if (r === 0) return BACK_RANK.map(type => ({ type, color: 'b' as const }));
  if (r === 1) return Array.from({ length: 8 }, (): Piece => ({ type: 'P', color: 'b' }));
  if (r === 6) return Array.from({ length: 8 }, (): Piece => ({ type: 'P', color: 'w' }));
  if (r === 7) return BACK_RANK.map(type => ({ type, color: 'w' as const }));
  return new Array<Piece | null>(8).fill(null);
}

// Sparse board: rows 0–7 are always materialized (initial chess position).
// Rows outside that range exist only as defaults until a move touches them.
// When materializing row R, all rows between R and the nearest existing boundary
// are also materialized (contiguous block invariant).
export class SparseBoard {
  private rows = new Map<number, Row>();
  private topBound = 0;
  private bottomBound = 7;

  constructor() {
    for (let r = 0; r <= 7; r++) {
      this.rows.set(r, initialRow(r));
    }
  }

  getCell(r: number, c: number): Piece | null {
    if (r >= this.topBound && r <= this.bottomBound) {
      return this.rows.get(r)![c];
    }
    // Virtual row — return default piece without allocating
    const color: Color = r < 0 ? 'b' : 'w';
    return { type: 'Q', color };
  }

  setCell(r: number, c: number, piece: Piece | null): void {
    this.materialize(r);
    this.rows.get(r)![c] = piece;
  }

  get top(): number { return this.topBound; }
  get bottom(): number { return this.bottomBound; }

  clone(): SparseBoard {
    const copy = Object.create(SparseBoard.prototype) as SparseBoard;
    copy.rows = new Map();
    for (const [r, row] of this.rows) {
      copy.rows.set(r, row.map(cell => cell ? { ...cell } : null));
    }
    copy.topBound = this.topBound;
    copy.bottomBound = this.bottomBound;
    return copy;
  }

  private materialize(r: number): void {
    if (r >= this.topBound && r <= this.bottomBound) return;

    if (r < this.topBound) {
      for (let i = this.topBound - 1; i >= r; i--) {
        this.rows.set(i, defaultRow(i));
      }
      this.topBound = r;
    } else {
      for (let i = this.bottomBound + 1; i <= r; i++) {
        this.rows.set(i, defaultRow(i));
      }
      this.bottomBound = r;
    }
  }
}
