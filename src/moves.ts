import type { SparseBoard } from './board';
import type { CastlingRights, Color, LastMove, Pos, GameStatus } from './types';

function opponent(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

function inBounds(col: number): boolean {
  return col >= 0 && col < 8;
}

// Slide along a direction until hitting a piece or column out of bounds.
// Rows are infinite but virtual rows are filled, so rays always terminate.
function slideRay(
  board: SparseBoard, from: Pos, dr: number, dc: number, color: Color,
): Pos[] {
  const moves: Pos[] = [];
  let r = from.row + dr;
  let c = from.col + dc;
  while (inBounds(c)) {
    const cell = board.getCell(r, c);
    if (cell === null) {
      moves.push({ row: r, col: c });
    } else {
      if (cell.color !== color) moves.push({ row: r, col: c }); // capture
      break;
    }
    r += dr;
    c += dc;
  }
  return moves;
}

export function getPseudoLegalMoves(
  board: SparseBoard, from: Pos, lastMove: LastMove | null, castlingRights: CastlingRights,
): Pos[] {
  const piece = board.getCell(from.row, from.col);
  if (!piece) return [];

  const { color, type } = piece;
  const moves: Pos[] = [];

  switch (type) {
    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;

      // Forward 1
      const f1 = from.row + dir;
      if (board.getCell(f1, from.col) === null) {
        moves.push({ row: f1, col: from.col });
        // Forward 2 from start
        if (from.row === startRow) {
          const f2 = from.row + dir * 2;
          if (board.getCell(f2, from.col) === null) {
            moves.push({ row: f2, col: from.col });
          }
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const nc = from.col + dc;
        if (!inBounds(nc)) continue;
        const target = board.getCell(f1, nc);
        if (target !== null && target.color !== color) {
          moves.push({ row: f1, col: nc });
        }
      }

      // En passant
      if (lastMove && lastMove.piece.type === 'P'
        && Math.abs(lastMove.to.row - lastMove.from.row) === 2
        && lastMove.to.row === from.row
        && Math.abs(lastMove.to.col - from.col) === 1) {
        moves.push({ row: from.row + dir, col: lastMove.to.col });
      }
      break;
    }

    case 'N': {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of offsets) {
        const nr = from.row + dr;
        const nc = from.col + dc;
        if (!inBounds(nc)) continue;
        const cell = board.getCell(nr, nc);
        if (cell === null || cell.color !== color) {
          moves.push({ row: nr, col: nc });
        }
      }
      break;
    }

    case 'B': {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        moves.push(...slideRay(board, from, dr, dc, color));
      }
      break;
    }

    case 'R': {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        moves.push(...slideRay(board, from, dr, dc, color));
      }
      break;
    }

    case 'Q': {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        moves.push(...slideRay(board, from, dr, dc, color));
      }
      break;
    }

    case 'K': {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = from.row + dr;
        const nc = from.col + dc;
        if (!inBounds(nc)) continue;
        const cell = board.getCell(nr, nc);
        if (cell === null || cell.color !== color) {
          moves.push({ row: nr, col: nc });
        }
      }

      // Castling
      const homeRow = color === 'w' ? 7 : 0;
      if (from.row === homeRow && from.col === 4) {
        const opp = opponent(color);
        // King-side
        const ksRight = color === 'w' ? castlingRights.wK : castlingRights.bK;
        if (ksRight
          && board.getCell(homeRow, 5) === null
          && board.getCell(homeRow, 6) === null
          && board.getCell(homeRow, 7)?.type === 'R'
          && board.getCell(homeRow, 7)?.color === color
          && !isSquareAttacked(board, homeRow, 4, opp)
          && !isSquareAttacked(board, homeRow, 5, opp)
          && !isSquareAttacked(board, homeRow, 6, opp)) {
          moves.push({ row: homeRow, col: 6 });
        }
        // Queen-side
        const qsRight = color === 'w' ? castlingRights.wQ : castlingRights.bQ;
        if (qsRight
          && board.getCell(homeRow, 3) === null
          && board.getCell(homeRow, 2) === null
          && board.getCell(homeRow, 1) === null
          && board.getCell(homeRow, 0)?.type === 'R'
          && board.getCell(homeRow, 0)?.color === color
          && !isSquareAttacked(board, homeRow, 4, opp)
          && !isSquareAttacked(board, homeRow, 3, opp)
          && !isSquareAttacked(board, homeRow, 2, opp)) {
          moves.push({ row: homeRow, col: 2 });
        }
      }
      break;
    }
  }

  return moves;
}

