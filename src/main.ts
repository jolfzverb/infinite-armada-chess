import { GameState } from './game';
import { render, renderCaptures, renderMoveLog, renderPromotionDialog, updateStatus } from './render';
import { api } from './api';
import type { User, Game, CreateGameParams } from './api';
import { OnlineGame, formatTime } from './online';

/* ── State ── */

const exploreState = new GameState();
let onlineGame: OnlineGame | null = null;
let currentUser: User | null = null;
let lobbyGames: Game[] = [];
let lobbyActive: Game[] = [];
let myGames: Game[] = [];
let lobbyTimer = 0;
let clockTimer = 0;
let authToken: string | null = sessionStorage.getItem('authToken'); // JWT for direct WS

function activeState(): GameState {
  return onlineGame ? onlineGame.state : exploreState;
}

/* ── Layout ── */

function computeLayout() {
  const isMobile = window.innerWidth <= 600;
  const sidebarWidth = isMobile ? 0 : 180 + 220;
  const availWidth = window.innerWidth - sidebarWidth;
  const maxByWidth = Math.floor(availWidth / 8.5);
  const maxByHeight = Math.floor(window.innerHeight / 12);
  const sq = Math.min(maxByWidth, maxByHeight, 72);
  const rows = Math.floor(window.innerHeight / sq);
  return { sq, rows };
}

let { sq: SQUARE_SIZE, rows: VISIBLE_ROWS } = computeLayout();

let scrollY = -2 * SQUARE_SIZE;
let flipped = false;

const app = document.getElementById('app')!;
const statusEl = document.getElementById('status')!;
const moveLogEl = document.getElementById('move-log')!;
const capturesEl = document.getElementById('captures')!;
const sidebarRight = document.getElementById('sidebar-right')!;
app.tabIndex = 0;

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
  const frac = scrollY - top * SQUARE_SIZE;

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
  const st = activeState();
  render(st, top, VISIBLE_ROWS + 1, app, (row, col) => {
    if (onlineGame) {
      onlineGame.handleClick(row, col);
      // handleClick calls onUpdate (= fullUpdate) internally
    } else {
      st.click(row, col);
      fullUpdate();
    }
  }, flipped);
  wrapperEl = app.querySelector('.board-wrapper');
}

function fullUpdate(): void {
  lastRenderedTopRow = null;
  applyScroll();

  const st = activeState();
  renderCaptures(capturesEl, st);
  updateStatus(statusEl, st);
  renderMoveLog(moveLogEl, st.moveLog);

  const inGame = !!onlineGame;
  const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
  btnExport.disabled = st.moveLog.length === 0;
  (document.getElementById('btn-reset') as HTMLButtonElement).disabled = inGame;
  (document.getElementById('btn-import') as HTMLButtonElement).disabled = inGame;

  // Promotion dialog
  const existing = document.querySelector('.promotion-overlay');
  if (existing) existing.remove();

  if (st.pendingPromotion) {
    const dialog = renderPromotionDialog(st.turn, (type) => {
      if (onlineGame) {
        onlineGame.handlePromotion(type);
      } else {
        st.promote(type);
      }
      fullUpdate();
    });
    document.body.appendChild(dialog);
  }

  renderRightSidebar();
}

/* ── Right sidebar (event delegation — survives innerHTML replacement) ── */

sidebarRight.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!btn) return;
  const action = btn.dataset.action!;

  switch (action) {
    case 'logout':
      await api.logout();
      currentUser = null;
      authToken = null;
      sessionStorage.removeItem('authToken');
      fullUpdate();
      break;
    case 'login':
      window.location.href = api.loginURL(btn.dataset.provider!);
      break;
    case 'dev-login': {
      const name = prompt('Dev username:', 'dev') || 'dev';
      try {
        const res = await fetch('/api/dev/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error();
        const tokenData = await res.json();
        authToken = tokenData.token;
        sessionStorage.setItem('authToken', authToken!);
        currentUser = await api.me();
        await refreshLobby();
        renderRightSidebar();
      } catch { alert('Dev login failed. Is backend running with DEV_MODE=1?'); }
      break;
    }
    case 'create-game':
      showCreateGameModal();
      break;
    case 'join':
      joinGameById(Number(btn.dataset.id));
      break;
    case 'watch':
      enterGame(Number(btn.dataset.id));
      break;
    case 'resume':
      enterGame(Number(btn.dataset.id));
      break;
    case 'back-lobby':
      leaveGame();
      break;
    case 'ready':
      onlineGame?.sendReady();
      break;
    case 'resign':
      if (confirm('Resign this game?')) onlineGame?.sendResign();
      break;
    case 'draw-offer':
      onlineGame?.sendDrawOffer();
      break;
    case 'draw-accept':
      onlineGame?.sendDrawAccept();
      break;
    case 'copy-link': {
      const gameId = getGameIdFromHash();
      const url = `${location.origin}${location.pathname}#game/${gameId || ''}`;
      navigator.clipboard.writeText(url).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy game link'; }, 1500);
      });
      break;
    }
  }
});

