import type { ReactNode } from "react";
import { GridBackground } from "./GridBackground";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { HeroWordmark } from "./HeroWordmark";

interface AuthPageShellProps {
  children: ReactNode;
}

/** The shared outer layout (animated background, theme/language toggles, wordmark) used by every public auth page — login, register, forgot/reset password. Each page supplies its own card (a <form> or a plain <div>, depending on whether it needs to swap content conditionally) as children. */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-bg px-4 py-12">
      <GridBackground />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <div className="relative">
        <HeroWordmark />
      </div>
      {children}
    </div>
  );
}
