export interface User {
  id: number;
  name: string;
  avatar_url?: string;
  provider: string;
}

export interface Game {
  id: number;
  white_id?: number;
  black_id?: number;
  status: 'waiting' | 'active' | 'finished';
  is_public: boolean;
  result?: string;
  time_control_sec?: number;
  increment_sec?: number;
  time_bonuses?: { move: number; bonus_sec: number }[];
  created_at: string;
}

export interface CreateGameParams {
  color: 'white' | 'black';
  is_public: boolean;
  time_control_sec?: number;
  increment_sec?: number;
  time_bonuses?: { move: number; bonus_sec: number }[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  me: (): Promise<User | null> => request<User>('GET', '/api/auth/me').catch(() => null),
  logout: () => request<void>('POST', '/api/auth/logout'),
  loginURL: (provider: string) => `/api/auth/${provider}`,
  createGame: (p: CreateGameParams) => request<Game>('POST', '/api/games', p),
  listGames: (status?: string) => request<Game[]>('GET', `/api/games${status ? `?status=${status}` : ''}`),
  getGame: (id: number) => request<Game>('GET', `/api/games/${id}`),
  joinGame: (id: number) => request<Game>('POST', `/api/games/${id}/join`),
  myGames: () => request<Game[]>('GET', '/api/games/mine'),
};
