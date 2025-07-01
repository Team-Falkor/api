type SkipEntry = string | RegExp;

// Cache for compiled regex patterns to avoid recompilation
const regexCache = new Map<string, RegExp>();

export const skipMatcher = (entry: SkipEntry) => {
	if (entry instanceof RegExp) {
		return (path: string) => entry.test(path);
	}

	const pattern = entry as string;
	// Fast path for exact matches
	if (!pattern.includes("*")) {
		return (path: string) => path === pattern;
	}

	// Check cache first
	let regex = regexCache.get(pattern);
	if (!regex) {
		const escaped = pattern
			.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&")
			.replace(/\\\*/g, "*");
		regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
		regexCache.set(pattern, regex);
	}
	return (path: string) => regex.test(path);
};

export function buildSkipMatcher(
	skipPaths: SkipEntry[] = [],
): (path: string) => boolean {
	// Early return for empty skip paths
	if (skipPaths.length === 0) {
		return () => false;
	}

	// Separate exact matches from pattern matches for optimization
	const exactMatches = new Set<string>();
	const patternTests: ((path: string) => boolean)[] = [];

	for (const entry of skipPaths) {
		if (typeof entry === "string" && !entry.includes("*")) {
			exactMatches.add(entry);
		} else {
			patternTests.push(skipMatcher(entry));
		}
	}

	return (path: string) => {
		// Check exact matches first (O(1) lookup)
		if (exactMatches.has(path)) {
			return true;
		}
		// Then check pattern matches
		return patternTests.some((fn) => fn(path));
	};
}
