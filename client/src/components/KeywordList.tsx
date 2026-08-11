import { api } from "../lib/api";
import type { Keyword } from "../lib/types";

interface KeywordListProps {
  keywords: Keyword[];
  onDeleted: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Lists the user's tracked keywords; click to select, or delete individually. */
export function KeywordList({ keywords, onDeleted, selectedId, onSelect }: KeywordListProps) {
  async function handleDelete(id: number) {
    await api.delete(`/keywords/${id}`);
    onDeleted();
  }

  if (keywords.length === 0) {
    return <p className="text-sm text-slate-500">Todavía no trackeas ninguna keyword.</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-lg bg-white shadow">
      {keywords.map((keyword) => (
        <li
          key={keyword.id}
          onClick={() => onSelect(keyword.id)}
          className={`flex cursor-pointer items-center justify-between px-4 py-3 ${
            selectedId === keyword.id ? "bg-slate-50" : ""
          }`}
        >
          <div>
            <p className="text-sm font-medium text-slate-800">{keyword.term}</p>
            <p className="text-xs text-slate-500">{keyword.category}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(keyword.id);
            }}
            className="text-xs text-red-500 hover:underline"
          >
            Borrar
          </button>
        </li>
      ))}
    </ul>
  );
}
