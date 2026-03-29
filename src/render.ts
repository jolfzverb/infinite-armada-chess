import type { GameState } from './game';
import type { Piece } from './types';

const SYMBOLS: Record<string, string> = {
  'w-K': '♔', 'w-Q': '♕', 'w-R': '♖', 'w-B': '♗', 'w-N': '♘', 'w-P': '♙',
  'b-K': '♚', 'b-Q': '♛', 'b-R': '♜', 'b-B': '♝', 'b-N': '♞', 'b-P': '♟',
};

function symbol(piece: Piece): string {
  return SYMBOLS[`${piece.color}-${piece.type}`];
}

export function render(
  state: GameState,
  topRow: number,
  visibleRows: number,
  container: HTMLElement,
  onSquareClick: (row: number, col: number) => void,
): void {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'board-wrapper';

  for (let row = topRow; row < topRow + visibleRows; row++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row';
    if (row === 0) rowEl.classList.add('board-row--top');
    if (row === 7) rowEl.classList.add('board-row--bottom');

    const label = document.createElement('div');
    const isOriginal = row >= 0 && row <= 7;
    label.className = `row-label${isOriginal ? ' row-label--original' : ''}`;
    label.textContent = String(8 - row);
    rowEl.appendChild(label);

    for (let col = 0; col < 8; col++) {
      const sq = document.createElement('div');
      const light = (row + col) % 2 === 0;
      sq.className = `square ${light ? 'light' : 'dark'}`;

      if (state.selected?.row === row && state.selected?.col === col) {
        sq.classList.add('selected');
      }

      const piece = state.board.getCell(row, col);
      if (piece !== null) {
        const span = document.createElement('span');
        span.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
        span.textContent = symbol(piece);
        sq.appendChild(span);
      }

      sq.addEventListener('click', () => onSquareClick(row, col));
      rowEl.appendChild(sq);
    }

    wrapper.appendChild(rowEl);
  }

  container.appendChild(wrapper);
}