export function isSquareAttacked(board: SparseBoard, row: number, col: number, byColor: Color): boolean {
  // Knight attacks
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nc = col + dc;
    if (!inBounds(nc)) continue;
    const cell = board.getCell(row + dr, nc);
    if (cell && cell.color === byColor && cell.type === 'N') return true;
  }

  // Pawn attacks
  const pawnDir = byColor === 'w' ? 1 : -1; // pawns attack from this direction
  for (const dc of [-1, 1]) {
    const nc = col + dc;
    if (!inBounds(nc)) continue;
    const cell = board.getCell(row + pawnDir, nc);
    if (cell && cell.color === byColor && cell.type === 'P') return true;
  }

  // King attacks
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nc = col + dc;
    if (!inBounds(nc)) continue;
    const cell = board.getCell(row + dr, nc);
    if (cell && cell.color === byColor && cell.type === 'K') return true;
  }

  // Sliding attacks: rook/queen on straights, bishop/queen on diagonals
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row + dr, c = col + dc;
    while (inBounds(c)) {
      const cell = board.getCell(r, c);
      if (cell !== null) {
        if (cell.color === byColor && (cell.type === 'R' || cell.type === 'Q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = row + dr, c = col + dc;
    while (inBounds(c)) {
      const cell = board.getCell(r, c);
      if (cell !== null) {
        if (cell.color === byColor && (cell.type === 'B' || cell.type === 'Q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function findKing(board: SparseBoard, color: Color): Pos {
  for (let r = board.top; r <= board.bottom; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board.getCell(r, c);
      if (cell && cell.type === 'K' && cell.color === color) {
        return { row: r, col: c };
      }
    }
  }
  // Should never happen in a valid game
  throw new Error(`King not found for ${color}`);
}

export function isInCheck(board: SparseBoard, color: Color): boolean {
  const king = findKing(board, color);
  return isSquareAttacked(board, king.row, king.col, opponent(color));
}

// Simulate a move on a cloned board (handles en passant and castling rook)
function simulateMove(board: SparseBoard, from: Pos, to: Pos): SparseBoard {
  const clone = board.clone();
  const piece = clone.getCell(from.row, from.col)!;

  clone.setCell(to.row, to.col, piece);
  clone.setCell(from.row, from.col, null);

  // En passant capture
  if (piece.type === 'P' && to.col !== from.col && board.getCell(to.row, to.col) === null) {
    clone.setCell(from.row, to.col, null);
  }

  // Castling rook move
  if (piece.type === 'K' && Math.abs(to.col - from.col) === 2) {
    if (to.col === 6) {
      clone.setCell(from.row, 5, clone.getCell(from.row, 7));
      clone.setCell(from.row, 7, null);
    } else {
      clone.setCell(from.row, 3, clone.getCell(from.row, 0));
      clone.setCell(from.row, 0, null);
    }
  }

  return clone;
}

export function getLegalMoves(
  board: SparseBoard, from: Pos, lastMove: LastMove | null, castlingRights: CastlingRights,
): Pos[] {
  const piece = board.getCell(from.row, from.col);
  if (!piece) return [];

  const pseudo = getPseudoLegalMoves(board, from, lastMove, castlingRights);
  return pseudo.filter(to => {
    const after = simulateMove(board, from, to);
    return !isInCheck(after, piece.color);
  });
}

export function getGameStatus(
  board: SparseBoard, turn: Color, lastMove: LastMove | null, castlingRights: CastlingRights,
): GameStatus {
  // Check materialized pieces + frontier virtual rows
  const topFrontier = board.top - 1;
  const bottomFrontier = board.bottom + 1;

  for (let r = topFrontier; r <= bottomFrontier; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board.getCell(r, c);
      if (cell && cell.color === turn) {
        const legal = getLegalMoves(board, { row: r, col: c }, lastMove, castlingRights);
        if (legal.length > 0) {
          // Has at least one legal move
          return isInCheck(board, turn) ? 'check' : 'playing';
        }
      }
    }
  }

  // No legal moves found
  return isInCheck(board, turn) ? 'checkmate' : 'stalemate';
}
