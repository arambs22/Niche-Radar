import { useAuth } from "../context/AuthContext";

/** Top bar for authenticated pages: shows the logged-in email and a logout button. */
export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <span className="font-semibold text-slate-800">NicheRadar</span>
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span>{user?.email}</span>
        <button
          onClick={() => logout()}
          className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
