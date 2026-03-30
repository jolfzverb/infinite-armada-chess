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
let scrollY = -2 * SQUARE_SIZE; // continuous pixel offset (replaces discrete topRow)
let flipped = false;

const app = document.getElementById('app')!;
const statusEl = document.getElementById('status')!;
const moveLogEl = document.getElementById('move-log')!;
const capturesEl = document.getElementById('captures')!;
app.tabIndex = 0;

/* ── Layout ── */

function applyLayout(): void {
  document.documentElement.style.setProperty('--sq', SQUARE_SIZE + 'px');
  app.style.height = `${VISIBLE_ROWS * SQUARE_SIZE}px`;
}

applyLayout();

/* ── Rendering ── */

let wrapperEl: HTMLElement | null = null;
let lastRenderedTopRow: number | null = null;

function getTopRow(): number {
  return Math.floor(scrollY / SQUARE_SIZE);
}

function applyScroll(): void {
  const top = getTopRow();
  const frac = scrollY - top * SQUARE_SIZE; // always in [0, SQUARE_SIZE)

  if (top !== lastRenderedTopRow || !wrapperEl) {
    renderBoard();
    lastRenderedTopRow = top;
  }

  if (wrapperEl) {
    const offset = flipped ? frac - SQUARE_SIZE : -frac;
    wrapperEl.style.transform = `translateY(${offset}px)`;
  }
}

function renderBoard(): void {
  const top = getTopRow();
  // Render one extra row so partial rows are visible during smooth scroll
  render(state, top, VISIBLE_ROWS + 1, app, (row, col) => {
    state.click(row, col);
    fullUpdate();
  }, flipped);
  wrapperEl = app.querySelector('.board-wrapper');
}

function fullUpdate(): void {
  lastRenderedTopRow = null; // force DOM rebuild
  applyScroll();

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
      fullUpdate();
    });
    document.body.appendChild(dialog);
  }
}

/* ── Momentum / inertia ── */

let velocity = 0;
let rafId: number | null = null;

function stopMomentum(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  velocity = 0;
}

function startMomentum(): void {
  const FRICTION = 0.95;
  const MIN_VELOCITY = 0.5;

  function tick() {
    velocity *= FRICTION;
    if (Math.abs(velocity) < MIN_VELOCITY) {
      velocity = 0;
      rafId = null;
      return;
    }
    scrollY += velocity;
    applyScroll();
    rafId = requestAnimationFrame(tick);
  }

  if (Math.abs(velocity) >= MIN_VELOCITY) {
    rafId = requestAnimationFrame(tick);
  }
}

/* ── Smooth scroll animation (for keyboard) ── */

function smoothScrollBy(delta: number): void {
  stopMomentum();
  const start = scrollY;
  const startTime = performance.now();
  const duration = 150;

  function tick(now: number) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = t * (2 - t); // ease-out quadratic
    scrollY = start + delta * ease;
    applyScroll();
    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  rafId = requestAnimationFrame(tick);
}

/* ── Input: wheel ── */

const dir = () => flipped ? -1 : 1;

app.addEventListener('wheel', (e) => {
  e.preventDefault();
  stopMomentum();
  scrollY += e.deltaY * dir();
  applyScroll();
}, { passive: false });

/* ── Input: keyboard ── */

app.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    smoothScrollBy(-SQUARE_SIZE * dir());
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    smoothScrollBy(SQUARE_SIZE * dir());
  }
});

/* ── Input: touch (pointer events for reliable capture) ── */

const DRAG_THRESHOLD = 8; // px before a touch becomes a drag
let wasDragging = false;

let dragState: {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  isDragging: boolean;
} | null = null;

app.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  stopMomentum();
  wasDragging = false;
  dragState = {
    pointerId: e.pointerId,
    startY: e.clientY,
    lastY: e.clientY,
    lastTime: performance.now(),
    velocity: 0,
    isDragging: false,
  };
  app.setPointerCapture(e.pointerId);
});

app.addEventListener('pointermove', (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;

  const y = e.clientY;
  const now = performance.now();

  if (!dragState.isDragging) {
    if (Math.abs(y - dragState.startY) > DRAG_THRESHOLD) {
      dragState.isDragging = true;
    } else {
      return;
    }
  }

  e.preventDefault();
  const dy = (dragState.lastY - y) * dir();
  const dt = now - dragState.lastTime;

  if (dt > 0) {
    const instantV = dy / dt * 16;
    dragState.velocity = dragState.velocity * 0.4 + instantV * 0.6;
  }

  scrollY += dy;
  dragState.lastY = y;
  dragState.lastTime = now;
  applyScroll();
});

function onPointerRelease(e: PointerEvent): void {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  if (dragState.isDragging) {
    wasDragging = true;
    const elapsed = performance.now() - dragState.lastTime;
    velocity = elapsed > 100 ? 0 : dragState.velocity;
    startMomentum();
  }
  dragState = null;
}

app.addEventListener('pointerup', onPointerRelease);
app.addEventListener('pointercancel', onPointerRelease);

// Suppress click on squares after a drag gesture
app.addEventListener('click', (e) => {
  if (wasDragging) {
    e.stopPropagation();
    wasDragging = false;
  }
}, { capture: true });

/* ── Resize ── */

window.addEventListener('resize', () => {
  const logicalRow = scrollY / SQUARE_SIZE;
  ({ sq: SQUARE_SIZE, rows: VISIBLE_ROWS } = computeLayout());
  scrollY = logicalRow * SQUARE_SIZE;
  applyLayout();
  lastRenderedTopRow = null;
  applyScroll();
});

/* ── Buttons ── */

document.getElementById('btn-reset')!.addEventListener('click', () => {
  state.reset();
  scrollY = -2 * SQUARE_SIZE;
  stopMomentum();
  fullUpdate();
  app.focus();
});

document.getElementById('btn-rotate')!.addEventListener('click', () => {
  flipped = !flipped;
  fullUpdate();
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
  scrollY = -2 * SQUARE_SIZE;
  stopMomentum();
  fullUpdate();
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

/* ── Init ── */

fullUpdate();
app.focus();
