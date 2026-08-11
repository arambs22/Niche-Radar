import type { RelatedQuery } from "../lib/types";

interface RelatedQueriesListProps {
  rising: RelatedQuery[];
}

/** Lists a keyword's rising related search queries with their growth value. */
export function RelatedQueriesList({ rising }: RelatedQueriesListProps) {
  if (rising.length === 0) {
    return <p className="text-sm text-slate-500">Sin related queries en alza todavía.</p>;
  }

  return (
    <ul className="space-y-1">
      {rising.map((item) => (
        <li key={item.query} className="flex justify-between text-sm">
          <span className="text-slate-700">{item.query}</span>
          <span className="font-medium text-emerald-600">{item.growthValue}</span>
        </li>
      ))}
    </ul>
  );
}
