# CLAUDE.md

## Project

Infinite Armada Chess — browser-based chess variant inspired by XKCD #3020.
The board is infinite: rows beyond the standard 8x8 are filled with queen armadas.
No backend, no framework — vanilla TypeScript + HTML/CSS, bundled by Parcel.

Live: https://jolfzverb.github.io/infinite-armada-chess/

## Commands

```bash
npm run dev          # Dev server with hot reload (localhost:1234)
npm run build        # Production build → dist/
make serve           # Build + serve dist/ on :8080
```

Deploy: automatic via GitHub Actions on push to `main` → GitHub Pages.

## Architecture

```
src/
  types.ts    — Piece, Pos, Color, GameStatus, CastlingRights
  board.ts    — SparseBoard: sparse row storage, virtual queen rows outside [0,7]
  moves.ts    — Move generation/validation (pseudo-legal → legal filtering via check detection)
  game.ts     — GameState: selection, move execution, castling/en passant/promotion, algebraic notation import/export
  render.ts   — DOM rendering (Unicode chess symbols, no images)
  main.ts     — UI: event handling, momentum scrolling (wheel/touch/keyboard), responsive layout
  style.css   — Dark theme, Lichess-palette board, CSS variables for square sizing
  index.html  — Entry point
```

Key design: **SparseBoard** lazily materializes rows. Rows < 0 default to black queens, rows > 7 to white queens. Only rows touched by moves are allocated.

Coordinates: `(row, col)` — row 0 = top (black back rank), col 0 = left (a-file).
Colors: `'w'` / `'b'`. Piece types: `K Q R B N P`.

## Conventions

- TypeScript strict mode (no implicit any, no unused vars)
- 2-space indent, semicolons used
- camelCase functions/vars, PascalCase types/classes
- No frameworks, no external UI libs
- No tests (validation is manual + TS compiler)

## Build

Parcel 2.13 + TypeScript 5.8, target ES2020.
GitHub Actions deploy uses `--public-url ./` for relative asset paths.
