import { GameState } from './game';
import { render, renderMoveLog, renderPromotionDialog, updateStatus } from './render';

const SQUARE_SIZE = 72;
const VISIBLE_ROWS = Math.floor(window.innerHeight / SQUARE_SIZE);

const state = new GameState();
let topRow = -2; // initial view: original board (0–7) near the top
let flipped = false;

const app = document.getElementById('app')!;
const statusEl = document.getElementById('status')!;
const moveLogEl = document.getElementById('move-log')!;
app.style.height = `${VISIBLE_ROWS * SQUARE_SIZE}px`;
app.tabIndex = 0;

function update(): void {
  render(state, topRow, VISIBLE_ROWS, app, (row, col) => {
    state.click(row, col);
    update();
  }, flipped);

  updateStatus(statusEl, state);
  renderMoveLog(moveLogEl, state.moveLog);

  // Promotion dialog
  const existing = document.querySelector('.promotion-overlay');
  if (existing) existing.remove();

  if (state.pendingPromotion) {
    const dialog = renderPromotionDialog(state.turn, (type) => {
      state.promote(type);
      update();
    });
    document.body.appendChild(dialog);
  }
}

const SCROLL_ROWS = 2;

const dir = () => flipped ? -1 : 1;

app.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY !== 0) {
    topRow += Math.sign(e.deltaY) * SCROLL_ROWS * dir();
    update();
  }
}, { passive: false });

app.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp')   { e.preventDefault(); topRow -= dir(); update(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); topRow += dir(); update(); }
});

document.getElementById('btn-reset')!.addEventListener('click', () => {
  state.reset();
  topRow = -2;
  update();
  app.focus();
});

document.getElementById('btn-rotate')!.addEventListener('click', () => {
  flipped = !flipped;
  update();
  app.focus();
});

document.getElementById('btn-export')!.addEventListener('click', () => {
  const text = state.exportMoves();
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-export')!;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Export moves'; }, 1500);
  });
  app.focus();
});

document.getElementById('btn-import')!.addEventListener('click', () => {
  const input = prompt('Paste moves:');
  if (input === null || input.trim() === '') return;
  const result = state.importMoves(input);
  topRow = -2;
  update();
  if (!result.success) {
    alert(`Invalid move: ${result.error}`);
  }
  app.focus();
});

update();
app.focus();
