import type { GameState } from './game';
import type { Piece, PieceType, Pos } from './types';

const SYMBOLS: Record<string, string> = {
  'w-K': '♔', 'w-Q': '♕', 'w-R': '♖', 'w-B': '♗', 'w-N': '♘', 'w-P': '♙',
  'b-K': '♚', 'b-Q': '♛', 'b-R': '♜', 'b-B': '♝', 'b-N': '♞', 'b-P': '♟',
};

function symbol(piece: Piece): string {
  return SYMBOLS[`${piece.color}-${piece.type}`];
}

function posInList(list: Pos[], row: number, col: number): boolean {
  return list.some(p => p.row === row && p.col === col);
}

export function render(
  state: GameState,
  topRow: number,
  visibleRows: number,
  container: HTMLElement,
  onSquareClick: (row: number, col: number) => void,
): void {
  container.innerHTML = '';

  // Check king position for highlighting
  let checkKingPos: Pos | null = null;
  if (state.status === 'check' || state.status === 'checkmate') {
    checkKingPos = state.kingPos(state.turn);
  }

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

      if (checkKingPos && checkKingPos.row === row && checkKingPos.col === col) {
        sq.classList.add('in-check');
      }

      // Legal move highlighting
      if (posInList(state.legalMoves, row, col)) {
        const targetPiece = state.board.getCell(row, col);
        sq.classList.add(targetPiece ? 'legal-capture' : 'legal-move');
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

export function renderPromotionDialog(
  color: 'w' | 'b',
  onSelect: (type: PieceType) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'promotion-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'promotion-dialog';

  const pieces: PieceType[] = ['Q', 'R', 'B', 'N'];
  for (const type of pieces) {
    const btn = document.createElement('div');
    btn.className = `promo-btn ${color === 'w' ? 'white' : 'black'}`;
    btn.textContent = SYMBOLS[`${color}-${type}`];
    btn.addEventListener('click', () => onSelect(type));
    dialog.appendChild(btn);
  }

  overlay.appendChild(dialog);
  return overlay;
}

export function updateStatus(el: HTMLElement, state: GameState): void {
  const turnName = state.turn === 'w' ? 'White' : 'Black';
  el.classList.remove('check', 'gameover');

  switch (state.status) {
    case 'playing':
      el.textContent = `${turnName} to move`;
      break;
    case 'check':
      el.textContent = `${turnName} is in check!`;
      el.classList.add('check');
      break;
    case 'checkmate': {
      const winner = state.turn === 'w' ? 'Black' : 'White';
      el.textContent = `Checkmate! ${winner} wins`;
      el.classList.add('gameover');
      break;
    }
    case 'stalemate':
      el.textContent = 'Stalemate — draw';
      el.classList.add('gameover');
      break;
  }
}
