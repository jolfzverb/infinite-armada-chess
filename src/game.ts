import { SparseBoard } from './board';
import { getLegalMoves, getGameStatus, findKing } from './moves';
import type { CastlingRights, Color, GameStatus, LastMove, PieceType, Pos } from './types';

export class GameState {
  board = new SparseBoard();
  selected: Pos | null = null;
  turn: Color = 'w';
  lastMove: LastMove | null = null;
  castlingRights: CastlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  status: GameStatus = 'playing';
  legalMoves: Pos[] = [];
  pendingPromotion: Pos | null = null;

  reset(): void {
    this.board = new SparseBoard();
    this.selected = null;
    this.turn = 'w';
    this.lastMove = null;
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.status = 'playing';
    this.legalMoves = [];
    this.pendingPromotion = null;
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
  }

  promote(pieceType: PieceType): void {
    if (!this.pendingPromotion) return;
    const { row, col } = this.pendingPromotion;
    this.board.setCell(row, col, { type: pieceType, color: this.turn });
    this.pendingPromotion = null;
    this.finishTurn();
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
