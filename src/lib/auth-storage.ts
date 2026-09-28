import type { AuthSession } from './types';

const TOKEN_KEY = 'sg_auth_token';
const USER_KEY = 'sg_auth_user';

let memToken = '';
let memUser: { email: string; role: 'admin' | 'tablet'; exp: number } | null = null;

function canUseStorage(type: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window[type];
    const testKey = '__sg_test__';
    s.setItem(testKey, '1');
    s.removeItem(testKey);
    return s;
  } catch {
    return null;
  }
}

const local = canUseStorage('localStorage');
const session = canUseStorage('sessionStorage');

export const authStorage = {
  getToken(): string {
    if (local) {
      const t = local.getItem(TOKEN_KEY);
      if (t) return t;
    }
    if (session) {
      const t = session.getItem(TOKEN_KEY);
      if (t) return t;
    }
    return memToken;
  },

  setToken(token: string): void {
    memToken = token;
    if (local) {
      try {
        local.setItem(TOKEN_KEY, token);
      } catch {}
    }
    if (session) {
      try {
        session.setItem(TOKEN_KEY, token);
      } catch {}
    }
  },

  getUser(): { email: string; role: 'admin' | 'tablet'; exp: number } | null {
    if (memUser) return memUser;
    const raw = local?.getItem(USER_KEY) || session?.getItem(USER_KEY);
    if (!raw) return null;
    try {
      memUser = JSON.parse(raw);
      return memUser;
    } catch {
      return null;
    }
  },

  setUser(user: { email: string; role: 'admin' | 'tablet'; exp: number }): void {
    memUser = user;
    const raw = JSON.stringify(user);
    if (local) {
      try {
        local.setItem(USER_KEY, raw);
      } catch {}
    }
    if (session) {
      try {
        session.setItem(USER_KEY, raw);
      } catch {}
    }
  },

  saveSession(sessionData: AuthSession): void {
    this.setToken(sessionData.token);
    this.setUser({
      email: sessionData.email,
      role: sessionData.role,
      exp: sessionData.exp,
    });
  },

  clear(): void {
    memToken = '';
    memUser = null;
    try {
      local?.removeItem(TOKEN_KEY);
      local?.removeItem(USER_KEY);
      session?.removeItem(TOKEN_KEY);
      session?.removeItem(USER_KEY);
    } catch {}
  },
};
