import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Renders nested routes only for a logged-in user; otherwise redirects to /login. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-6 text-slate-500">Cargando...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
