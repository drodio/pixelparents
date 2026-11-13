// Pure, client-safe interest taxonomy: display categories (for grouping the
// picker) and "themes" (for treating differently-worded interests as related,
// e.g. "Biking" and "Cycling", or "Harry Potter" and "Percy Jackson").
//
// Keyword rules match lib/interest-icons.ts so an interest's icon and its
// category agree:
//  - a keyword containing a space matches as a substring of the whole phrase
//  - a keyword of length <= 3 must equal a whole word ("ai", "art")
//  - a longer keyword matches a word that STARTS with it ("bik" → "biking")
//
// Themes are deliberately narrow. A theme is "these interests are the same kind
// of thing", not "these share a category": Reading and Chess share nothing even
// though both are indoor hobbies. Relatedness is a SUGGESTION signal only: it
// never merges stored interests and never changes the shared-interest count.

type Rule = { id: string; label: string; keywords: string[] };

export const INTEREST_CATEGORIES: Rule[] = [
  { id: "books", label: "Books & writing", keywords: ["reading", "book", "novel", "literature", "manga", "comic", "calvin", "poetry", "writing", "writer", "harry potter", "percy jackson", "lord of the rings", "name of the wind", "library"] },
  { id: "music", label: "Music, theater & dance", keywords: ["music", "musical", "singing", "sing", "choir", "band", "guitar", "piano", "violin", "drum", "kpop", "k-pop", "theater", "theatre", "drama", "acting", "broadway", "dance", "dancing", "ballet"] },
  { id: "art", label: "Art, film & design", keywords: ["art", "arts", "painting", "drawing", "sketch", "design", "photo", "photography", "film", "movie", "cinema", "anime", "animation", "filmmak"] },
  { id: "tech", label: "Tech & coding", keywords: ["coding", "code", "programming", "software", "vibe cod", "claude code", "computer", "robot", "robotics", "ai", "ml", "machine learning", "3d print", "electronics", "arduino", "hackathon", "web dev", "app dev"] },
  { id: "science", label: "Science & math", keywords: ["math", "science", "physics", "chemistry", "biology", "astronomy", "space", "aerospace", "rocket", "engineering", "how machines work", "stem", "medicine", "neuroscience"] },
  { id: "outdoors", label: "Outdoors & nature", keywords: ["hiking", "hike", "camping", "camp", "backpacking", "climbing", "mountaineer", "nature", "gardening", "garden", "fishing", "kayak", "trail", "outdoors"] },
  { id: "sports", label: "Sports & fitness", keywords: ["biking", "bike", "cycling", "swimming", "swim", "running", "soccer", "basketball", "tennis", "golf", "skating", "skate", "skiing", "snowboard", "surfing", "kite", "powerlifting", "working out", "workout", "gym", "fitness", "healthy lifestyle", "yoga", "martial", "volleyball", "baseball", "football", "sports"] },
  { id: "food", label: "Food & cooking", keywords: ["food", "cooking", "cook", "baking", "bake", "chef", "restaurant", "coffee", "tea", "boba"] },
  { id: "games", label: "Games & puzzles", keywords: ["chess", "gaming", "video game", "board game", "puzzle", "minecraft", "roblox", "dungeons"] },
  { id: "making", label: "Making & building", keywords: ["lego", "legos", "woodworking", "crafts", "crafting", "knitting", "sewing", "cars", "car", "automotive", "racing", "maker"] },
  { id: "business", label: "Business & money", keywords: ["finance", "investing", "stocks", "economics", "entrepreneur", "startup", "business", "marketing"] },
  { id: "world", label: "Culture, travel & learning", keywords: ["culture", "travel", "language", "languages", "history", "politics", "geography", "education", "roller coaster", "theme park", "adventure"] },
  { id: "animals", label: "Animals", keywords: ["dog", "dogs", "cat", "cats", "horse", "horses", "bird", "birds", "animal", "animals", "pets"] },
  { id: "community", label: "Community & service", keywords: ["volunteer", "volunteering", "community", "charity", "nonprofit", "service"] },
];

export const OTHER_CATEGORY = { id: "other", label: "Other interests" } as const;

