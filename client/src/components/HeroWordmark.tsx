import { PulseDot } from "./PulseDot";

/** Large stacked "Niche" / "Radar" wordmark for the auth pages; the radar-pulse dot doubles as the dot of the "i" in "Niche". */
export function HeroWordmark() {
  return (
    <h1 className="mx-auto w-fit select-none font-display font-semibold leading-[0.85] tracking-wide text-text">
      <span className="block text-7xl">
        N
        <span className="relative inline-block">
          <span className="absolute left-1/2 top-[-0.55em] -translate-x-1/2">
            <PulseDot className="h-4 w-4" />
          </span>
          {/* Dotless "ı" (Turkish, U+0131) instead of "i" — a real serif glyph matching the rest
              of the word, but with no built-in dot to fight for position with PulseDot above. */}
          ı
        </span>
        che
      </span>
      <span className="ml-[0.35em] block text-7xl">Radar</span>
    </h1>
  );
}
