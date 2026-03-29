import { SparseBoard } from './board';

export interface Pos {
  row: number;
  col: number;
}

export class GameState {
  board = new SparseBoard();
  selected: Pos | null = null;

  reset(): void {
    this.board = new SparseBoard();
    this.selected = null;
  }

  click(row: number, col: number): void {
    if (this.selected === null) {
      if (this.board.getCell(row, col) !== null) {
        this.selected = { row, col };
      }
      return;
    }

    const { row: r, col: c } = this.selected;

    if (r === row && c === col) {
      this.selected = null;
      return;
    }

    // Move piece; captures (removes) any piece at the destination
    const piece = this.board.getCell(r, c);
    this.board.setCell(row, col, piece);
    this.board.setCell(r, c, null);
    this.selected = null;
  }
}
