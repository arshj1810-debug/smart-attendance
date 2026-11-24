import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HOME } from '../config/nav';
export default function ProtectedRoute({ role }) {
  const { user } = useAuth(); const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (role && user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
