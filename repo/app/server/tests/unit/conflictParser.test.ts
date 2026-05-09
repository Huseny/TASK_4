import { parseConflictDiff, parseAllConflicts } from '../../src/pipeline/git/conflictParser';

describe('conflictParser', () => {
  it('parses a single-hunk diff', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -3,4 +3,0 @@
-line A
-line B
`;
    const result = parseConflictDiff(diff, 'file.ts');
    expect(result.filePath).toBe('file.ts');
    expect(result.lineNumbers).toHaveLength(1);
    expect(result.lineNumbers[0]).toEqual({ start: 3, end: 3 });
    expect(result.rawDiff).toBe(diff);
  });

  it('parses a multi-hunk diff', () => {
    const diff = `@@ -1,3 +1,2 @@
-a
 b
@@ -10,5 +9,4 @@
-x
 y
`;
    const result = parseConflictDiff(diff, 'multi.ts');
    expect(result.lineNumbers).toHaveLength(2);
    expect(result.lineNumbers[0]).toEqual({ start: 1, end: 2 });
    expect(result.lineNumbers[1]).toEqual({ start: 9, end: 12 });
  });

  it('handles insertion hunk (count=0)', () => {
    const diff = `@@ -5,0 +5 @@
+new line
`;
    const result = parseConflictDiff(diff, 'ins.ts');
    expect(result.lineNumbers[0]).toEqual({ start: 5, end: 5 });
  });

  it('returns empty lineNumbers for diff with no hunks', () => {
    const result = parseConflictDiff('no hunks here\n', 'empty.ts');
    expect(result.lineNumbers).toHaveLength(0);
  });

  it('parseAllConflicts maps files with diffs and skips missing ones', () => {
    const diffsByFile = new Map([['a.ts', '@@ -1,2 +1,1 @@\n-x\n']]);
    const results = parseAllConflicts(['a.ts', 'b.ts'], diffsByFile);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('a.ts');
  });
});
