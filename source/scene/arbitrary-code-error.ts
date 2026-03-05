const EVAL_POSITION_REGEX = /<anonymous>:(\d+):(\d+)/;
const USER_CODE_LINE_OFFSET = 3;
const CODE_CONTEXT_RADIUS = 2;

function tryExtractEvalPosition(stack?: string): { line: number; column: number } | null {
  if (!stack) {
    return null;
  }
  const match = stack.match(EVAL_POSITION_REGEX);
  if (!match) {
    return null;
  }
  const line = Number(match[1]);
  const column = Number(match[2]);
  if (!Number.isFinite(line) || !Number.isFinite(column)) {
    return null;
  }
  return { line, column };
}

function buildCodeExcerpt(code: string, userLine: number): string | null {
  const lines = code.split('\n');
  if (lines.length === 0) {
    return null;
  }
  const safeLine = Math.min(Math.max(1, userLine), lines.length);
  const startLine = Math.max(1, safeLine - CODE_CONTEXT_RADIUS);
  const endLine = Math.min(lines.length, safeLine + CODE_CONTEXT_RADIUS);
  const excerpt: string[] = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
    const marker = lineNumber === safeLine ? '>' : ' ';
    excerpt.push(`${marker}${String(lineNumber).padStart(4, ' ')} | ${lines[lineNumber - 1]}`);
  }
  return excerpt.join('\n');
}

export function enrichExecutionError(error: unknown, code: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const details: string[] = [message];
  const position = error instanceof Error ? tryExtractEvalPosition(error.stack) : null;
  if (position) {
    const totalLines = Math.max(1, code.split('\n').length);
    const userLine = Math.min(totalLines, Math.max(1, position.line - USER_CODE_LINE_OFFSET));
    details.push(`User code position: line ${userLine}, column ${position.column}`);
    const excerpt = buildCodeExcerpt(code, userLine);
    if (excerpt) {
      details.push(`Code excerpt:\n${excerpt}`);
    }
  }
  if (message.includes('getComponent: Type must be non-nil')) {
    details.push('Hint: node.getComponent(type) received undefined/null.');
    details.push("Use a valid component constructor or class name, for example cc.Sprite or 'PlayerController'.");
  }
  return new Error(details.join('\n'));
}
