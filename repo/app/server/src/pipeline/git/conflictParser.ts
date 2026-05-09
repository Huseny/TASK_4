export interface LineRange {
  start: number;
  end: number;
}

export interface ConflictFile {
  filePath: string;
  lineNumbers: LineRange[];
  rawDiff: string;
}

/**
 * Parse a unified-diff string (from `git diff --unified=0`) for a single
 * conflicted file into structured hunk line ranges.
 *
 * Hunk header format: @@ -a,b +c,d @@ ...
 *   c = start line in new file (1-based)
 *   d = number of lines (0 means insertion point, treated as 1 line)
 */
export function parseConflictDiff(rawDiff: string, filePath: string): ConflictFile {
  const lines = rawDiff.split('\n');
  const lineNumbers: LineRange[] = [];

  for (const line of lines) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      const start = parseInt(match[1], 10);
      const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      const end = count === 0 ? start : start + count - 1;
      lineNumbers.push({ start, end });
    }
  }

  return { filePath, lineNumbers, rawDiff };
}

export function parseAllConflicts(conflictedFiles: string[], diffsByFile: Map<string, string>): ConflictFile[] {
  return conflictedFiles
    .filter((f) => diffsByFile.has(f))
    .map((f) => parseConflictDiff(diffsByFile.get(f)!, f));
}
