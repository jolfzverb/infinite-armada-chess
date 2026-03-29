import { GameState } from './game';
import { render, renderCaptures, renderMoveLog, renderPromotionDialog, updateStatus } from './render';

function computeLayout() {
  const isMobile = window.innerWidth <= 600;
  const availWidth = isMobile ? window.innerWidth : window.innerWidth - 180;
  const maxByWidth = Math.floor(availWidth / 8.5); // 8 squares + half-square label
  const maxByHeight = Math.floor(window.innerHeight / 12);
  const sq = Math.min(maxByWidth, maxByHeight, 72);
  const rows = Math.floor(window.innerHeight / sq);
  return { sq, rows };
}

let { sq: SQUARE_SIZE, rows: VISIBLE_ROWS } = computeLayout();

const state = new GameState();
let topRow = -2; // initial view: original board (0–7) near the top
let flipped = false;

const app = document.getElementById('app')!;
const statusEl = document.getElementById('status')!;
const moveLogEl = document.getElementById('move-log')!;
const capturesEl = document.getElementById('captures')!;
app.tabIndex = 0;

function applyLayout(): void {
  document.documentElement.style.setProperty('--sq', SQUARE_SIZE + 'px');
  app.style.height = `${VISIBLE_ROWS * SQUARE_SIZE}px`;
}

applyLayout();

function update(): void {
  render(state, topRow, VISIBLE_ROWS, app, (row, col) => {
    state.click(row, col);
    update();
  }, flipped);

  renderCaptures(capturesEl, state);
  updateStatus(statusEl, state);
  renderMoveLog(moveLogEl, state.moveLog);

  const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
  btnExport.disabled = state.moveLog.length === 0;

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

// Touch scroll
let touchLastY = 0;
let touchAccum = 0;

app.addEventListener('touchstart', (e) => {
  touchLastY = e.touches[0].clientY;
  touchAccum = 0;
}, { passive: true });

app.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const y = e.touches[0].clientY;
  touchAccum += (touchLastY - y) * dir();
  touchLastY = y;

  const steps = Math.trunc(touchAccum / SQUARE_SIZE);
  if (steps !== 0) {
    topRow += steps;
    touchAccum -= steps * SQUARE_SIZE;
    update();
  }
}, { passive: false });

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
    btn.textContent = '\u2713';
    setTimeout(() => { btn.textContent = '\u2197'; }, 1500);
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

// Sidebar toggle (mobile)
const sidebar = document.getElementById('sidebar')!;
const btnSidebarOpen = document.getElementById('btn-sidebar-open')!;
const btnSidebarClose = document.getElementById('btn-sidebar-close')!;

btnSidebarOpen.addEventListener('click', () => {
  sidebar.classList.add('open');
  btnSidebarOpen.classList.add('hidden');
});

btnSidebarClose.addEventListener('click', () => {
  sidebar.classList.remove('open');
  btnSidebarOpen.classList.remove('hidden');
});

update();
app.focus();