function renderRightSidebar(): void {
  if (onlineGame) {
    renderGameView();
  } else {
    renderLobbyView();
  }
}

function renderLobbyView(): void {
  const games = lobbyGames || [];
  const active = lobbyActive || [];
  const mine = myGames || [];

  let html = '<h2>Online</h2>';

  // Profile
  html += '<div class="profile-section">';
  if (currentUser) {
    html += '<div class="profile-info">';
    if (currentUser.avatar_url) {
      html += `<img class="profile-avatar" src="${esc(currentUser.avatar_url)}" alt="">`;
    }
    html += `<span class="profile-name">${esc(currentUser.name)}</span>`;
    html += '</div>';
    html += '<button data-action="logout">Logout</button>';
  } else {
    html += '<button class="btn-login" data-action="login" data-provider="github">Login with GitHub</button>';
    html += '<button class="btn-login" data-action="login" data-provider="google">Login with Google</button>';
    html += '<button class="btn-login" data-action="dev-login" style="color:#a86">Dev Login</button>';
  }
  html += '</div>';

  if (currentUser) {
    html += '<button class="btn-create" data-action="create-game">+ Create Game</button>';
  }

  // My games
  if (mine.length > 0) {
    html += '<div class="game-list">';
    html += '<h3>My Games</h3>';
    for (const g of mine) {
      html += renderMyGameCard(g);
    }
    html += '</div>';
  }

  // Open games
  html += '<div class="game-list">';
  html += '<h3>Open Games</h3>';
  if (games.length === 0) {
    html += '<div class="game-card-empty">No open games</div>';
  }
  for (const g of games) {
    html += renderGameCard(g, 'join');
  }

  // Live games
  html += '<h3>Live Games</h3>';
  if (active.length === 0) {
    html += '<div class="game-card-empty">No live games</div>';
  }
  for (const g of active) {
    html += renderGameCard(g, 'watch');
  }
  html += '</div>';

  sidebarRight.innerHTML = html;
}

function renderGameCard(g: Game, action: 'join' | 'watch'): string {
  const tc = g.time_control_sec
    ? `${Math.floor(g.time_control_sec / 60)}${g.increment_sec ? '+' + g.increment_sec : ''}`
    : 'No clock';
  const waiting = g.white_id ? 'Black' : 'White';
  let html = '<div class="game-card"><div class="game-card-top">';
  html += `<span class="game-card-time">${tc}</span>`;
  html += action === 'join' ? `<span>Play ${waiting}</span>` : '<span>In progress</span>';
  html += '</div>';
  if (currentUser) {
    html += `<button data-action="${action}" data-id="${g.id}">${action === 'join' ? 'Join' : 'Watch'}</button>`;
  }
  html += '</div>';
  return html;
}

function renderMyGameCard(g: Game): string {
  const tc = g.time_control_sec
    ? `${Math.floor(g.time_control_sec / 60)}${g.increment_sec ? '+' + g.increment_sec : ''}`
    : 'No clock';
  const statusLabel = g.status === 'waiting' ? 'Waiting' : g.status === 'active' ? 'In progress' : (g.result || 'Finished');
  let html = '<div class="game-card"><div class="game-card-top">';
  html += `<span class="game-card-time">${tc}</span>`;
  html += `<span>${statusLabel}</span>`;
  html += '</div>';
  if (g.status !== 'finished') {
    html += `<button data-action="resume" data-id="${g.id}">${g.status === 'waiting' ? 'Open' : 'Resume'}</button>`;
  }
  html += '</div>';
  return html;
}

