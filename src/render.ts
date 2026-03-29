import type { GameState } from './game';
import type { Piece, PieceType, Pos } from './types';

// Pawn symbols include U+FE0E (VS15) to force text presentation in Firefox
const SYMBOLS: Record<string, string> = {
  'w-K': '♔', 'w-Q': '♕', 'w-R': '♖', 'w-B': '♗', 'w-N': '♘', 'w-P': '♙︎',
  'b-K': '♚', 'b-Q': '♛', 'b-R': '♜', 'b-B': '♝', 'b-N': '♞', 'b-P': '♟︎',
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
  flipped: boolean = false,
): void {
  container.innerHTML = '';

  // Check king position for highlighting
  let checkKingPos: Pos | null = null;
  if (state.status === 'check' || state.status === 'checkmate') {
    checkKingPos = state.kingPos(state.turn);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'board-wrapper';

  for (let i = 0; i < visibleRows; i++) {
    const row = flipped ? topRow + visibleRows - 1 - i : topRow + i;
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row';
    if (row === 0) rowEl.classList.add(flipped ? 'board-row--bottom' : 'board-row--top');
    if (row === 7) rowEl.classList.add(flipped ? 'board-row--top' : 'board-row--bottom');

    const label = document.createElement('div');
    const isOriginal = row >= 0 && row <= 7;
    label.className = `row-label${isOriginal ? ' row-label--original' : ''}`;
    label.textContent = String(8 - row);
    rowEl.appendChild(label);

    for (let c = 0; c < 8; c++) {
      const col = flipped ? 7 - c : c;
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

export function renderMoveLog(el: HTMLElement, moveLog: string[]): void {
  el.innerHTML = '';
  const totalMoves = Math.ceil(moveLog.length / 2);

  for (let i = totalMoves - 1; i >= 0; i--) {
    const white = moveLog[i * 2];
    const black = moveLog[i * 2 + 1] ?? '';

    const line = document.createElement('div');
    line.className = 'move-line';

    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i + 1}.`;

    const w = document.createElement('span');
    w.className = 'move-ply';
    w.textContent = white;

    line.appendChild(num);
    line.appendChild(w);

    if (black) {
      const b = document.createElement('span');
      b.className = 'move-ply';
      b.textContent = black;
      line.appendChild(b);
    }

    el.appendChild(line);
  }
}

function buildCaptureLine(color: 'w' | 'b', captures: PieceType[]): HTMLDivElement {
  const line = document.createElement('div');
  line.className = `capture-line cap-${color === 'w' ? 'white' : 'black'}`;

  // King icon for the player
  const king = document.createElement('span');
  king.className = 'cap-king';
  king.textContent = SYMBOLS[`${color}-K`];
  line.appendChild(king);

  // Group captures by type, ordered by value
  const order: PieceType[] = ['Q', 'R', 'B', 'N', 'P'];
  const counts = new Map<PieceType, number>();
  for (const t of captures) counts.set(t, (counts.get(t) ?? 0) + 1);

  const opponent = color === 'w' ? 'b' : 'w';
  for (const t of order) {
    const n = counts.get(t);
    if (!n) continue;
    const span = document.createElement('span');
    span.className = 'cap-piece';
    span.textContent = SYMBOLS[`${opponent}-${t}`] + (n > 1 ? n : '');
    line.appendChild(span);
  }

  return line;
}

export function renderCaptures(el: HTMLElement, state: GameState): void {
  el.innerHTML = '';
  el.appendChild(buildCaptureLine('w', state.captures.w));
  el.appendChild(buildCaptureLine('b', state.captures.b));
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
