import * as fs from "fs";
import type { EditorMessageRequest } from "../runtime/tool-context.js";
import {
  resolveAssetPath,
  toErrorMessage,
  type FileOperationResult,
  type SearchMatch,
} from "./operate-scripts-and-text-support.js";

export async function searchFile(
  request: EditorMessageRequest,
  options: {
    urlOrUuid: string;
    pattern: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
    contextLines?: number;
    maxResults?: number;
  }
): Promise<FileOperationResult> {
  try {
    const resolved = await resolveAssetPath(request, options.urlOrUuid);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }
    if (!resolved.filePath) {
      return { success: false, error: `Asset does not exist: ${options.urlOrUuid}` };
    }

    const content = fs.readFileSync(resolved.filePath, "utf8");
    const lines = content.split("\n");
    const searchPattern = createSearchPattern(options);
    const matches = shouldUseMultilineSearch(options)
      ? collectMultilineMatches({ content, lines, searchPattern, options })
      : collectSingleLineMatches({ lines, searchPattern, options });
    return {
      success: true,
      data: {
        matches,
        totalMatches: matches.length,
        assetUrl: resolved.url,
      },
    };
  } catch (error) {
    return { success: false, error: `Error searching file: ${toErrorMessage(error)}` };
  }
}

function createSearchPattern(options: {
  pattern: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}): RegExp {
  const flags = options.caseSensitive ? "gs" : "gis";
  if (options.regex) {
    return new RegExp(options.pattern, flags);
  }

  let escapedPattern = options.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (options.wholeWord) {
    escapedPattern = `\\b${escapedPattern}\\b`;
  }
  return new RegExp(escapedPattern, flags);
}

function shouldUseMultilineSearch(options: {
  pattern: string;
  regex?: boolean;
}): boolean {
  return options.pattern.includes("\n") || Boolean(options.regex && hasExplicitMultilinePattern(options.pattern));
}

function hasExplicitMultilinePattern(pattern: string): boolean {
  return pattern.includes("\\s") || pattern.includes("[\\s\\S]");
}

function collectMultilineMatches(params: {
  content: string;
  lines: string[];
  searchPattern: RegExp;
  options: {
    contextLines?: number;
    maxResults?: number;
  };
}): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const maxResults = params.options.maxResults ?? Infinity;
  let match: RegExpExecArray | null = null;
  while ((match = params.searchPattern.exec(params.content)) !== null && matches.length < maxResults) {
    matches.push(buildMultilineMatch(match, params.content, params.lines, params.options.contextLines ?? 0));
    if (match.index === params.searchPattern.lastIndex) {
      params.searchPattern.lastIndex += 1;
    }
  }
  return matches;
}

function buildMultilineMatch(
  match: RegExpExecArray,
  content: string,
  lines: string[],
  contextLines: number
): SearchMatch {
  const lineNumber = content.slice(0, match.index).split("\n").length;
  const matchedText = match[0];
  const matchStartLine = lineNumber - 1;
  const matchEndLine = matchStartLine + matchedText.split("\n").length - 1;
  return {
    line: lineNumber,
    content: matchedText,
    startColumn: 0,
    endColumn: matchedText.split("\n").at(-1)?.length ?? 0,
    context: buildMatchContext(lines, matchStartLine, matchEndLine, contextLines),
  };
}

function collectSingleLineMatches(params: {
  lines: string[];
  searchPattern: RegExp;
  options: {
    contextLines?: number;
    maxResults?: number;
  };
}): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const maxResults = params.options.maxResults ?? Infinity;
  params.lines.forEach((line, index) => {
    if (matches.length >= maxResults) {
      return;
    }
    const lineRegex = new RegExp(params.searchPattern.source, params.searchPattern.flags);
    let match: RegExpExecArray | null = null;
    while ((match = lineRegex.exec(line)) !== null && matches.length < maxResults) {
      matches.push(buildSingleLineMatch(match, line, index, params.lines, params.options.contextLines ?? 0));
      if (match.index === lineRegex.lastIndex) {
        lineRegex.lastIndex += 1;
      }
    }
  });
  return matches;
}

function buildSingleLineMatch(
  match: RegExpExecArray,
  line: string,
  index: number,
  lines: string[],
  contextLines: number
): SearchMatch {
  return {
    line: index + 1,
    content: line,
    startColumn: match.index,
    endColumn: match.index + match[0].length,
    context: buildMatchContext(lines, index, index, contextLines),
  };
}

function buildMatchContext(
  lines: string[],
  startLine: number,
  endLine: number,
  contextLines: number
): { before: string[]; after: string[] } | undefined {
  if (contextLines <= 0) {
    return undefined;
  }
  return {
    before: lines.slice(Math.max(0, startLine - contextLines), startLine),
    after: lines.slice(endLine + 1, Math.min(lines.length, endLine + 1 + contextLines)),
  };
}