function renderGameView(): void {
  if (!onlineGame) return;
  const og = onlineGame;
  const isSpectator = og.myColor === '';
  const myColor = og.myColor || 'w';
  const oppColor = myColor === 'w' ? 'b' : 'w';

  let html = '<div class="game-view">';
  html += '<button data-action="back-lobby">&larr; Back to lobby</button>';

  // Opponent card
  const oppActive = og.state.turn === oppColor && og.gameStarted && !og.gameOver;
  html += `<div class="player-card${oppActive ? ' active' : ''}">`;
  html += `<span class="player-name"><span class="color-dot ${oppColor === 'w' ? 'white' : 'black'}"></span>${isSpectator ? (oppColor === 'w' ? 'White' : 'Black') : 'Opponent'}</span>`;
  if (og.hasClock()) {
    html += `<span class="clock" data-clock="${oppColor}">${formatTime(og.getDisplayTime(oppColor as 'w' | 'b'))}</span>`;
  }
  html += '</div>';

  // Status / ready check
  if (og.gameOver) {
    const resultText = og.gameResult === 'draw' ? 'Draw' : (og.gameResult === 'white' ? 'White wins' : 'Black wins');
    html += `<div class="game-status-text">${resultText} (${og.gameReason})</div>`;
  } else if (og.readyCheckActive) {
    html += '<div class="ready-section">';
    html += og.iAmReady
      ? '<div class="game-status-text">Waiting for opponent...</div>'
      : '<button class="btn-ready" data-action="ready">Ready</button>';
    if (og.opponentReady) html += '<div style="color:#6b6;font-size:12px;margin-top:4px">Opponent is ready</div>';
    html += '</div>';
  } else if (!og.gameStarted && og.hasClock()) {
    html += '<div class="game-status-text">Waiting for players...</div>';
  } else if (!isSpectator) {
    html += `<div class="game-status-text">${og.isMyTurn() ? 'Your turn' : "Opponent's turn"}</div>`;
  }

  // Draw offer
  if (og.drawOffered && !og.gameOver) {
    html += '<div class="draw-banner">Draw offered <button data-action="draw-accept">Accept</button></div>';
  }

  // My card
  const myActive = og.state.turn === myColor && og.gameStarted && !og.gameOver;
  html += `<div class="player-card${myActive ? ' active' : ''}">`;
  html += `<span class="player-name"><span class="color-dot ${myColor === 'w' ? 'white' : 'black'}"></span>${isSpectator ? (myColor === 'w' ? 'White' : 'Black') : 'You'}</span>`;
  if (og.hasClock()) {
    html += `<span class="clock" data-clock="${myColor}">${formatTime(og.getDisplayTime(myColor as 'w' | 'b'))}</span>`;
  }
  html += '</div>';

  // Actions
  if (!isSpectator && !og.gameOver) {
    html += '<div class="game-actions">';
    html += '<button data-action="resign" class="btn-danger">Resign</button>';
    html += '<button data-action="draw-offer">Draw</button>';
    html += '</div>';
  }

  html += '<button data-action="copy-link">Copy game link</button>';
  html += '</div>';
  sidebarRight.innerHTML = html;
}

/* ── Clock display (separate from full re-render) ── */

function updateClocks(): void {
  if (!onlineGame || !onlineGame.hasClock()) return;
  sidebarRight.querySelectorAll('[data-clock]').forEach(el => {
    const color = (el as HTMLElement).dataset.clock as 'w' | 'b';
    const time = onlineGame!.getDisplayTime(color);
    el.textContent = formatTime(time);
    el.classList.toggle('low', time < 30000);
  });
}

/* ── Create game modal ── */

