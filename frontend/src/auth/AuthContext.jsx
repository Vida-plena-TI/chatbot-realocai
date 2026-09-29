import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

// A sessão vive no cookie do Django. Nada é salvo em localStorage/sessionStorage:
// o usuário logado é descoberto com GET /api/auth/me/ ao carregar o app.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | anon

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anon');
    });
    let alive = true;
    api
      .me()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setStatus('authed');
        api.csrf().catch(() => {}); // garante o cookie csrftoken para POST/PATCH/DELETE
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setStatus('anon');
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    await api.csrf();
    const u = await api.login(email, password);
    setUser(u);
    setStatus('authed');
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus('anon');
    }
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
