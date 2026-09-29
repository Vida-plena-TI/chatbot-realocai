import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import s from './LoginPage.module.css';
import u from '../components/ui/ui.module.css';
import { useAuth } from '../auth/AuthContext';
import { USING_MOCK } from '../api/client';
import { MOCK_PASSWORD, MOCK_USER } from '../api/mock/fixtures';
import { Button } from '../components/ui/Button';
import { FullscreenSpinner } from '../components/ui/Spinner';

function loginErrorCopy(e) {
  if (e?.status === 401) return 'E-mail ou senha incorretos.';
  if (e?.status === 0) return 'Sem conexão com o servidor.';
  return 'Não foi possível entrar. Tente novamente.';
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (status === 'loading') return <FullscreenSpinner />;
  if (status === 'authed') return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(loginErrorCopy(err));
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <img className={s.logo} src="/vida-plena-simbolo.png" alt="Vida Plena" />
        <h1 className={s.title}>
          Entrar no realoc<span>AI</span>
        </h1>
        <p className={s.sub}>Acesso restrito à equipe da clínica.</p>

        <form className={u.form} onSubmit={submit} noValidate>
          <label className={u.field}>
            <span className={u.label}>E-mail</span>
            <input
              className={u.input}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={u.field}>
            <span className={u.label}>Senha</span>
            <input
              className={u.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" block className={s.submit} disabled={loading || !email.trim() || !password}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        {USING_MOCK && (
          <div className={s.hint}>
            Modo demonstração. Use <code>{MOCK_USER.email}</code> e a senha <code>{MOCK_PASSWORD}</code>.
          </div>
        )}
      </div>
    </div>
  );
}