function showCreateGameModal(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Create Game</h2>
      <div>
        <label>Your color</label>
        <div class="modal-radio-group">
          <label><input type="radio" name="color" value="white" checked> White</label>
          <label><input type="radio" name="color" value="black"> Black</label>
        </div>
      </div>
      <div>
        <label><input type="checkbox" id="modal-timed"> Time control</label>
        <div class="modal-row" id="modal-time-fields" style="display:none">
          <label>Min <input type="number" id="modal-minutes" value="10" min="1" max="180"></label>
          <label>+Sec <input type="number" id="modal-increment" value="0" min="0" max="60"></label>
        </div>
      </div>
      <div>
        <label>Visibility</label>
        <div class="modal-radio-group">
          <label><input type="radio" name="visibility" value="public" checked> Public</label>
          <label><input type="radio" name="visibility" value="private"> Private</label>
        </div>
      </div>
      <div class="modal-actions">
        <button id="modal-cancel">Cancel</button>
        <button id="modal-create" class="btn-primary">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const timedCb = overlay.querySelector('#modal-timed') as HTMLInputElement;
  const timeFields = overlay.querySelector('#modal-time-fields') as HTMLElement;
  timedCb.addEventListener('change', () => { timeFields.style.display = timedCb.checked ? 'flex' : 'none'; });
  overlay.querySelector('#modal-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#modal-create')!.addEventListener('click', async () => {
    const color = (overlay.querySelector('input[name="color"]:checked') as HTMLInputElement).value as 'white' | 'black';
    const isPublic = (overlay.querySelector('input[name="visibility"]:checked') as HTMLInputElement).value === 'public';
    const params: CreateGameParams = { color, is_public: isPublic };
    if (timedCb.checked) {
      params.time_control_sec = (parseInt((overlay.querySelector('#modal-minutes') as HTMLInputElement).value) || 10) * 60;
      const inc = parseInt((overlay.querySelector('#modal-increment') as HTMLInputElement).value) || 0;
      if (inc > 0) params.increment_sec = inc;
    }
    overlay.remove();
    try {
      const game = await api.createGame(params);
      enterGame(game.id);
    } catch { alert('Failed to create game'); }
  });
}

/* ── Game lifecycle ── */

async function joinGameById(gameId: number): Promise<void> {
  try {
    await api.joinGame(gameId);
    enterGame(gameId);
  } catch { alert('Failed to join game'); }
}

let currentGameId: number | null = null;

function enterGame(gameId: number): void {
  if (currentGameId === gameId) return; // prevent double-entry from hashchange
  if (onlineGame) onlineGame.destroy();
  if (clockTimer) { clearInterval(clockTimer); clockTimer = 0; }
  currentGameId = gameId;
  if (location.hash !== `#game/${gameId}`) location.hash = `game/${gameId}`;
  onlineGame = new OnlineGame(gameId, () => fullUpdate(), authToken);
  clockTimer = window.setInterval(updateClocks, 100);
  scrollY = -2 * SQUARE_SIZE;
  stopMomentum();
  fullUpdate();
}

function leaveGame(): void {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = 0; }
  if (onlineGame) { onlineGame.destroy(); onlineGame = null; }
  currentGameId = null;
  location.hash = '';
  refreshLobby();
  fullUpdate();
}

function getGameIdFromHash(): number | null {
  const match = location.hash.match(/^#game\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/* ── Lobby polling ── */

async function refreshLobby(): Promise<void> {
  if (!currentUser) return;
  try {
    const [waiting, active, mine_] = await Promise.all([
      api.listGames(),
      api.listGames('active'),
      api.myGames(),
    ]);
    lobbyGames = waiting || [];
    lobbyActive = active || [];
    myGames = (mine_ || []).filter(g => g.status !== 'finished').slice(0, 20);
    if (!onlineGame) renderRightSidebar();
  } catch { /* not logged in or network error */ }
}

function startLobbyPolling(): void {
  refreshLobby();
  lobbyTimer = window.setInterval(refreshLobby, 10000);
}

/* ── Momentum / inertia ── */

let velocity = 0;
let rafId: number | null = null;

function stopMomentum(): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  velocity = 0;
}

function startMomentum(): void {
  const FRICTION = 0.95;
  const MIN_VELOCITY = 0.5;
  function tick() {
    velocity *= FRICTION;
    if (Math.abs(velocity) < MIN_VELOCITY) { velocity = 0; rafId = null; return; }
    scrollY += velocity;
    applyScroll();
    rafId = requestAnimationFrame(tick);
  }
  if (Math.abs(velocity) >= MIN_VELOCITY) rafId = requestAnimationFrame(tick);
}

function smoothScrollBy(delta: number): void {
  stopMomentum();
  const start = scrollY;
  const startTime = performance.now();
  const duration = 150;
  function tick(now: number) {
    const t = Math.min((now - startTime) / duration, 1);
    scrollY = start + delta * (t * (2 - t));
    applyScroll();
    if (t < 1) rafId = requestAnimationFrame(tick); else rafId = null;
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
  if (e.key === 'ArrowUp') { e.preventDefault(); smoothScrollBy(-SQUARE_SIZE * dir()); }
  if (e.key === 'ArrowDown') { e.preventDefault(); smoothScrollBy(SQUARE_SIZE * dir()); }
});

/* ── Input: touch ── */

const DRAG_THRESHOLD = 8;
let wasDragging = false;
let dragState: { pointerId: number; startY: number; lastY: number; lastTime: number; velocity: number; isDragging: boolean } | null = null;

app.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  stopMomentum(); wasDragging = false;
  dragState = { pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, lastTime: performance.now(), velocity: 0, isDragging: false };
  app.setPointerCapture(e.pointerId);
});

