import { SparseBoard } from './board';
import { getLegalMoves, getGameStatus, findKing } from './moves';
import type { CastlingRights, Color, GameStatus, LastMove, Piece, PieceType, Pos } from './types';

export class GameState {
  board = new SparseBoard();
  selected: Pos | null = null;
  turn: Color = 'w';
  lastMove: LastMove | null = null;
  castlingRights: CastlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  status: GameStatus = 'playing';
  legalMoves: Pos[] = [];
  pendingPromotion: Pos | null = null;
  moveLog: string[] = [];
  private pendingNotation = '';

  reset(): void {
    this.board = new SparseBoard();
    this.selected = null;
    this.turn = 'w';
    this.lastMove = null;
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.status = 'playing';
    this.legalMoves = [];
    this.pendingPromotion = null;
    this.moveLog = [];
    this.pendingNotation = '';
  }

  click(row: number, col: number): void {
    if (this.pendingPromotion) return;
    if (this.status === 'checkmate' || this.status === 'stalemate') return;

    // No piece selected yet
    if (this.selected === null) {
      const piece = this.board.getCell(row, col);
      if (piece && piece.color === this.turn) {
        this.selected = { row, col };
        this.legalMoves = getLegalMoves(this.board, { row, col }, this.lastMove, this.castlingRights);
      }
      return;
    }

    const { row: sr, col: sc } = this.selected;

    // Click same square → deselect
    if (sr === row && sc === col) {
      this.selected = null;
      this.legalMoves = [];
      return;
    }

    // Click another own piece → reselect
    const clickedPiece = this.board.getCell(row, col);
    if (clickedPiece && clickedPiece.color === this.turn) {
      this.selected = { row, col };
      this.legalMoves = getLegalMoves(this.board, { row, col }, this.lastMove, this.castlingRights);
      return;
    }

    // Check if target is a legal move
    if (!this.legalMoves.some(m => m.row === row && m.col === col)) {
      return;
    }

    const piece = this.board.getCell(sr, sc)!;

    // Compute notation before executing move
    const isCapture = clickedPiece !== null || (piece.type === 'P' && col !== sc);
    this.pendingNotation = this.computeNotation({ row: sr, col: sc }, { row, col }, piece, isCapture);

    // Execute move
    this.board.setCell(row, col, piece);
    this.board.setCell(sr, sc, null);

    // En passant capture
    if (piece.type === 'P' && col !== sc && clickedPiece === null) {
      this.board.setCell(sr, col, null);
    }

    // Castling rook move
    if (piece.type === 'K' && Math.abs(col - sc) === 2) {
      if (col === 6) {
        this.board.setCell(row, 5, this.board.getCell(row, 7));
        this.board.setCell(row, 7, null);
      } else {
        this.board.setCell(row, 3, this.board.getCell(row, 0));
        this.board.setCell(row, 0, null);
      }
    }

    // Update castling rights
    this.updateCastlingRights(piece.type, piece.color, sr, sc, row, col);

    // Set last move
    this.lastMove = { from: { row: sr, col: sc }, to: { row, col }, piece };

    // Promotion check
    const promotionRow = piece.color === 'w' ? 0 : 7;
    if (piece.type === 'P' && row === promotionRow) {
      this.pendingPromotion = { row, col };
      this.selected = null;
      this.legalMoves = [];
      return;
    }

    this.finishTurn();
    this.recordMove(this.pendingNotation);
  }

  promote(pieceType: PieceType): void {
    if (!this.pendingPromotion) return;
    const { row, col } = this.pendingPromotion;
    this.board.setCell(row, col, { type: pieceType, color: this.turn });
    this.pendingPromotion = null;
    this.pendingNotation += '=' + pieceType;
    this.finishTurn();
    this.recordMove(this.pendingNotation);
  }

  exportMoves(): string {
    let result = '';
    for (let i = 0; i < this.moveLog.length; i++) {
      if (i % 2 === 0) {
        if (i > 0) result += ' ';
        result += `${i / 2 + 1}. `;
      } else {
        result += ' ';
      }
      result += this.moveLog[i];
    }
    return result;
  }

  importMoves(movetext: string): { success: boolean; error?: string } {
    const tokens = movetext
      .replace(/\d+\.{1,3}\s*/g, '')
      .trim()
      .split(/\s+/)
      .filter(s => s.length > 0 && !s.match(/^(1-0|0-1|1\/2-1\/2|\*)$/));

    this.reset();

    for (let i = 0; i < tokens.length; i++) {
      if (!this.applyNotation(tokens[i])) {
        this.selected = null;
        this.legalMoves = [];
        return { success: false, error: `Move ${i + 1}: ${tokens[i]}` };
      }
    }

    return { success: true };
  }