const THEMES: Rule[] = [
  { id: "fantasy", label: "fantasy", keywords: ["fantasy", "harry potter", "percy jackson", "lord of the rings", "hobbit", "tolkien", "narnia", "name of the wind", "wings of fire", "dragon", "wizard", "mythology", "dungeons"] },
  { id: "scifi", label: "sci-fi", keywords: ["sci-fi", "scifi", "science fiction", "star wars", "star trek", "dune", "dystopian", "hunger games"] },
  { id: "reading", label: "reading", keywords: ["reading", "book", "books", "novel", "literature", "library"] },
  { id: "comics", label: "comics", keywords: ["comic", "manga", "calvin", "graphic novel"] },
  { id: "cycling", label: "cycling", keywords: ["bike", "biking", "bikes", "cycling", "cycle", "bicycl", "bmx"] },
  { id: "hiking", label: "hiking & camping", keywords: ["hiking", "hike", "backpacking", "trekking", "trail", "camping", "camp", "mountaineer", "climbing", "outdoors"] },
  { id: "water", label: "water sports", keywords: ["swimming", "swim", "surfing", "surf", "kite", "sailing", "kayak", "rowing", "diving", "water polo"] },
  { id: "skating", label: "skating & snow", keywords: ["skating", "skate", "skiing", "ski", "snowboard", "hockey"] },
  { id: "fitness", label: "fitness", keywords: ["workout", "working out", "gym", "fitness", "powerlifting", "weightlift", "crossfit", "healthy lifestyle", "strength"] },
  { id: "running", label: "running", keywords: ["running", "marathon", "cross country", "track and field"] },
  { id: "coding", label: "coding", keywords: ["coding", "code", "programming", "software", "developer", "vibe cod", "claude code", "computer science", "web dev", "app dev", "hackathon"] },
  { id: "ai", label: "AI", keywords: ["ai", "machine learning", "artificial intelligence", "learning ai", "chatgpt", "llm", "neural"] },
  { id: "making", label: "making & engineering", keywords: ["3d print", "lego", "legos", "robot", "robotics", "arduino", "electronics", "maker", "woodworking", "how machines work", "engineering"] },
  { id: "space", label: "space", keywords: ["space", "aerospace", "astronomy", "rocket", "rockets", "nasa", "telescope"] },
  { id: "music", label: "music", keywords: ["music", "song", "band", "guitar", "piano", "violin", "drum", "kpop", "k-pop", "singing", "sing", "choir"] },
  { id: "stage", label: "theater & musicals", keywords: ["musical", "broadway", "theater", "theatre", "acting", "drama"] },
  { id: "dance", label: "dance", keywords: ["dance", "dancing", "ballet", "hip hop", "choreo"] },
  { id: "art", label: "art", keywords: ["art", "arts", "painting", "drawing", "sketch", "illustrat"] },
  { id: "film", label: "film", keywords: ["movie", "movies", "film", "cinema", "anime", "animation"] },
  { id: "food", label: "food & cooking", keywords: ["cooking", "cook", "baking", "bake", "chef", "food", "recipe", "cuisine", "restaurant"] },
  { id: "cars", label: "cars", keywords: ["cars", "car", "automotive", "racing", "motorsport", "karting"] },
  { id: "finance", label: "finance & investing", keywords: ["finance", "investing", "stocks", "economics", "trading"] },
  { id: "startups", label: "startups", keywords: ["entrepreneur", "startup", "startups", "business", "founder"] },
  { id: "games", label: "games", keywords: ["gaming", "video game", "minecraft", "roblox", "chess", "board game", "puzzle"] },
  { id: "math", label: "math", keywords: ["math", "calculus", "algebra", "statistics"] },
  { id: "thrills", label: "thrill rides", keywords: ["roller coaster", "theme park", "amusement park"] },
];

function wordsOf(lower: string): string[] {
  return lower.split(/[^a-z0-9+#-]+/).filter(Boolean);
}

function matches(name: string, keywords: string[], opts: { partialWords?: boolean } = {}): boolean {
  const lower = name.toLowerCase();
  const words = wordsOf(lower);
  for (const k of keywords) {
    if (k.includes(" ")) {
      if (lower.includes(k)) return true;
      // While typing, "vibe co" should already reach "vibe cod".
      if (opts.partialWords && lower.length >= 4 && k.startsWith(lower.trim())) return true;
    } else if (k.length <= 3) {
      if (words.includes(k)) return true;
    } else if (words.some((w) => w.startsWith(k) || (opts.partialWords && w.length >= 4 && k.startsWith(w)))) {
      return true;
    }
  }
  return false;
}

export function categoryForInterest(name: string): { id: string; label: string } {
  for (const c of INTEREST_CATEGORIES) if (matches(name, c.keywords)) return { id: c.id, label: c.label };
  return OTHER_CATEGORY;
}

// Group interests by category, in category order, "Other interests" last.
// Within a group the input order is preserved.
export function groupInterests(names: string[]): { id: string; label: string; items: string[] }[] {
  const groups = new Map<string, { id: string; label: string; items: string[] }>();
  for (const n of names) {
    const c = categoryForInterest(n);
    let g = groups.get(c.id);
    if (!g) {
      g = { id: c.id, label: c.label, items: [] };
      groups.set(c.id, g);
    }
    g.items.push(n);
  }
  const order = [...INTEREST_CATEGORIES.map((c) => c.id), OTHER_CATEGORY.id];
  return order.map((id) => groups.get(id)).filter((g): g is NonNullable<typeof g> => Boolean(g));
}

export function themesForInterest(name: string, opts: { partialWords?: boolean } = {}): Set<string> {
  const out = new Set<string>();
  for (const t of THEMES) if (matches(name, t.keywords, opts)) out.add(t.id);
  return out;
}

export function themeLabel(id: string): string {
  return THEMES.find((t) => t.id === id)?.label ?? id;
}

// The first theme two interests share, or null. Same-key interests are not
// "related", they are the same interest.
export function sharedTheme(a: string, b: string): string | null {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return null;
  const ta = themesForInterest(a);
  if (ta.size === 0) return null;
  for (const t of themesForInterest(b)) if (ta.has(t)) return t;
  return null;
}

// Suggestions related to what someone is typing, beyond plain substring
// matches: same theme ("cycling" → "Biking") or a shared word stem
// ("bike" → "Biking"). `exclude` holds suggestions already shown as direct
// matches. Partial words count once they are 4+ letters ("cycl").
export function relatedSuggestions(query: string, suggestions: string[], exclude: Set<string>): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const qThemes = themesForInterest(q, { partialWords: true });
  const stems = wordsOf(q)
    .map((w) => w.replace(/(ing|ers|er|ed|es|s|e)$/, ""))
    .filter((w) => w.length >= 3);
  const out: string[] = [];
  for (const s of suggestions) {
    if (exclude.has(s)) continue;
    const sl = s.toLowerCase();
    const byTheme = qThemes.size > 0 && [...themesForInterest(s)].some((t) => qThemes.has(t));
    const byStem = stems.some((st) => wordsOf(sl).some((w) => w.startsWith(st)));
    if (byTheme || byStem) out.push(s);
  }
  return out;
}
