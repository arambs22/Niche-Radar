import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { ApiError, formatApiError } from "../lib/api";
import { HeroWordmark } from "../components/HeroWordmark";
import { LanguageToggle } from "../components/LanguageToggle";
import { GridBackground } from "../components/GridBackground";

/** Email/password login form; on success redirects to /dashboard. */
export function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
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
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : t.auth.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-bg px-4 py-12">
      <GridBackground />
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="relative">
        <HeroWordmark />
      </div>
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.login.title}</h2>
        {error && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-sm text-primary">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="email">{t.auth.login.email}</label>
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
          <label className="block text-sm font-medium text-text" htmlFor="password">{t.auth.login.password}</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? t.auth.login.submitting : t.auth.login.submit}
        </button>
        <p className="text-center text-sm text-text-muted">
          {t.auth.login.noAccount} <Link to="/register" className="text-primary underline">{t.auth.login.registerLink}</Link>
        </p>
      </form>
    </div>
  );
}