  private applyNotation(notation: string): boolean {
    if (this.status === 'checkmate' || this.status === 'stalemate') return false;

    let s = notation.replace(/[+#]/g, '');

    // Castling
    if (s === 'O-O' || s === 'O-O-O') {
      const king = findKing(this.board, this.turn);
      const targetCol = s === 'O-O' ? 6 : 2;
      return this.tryMove(king, { row: king.row, col: targetCol });
    }

    // Promotion
    let promotion: PieceType | undefined;
    const promoMatch = s.match(/=([QRBN])$/);
    if (promoMatch) {
      promotion = promoMatch[1] as PieceType;
      s = s.slice(0, -2);
    }

    // Piece type
    let pieceType: PieceType = 'P';
    if (/^[KQRBN]/.test(s)) {
      pieceType = s[0] as PieceType;
      s = s.slice(1);
    }

    // Remove capture marker
    s = s.replace('x', '');

    // Parse destination (file + rank at end)
    const destMatch = s.match(/([a-h])(-?\d+)$/);
    if (!destMatch) return false;

    const destCol = destMatch[1].charCodeAt(0) - 97;
    const destRow = 8 - parseInt(destMatch[2], 10);

    // Parse disambiguation prefix
    const prefix = s.slice(0, s.length - destMatch[0].length);
    let disambigCol: number | undefined;
    let disambigRow: number | undefined;

    if (prefix.length > 0) {
      const dm = prefix.match(/^([a-h])?(-?\d+)?$/);
      if (!dm) return false;
      if (dm[1]) disambigCol = dm[1].charCodeAt(0) - 97;
      if (dm[2] !== undefined) disambigRow = 8 - parseInt(dm[2], 10);
    }

    // Find matching piece with legal move to destination
    const to: Pos = { row: destRow, col: destCol };

    for (let r = this.board.top - 1; r <= this.board.bottom + 1; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = this.board.getCell(r, c);
        if (!cell || cell.color !== this.turn || cell.type !== pieceType) continue;
        if (disambigCol !== undefined && c !== disambigCol) continue;
        if (disambigRow !== undefined && r !== disambigRow) continue;

        const moves = getLegalMoves(this.board, { row: r, col: c }, this.lastMove, this.castlingRights);
        if (moves.some(m => m.row === to.row && m.col === to.col)) {
          return this.tryMove({ row: r, col: c }, to, promotion);
        }
      }
    }

    return false;
  }

  private tryMove(from: Pos, to: Pos, promotion?: PieceType): boolean {
    const turnBefore = this.turn;

    this.click(from.row, from.col);
    if (!this.selected || this.selected.row !== from.row || this.selected.col !== from.col) {
      this.selected = null;
      this.legalMoves = [];
      return false;
    }

    this.click(to.row, to.col);

    if (this.pendingPromotion) {
      if (!promotion) return false;
      this.promote(promotion);
    }

    return this.turn !== turnBefore;
  }

  kingPos(color: Color): Pos {
    return findKing(this.board, color);
  }

  private finishTurn(): void {
    this.selected = null;
    this.legalMoves = [];
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this.status = getGameStatus(this.board, this.turn, this.lastMove, this.castlingRights);
  }

  private computeNotation(from: Pos, to: Pos, piece: Piece, isCapture: boolean): string {
    const file = 'abcdefgh';
    const rank = (r: number) => String(8 - r);

    // Castling
    if (piece.type === 'K' && Math.abs(to.col - from.col) === 2) {
      return to.col === 6 ? 'O-O' : 'O-O-O';
    }

    let notation = '';

    if (piece.type === 'P') {
      if (isCapture) notation += file[from.col];
    } else {
      notation += piece.type;
      notation += this.disambiguate(piece, from, to);
    }

    if (isCapture) notation += 'x';
    notation += file[to.col] + rank(to.row);

    return notation;
  }

  private disambiguate(piece: Piece, from: Pos, to: Pos): string {
    const file = 'abcdefgh';
    const ambiguous: Pos[] = [];

    for (let r = this.board.top - 1; r <= this.board.bottom + 1; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === from.row && c === from.col) continue;
        const cell = this.board.getCell(r, c);
        if (cell && cell.type === piece.type && cell.color === piece.color) {
          const moves = getLegalMoves(this.board, { row: r, col: c }, this.lastMove, this.castlingRights);
          if (moves.some(m => m.row === to.row && m.col === to.col)) {
            ambiguous.push({ row: r, col: c });
          }
        }
      }
    }

    if (ambiguous.length === 0) return '';

    const sameFile = ambiguous.some(p => p.col === from.col);
    const sameRank = ambiguous.some(p => p.row === from.row);

    if (!sameFile) return file[from.col];
    if (!sameRank) return String(8 - from.row);
    return file[from.col] + String(8 - from.row);
  }

  private recordMove(notation: string): void {
    if (this.status === 'checkmate') notation += '#';
    else if (this.status === 'check') notation += '+';
    this.moveLog.push(notation);
  }

  private updateCastlingRights(
    type: PieceType, color: Color, fromRow: number, fromCol: number, toRow: number, toCol: number,
  ): void {
    if (type === 'K') {
      if (color === 'w') { this.castlingRights.wK = false; this.castlingRights.wQ = false; }
      else { this.castlingRights.bK = false; this.castlingRights.bQ = false; }
    }
    if (type === 'R') {
      if (color === 'w' && fromRow === 7) {
        if (fromCol === 7) this.castlingRights.wK = false;
        if (fromCol === 0) this.castlingRights.wQ = false;
      }
      if (color === 'b' && fromRow === 0) {
        if (fromCol === 7) this.castlingRights.bK = false;
        if (fromCol === 0) this.castlingRights.bQ = false;
      }
    }
    // If a rook is captured on its original square
    if (toRow === 0 && toCol === 0) this.castlingRights.bQ = false;
    if (toRow === 0 && toCol === 7) this.castlingRights.bK = false;
    if (toRow === 7 && toCol === 0) this.castlingRights.wQ = false;
    if (toRow === 7 && toCol === 7) this.castlingRights.wK = false;
  }
}
