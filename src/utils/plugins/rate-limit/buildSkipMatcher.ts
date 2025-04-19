type SkipEntry = string | RegExp;

export function buildSkipMatcher(
  skipPaths: SkipEntry[] = []
): (path: string) => boolean {
  const tests = skipPaths.map((entry) => {
    if (entry instanceof RegExp) {
      return (path: string) => entry.test(path);
    }

    const pattern = entry as string;
    if (!pattern.includes("*")) {
      return (path: string) => path === pattern;
    }

    const escaped = pattern
      .replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&")
      .replace(/\\\*/g, "*");
    const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return (path: string) => regex.test(path);
  });

  return (path: string) => tests.some((fn) => fn(path));
}
