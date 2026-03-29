export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export type Color = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Pos {
  row: number;
  col: number;
}

export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate';

export interface CastlingRights {
  wK: boolean; wQ: boolean;
  bK: boolean; bQ: boolean;
}

export interface LastMove {
  from: Pos;
  to: Pos;
  piece: Piece;
}