app.addEventListener('pointermove', (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const y = e.clientY; const now = performance.now();
  if (!dragState.isDragging) { if (Math.abs(y - dragState.startY) > DRAG_THRESHOLD) dragState.isDragging = true; else return; }
  e.preventDefault();
  const dy = (dragState.lastY - y) * dir(); const dt = now - dragState.lastTime;
  if (dt > 0) dragState.velocity = dragState.velocity * 0.4 + (dy / dt * 16) * 0.6;
  scrollY += dy; dragState.lastY = y; dragState.lastTime = now;
  applyScroll();
});

function onPointerRelease(e: PointerEvent): void {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  if (dragState.isDragging) { wasDragging = true; velocity = (performance.now() - dragState.lastTime) > 100 ? 0 : dragState.velocity; startMomentum(); }
  dragState = null;
}

app.addEventListener('pointerup', onPointerRelease);
app.addEventListener('pointercancel', onPointerRelease);
app.addEventListener('click', (e) => { if (wasDragging) { e.stopPropagation(); wasDragging = false; } }, { capture: true });

/* ── Resize ── */

window.addEventListener('resize', () => {
  const logicalRow = scrollY / SQUARE_SIZE;
  ({ sq: SQUARE_SIZE, rows: VISIBLE_ROWS } = computeLayout());
  scrollY = logicalRow * SQUARE_SIZE;
  applyLayout(); lastRenderedTopRow = null; applyScroll();
});

/* ── Explore buttons ── */

document.getElementById('btn-reset')!.addEventListener('click', () => { exploreState.reset(); scrollY = -2 * SQUARE_SIZE; stopMomentum(); fullUpdate(); app.focus(); });
document.getElementById('btn-rotate')!.addEventListener('click', () => { flipped = !flipped; fullUpdate(); app.focus(); });
document.getElementById('btn-export')!.addEventListener('click', () => { navigator.clipboard.writeText(activeState().exportMoves()).then(() => { const b = document.getElementById('btn-export')!; b.textContent = '\u2713'; setTimeout(() => { b.textContent = '\u2197'; }, 1500); }); app.focus(); });
document.getElementById('btn-import')!.addEventListener('click', () => { const input = prompt('Paste moves:'); if (!input?.trim()) return; const r = exploreState.importMoves(input); scrollY = -2 * SQUARE_SIZE; stopMomentum(); fullUpdate(); if (!r.success) alert(`Invalid move: ${r.error}`); app.focus(); });

// Sidebar toggle (mobile)
const sidebar = document.getElementById('sidebar')!;
document.getElementById('btn-sidebar-open')!.addEventListener('click', () => { sidebar.classList.add('open'); document.getElementById('btn-sidebar-open')!.classList.add('hidden'); });
document.getElementById('btn-sidebar-close')!.addEventListener('click', () => { sidebar.classList.remove('open'); document.getElementById('btn-sidebar-open')!.classList.remove('hidden'); });

/* ── Hash routing ── */

window.addEventListener('hashchange', () => {
  const gameId = getGameIdFromHash();
  if (gameId) enterGame(gameId);
  else if (onlineGame) leaveGame();
});

/* ── Helpers ── */

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── Init ── */

(async () => {
  currentUser = await api.me();
  fullUpdate();
  startLobbyPolling();
  const gameId = getGameIdFromHash();
  if (gameId) enterGame(gameId);
})();

app.focus();
