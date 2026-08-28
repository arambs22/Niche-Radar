import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { ApiError, api, formatApiError } from "../lib/api";
import { HeroWordmark } from "../components/HeroWordmark";
import { LanguageToggle } from "../components/LanguageToggle";
import { GridBackground } from "../components/GridBackground";

/** Requests a password-reset email. Always shows the same success message, whether or not the email is registered. */
export function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/request-password-reset", { email });
      setSent(true);
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
      <div className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.forgotPassword.title}</h2>
        {error && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-sm text-primary">{error}</p>}
        {sent ? (
          <p className="rounded border border-border bg-bg p-2 text-sm text-text">{t.auth.forgotPassword.success}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="email">{t.auth.forgotPassword.email}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? t.auth.forgotPassword.submitting : t.auth.forgotPassword.submit}
            </button>
          </form>
        )}
        <p className="text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary underline">{t.auth.forgotPassword.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
}
