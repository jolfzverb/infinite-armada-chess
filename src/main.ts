import { GameState } from './game';
import { render } from './render';

const SQUARE_SIZE = 72;
const VISIBLE_ROWS = Math.floor(window.innerHeight / SQUARE_SIZE);

const state = new GameState();
let topRow = -2; // initial view: original board (0–7) near the top

const app = document.getElementById('app')!;
app.style.height = `${VISIBLE_ROWS * SQUARE_SIZE}px`;
app.tabIndex = 0;

function update(): void {
  render(state, topRow, VISIBLE_ROWS, app, (row, col) => {
    state.click(row, col);
    update();
  });
}

const SCROLL_ROWS = 2;

app.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY !== 0) {
    topRow += Math.sign(e.deltaY) * SCROLL_ROWS;
    update();
  }
}, { passive: false });

app.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp')   { e.preventDefault(); topRow--; update(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); topRow++; update(); }
});

document.getElementById('btn-reset')!.addEventListener('click', () => {
  state.reset();
  topRow = -2;
  update();
  app.focus();
});

update();
app.focus();
