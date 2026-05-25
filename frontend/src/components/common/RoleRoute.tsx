import { Navigate } from 'react-router-dom'
import type { Role } from '@/types'
import { useAuth } from '@/store/AuthContext'

type RoleRouteProps = {
  roles: Role[];
  children: React.ReactNode;
};

export function defaultPathForRole(role: Role | undefined): string {
  if (role === 'super_admin') return '/admin/teams';
  return '/';
}

export default function RoleRoute({ roles, children }: RoleRouteProps) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={defaultPathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}
