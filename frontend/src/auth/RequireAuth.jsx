import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { FullscreenSpinner } from '../components/ui/Spinner';

export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullscreenSpinner />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
