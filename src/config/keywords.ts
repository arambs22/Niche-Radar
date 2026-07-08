export interface KeywordConfig {
  term: string;
  category: string;
}

export const TRACKED_KEYWORDS: KeywordConfig[] = [
  // --- Clipart / PNG bundles ---
  { term: "cottagecore clipart", category: "clipart" },
  { term: "kawaii clipart", category: "clipart" },
  { term: "boho clipart", category: "clipart" },
  { term: "y2k clipart", category: "clipart" },
  { term: "dark academia clipart", category: "clipart" },
  { term: "coquette clipart", category: "clipart" },
  { term: "witchy clipart", category: "clipart" },
  { term: "clipart bundle png", category: "clipart" },

  // --- SVG files (Cricut/Silhouette) ---
  { term: "svg bundle", category: "svg" },
  { term: "cricut svg", category: "svg" },
  { term: "retro svg", category: "svg" },
  { term: "boho svg", category: "svg" },

  // --- Planners / printables ---
  { term: "digital planner", category: "planner" },
  { term: "budget planner printable", category: "planner" },
  { term: "journal printable", category: "planner" },
  { term: "goodnotes planner", category: "planner" },

  // --- Wedding / invitations ---
  { term: "wedding invitation template", category: "wedding" },
  { term: "editable invitation template", category: "wedding" },

  // --- Digital paper / patterns ---
  { term: "digital paper pack", category: "pattern" },
  { term: "seamless pattern bundle", category: "pattern" },

  // --- Fonts ---
  { term: "handwritten font", category: "fonts" },
  { term: "retro font bundle", category: "fonts" },

  // --- Social media templates ---
  { term: "canva template", category: "social" },
  { term: "instagram highlight covers", category: "social" },

  // --- Sublimation / print-on-demand ---
  { term: "sublimation design bundle", category: "sublimation" },

  // --- Embroidery ---
  { term: "embroidery design bundle", category: "embroidery" },

  // --- Wall art / printable art ---
  { term: "printable wall art", category: "wall-art" },
  { term: "botanical print set", category: "wall-art" },
];