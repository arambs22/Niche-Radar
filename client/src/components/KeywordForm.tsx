import { useState, type FormEvent } from "react";
import { api, ApiError, formatApiError } from "../lib/api";
import type { Keyword } from "../lib/types";

interface KeywordFormProps {
  onCreated: () => void;
}

/** Form to create a new tracked keyword; calls onCreated() after a successful POST. */
export function KeywordForm({ onCreated }: KeywordFormProps) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post<Keyword>("/keywords", {
        term,
        ...(category.trim() ? { category: category.trim() } : {}),
      });
      setTerm("");
      setCategory("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : "Algo salió mal, intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
      <div>
        <label className="block text-xs font-medium text-slate-700" htmlFor="term">Keyword</label>
        <input
          id="term"
          required
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="mt-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="tarot card clipart"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700" htmlFor="category">Categoría (opcional)</label>
        <input
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="tarot"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-slate-800 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Agregando..." : "Agregar"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
