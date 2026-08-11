import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, formatApiError } from "../lib/api";

/** Email/password registration form; on success redirects to /dashboard. */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : "Algo salió mal, intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-text">Crear cuenta</h1>
        {error && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-sm text-primary">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
          <p className="mt-1 text-xs text-text-muted">Mínimo 8 caracteres.</p>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? "Creando..." : "Crear cuenta"}
        </button>
        <p className="text-center text-sm text-text-muted">
          ¿Ya tienes cuenta? <Link to="/login" className="text-primary underline">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
