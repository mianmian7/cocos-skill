import * as fs from "fs";
import type { ScriptsTextContext } from "./operate-scripts-and-text-support.js";
import {
  extractComponentNames,
  getNewComponentsOnly,
  isTypeScriptTarget,
  resolveAssetPath,
  toErrorMessage,
  validateTypeScriptContent,
  type FileOperationResult,
} from "./operate-scripts-and-text-support.js";

export async function replaceInFile(
  context: ScriptsTextContext,
  options: {
    urlOrUuid: string;
    searchText: string;
    replaceText: string;
    replaceAll?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
  }
): Promise<FileOperationResult> {
  try {
    const resolved = await resolveAssetPath(context.request, options.urlOrUuid);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }
    if (resolved.isReadOnly) {
      return { success: false, error: `Cannot modify read-only asset: ${resolved.url}` };
    }
    if (!resolved.filePath) {
      return { success: false, error: `Asset does not exist: ${options.urlOrUuid}` };
    }

    const validation = validateReplacementContent(options.urlOrUuid, options.replaceText);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const content = fs.readFileSync(resolved.filePath, "utf8");
    const replacement = buildReplacementResult(content, options);
    if (replacement.matchCount > 0) {
      fs.writeFileSync(resolved.filePath, replacement.newContent, "utf8");
    }

    const newComponents = isTypeScriptTarget(options.urlOrUuid)
      ? await getNewComponentsOnly(context.callSceneScript, extractComponentNames(options.replaceText))
      : [];
    return {
      success: true,
      data: {
        replacementsMade: replacement.matchCount,
        totalMatches: replacement.matchedLines.length,
        matchedLines: replacement.matchedLines,
        assetUrl: resolved.url,
        ...(newComponents.length > 0 ? { newComponentsAvailable: newComponents } : {}),
      },
    };
  } catch (error) {
    return { success: false, error: `Error replacing in file: ${toErrorMessage(error)}` };
  }
}

function validateReplacementContent(
  urlOrUuid: string,
  replaceText: string
): { valid: boolean; error?: string } {
  if (!isTypeScriptTarget(urlOrUuid)) {
    return { valid: true };
  }
  return validateTypeScriptContent(replaceText);
}

function buildReplacementResult(
  content: string,
  options: {
    searchText: string;
    replaceText: string;
    replaceAll?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
  }
): { newContent: string; matchCount: number; matchedLines: number[] } {
  const searchPattern = createReplacePattern(options);
  return shouldUseMultilineReplace(options)
    ? replaceMultilineContent(content, searchPattern, options.replaceText, options.replaceAll ?? false)
    : replaceSingleLineContent(content, searchPattern, options.replaceText, options.replaceAll ?? false);
}

function createReplacePattern(options: {
  searchText: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}): RegExp {
  const flags = `g${options.caseSensitive ? "" : "i"}s`;
  if (options.regex) {
    return new RegExp(options.searchText, flags);
  }

  let escapedPattern = options.searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (options.wholeWord) {
    escapedPattern = `\\b${escapedPattern}\\b`;
  }
  return new RegExp(escapedPattern, flags);
}

function shouldUseMultilineReplace(options: { searchText: string; regex?: boolean }): boolean {
  return options.searchText.includes("\n") || Boolean(options.regex && hasExplicitMultilinePattern(options.searchText));
}

function hasExplicitMultilinePattern(pattern: string): boolean {
  return pattern.includes("\\s") || pattern.includes("[\\s\\S]");
}

function replaceMultilineContent(
  content: string,
  searchPattern: RegExp,
  replaceText: string,
  replaceAll: boolean
): { newContent: string; matchCount: number; matchedLines: number[] } {
  const matches = collectGlobalMatches(content, searchPattern);
  if (matches.length === 0) {
    return { newContent: content, matchCount: 0, matchedLines: [] };
  }

  const matchedLines = matches.slice(0, replaceAll ? matches.length : 1).map((match) => {
    return content.slice(0, match.index).split("\n").length;
  });
  if (replaceAll) {
    searchPattern.lastIndex = 0;
    return {
      newContent: content.replace(searchPattern, replaceText),
      matchCount: matches.length,
      matchedLines,
    };
  }

  const firstMatch = matches[0];
  return {
    newContent: `${content.slice(0, firstMatch.index)}${replaceText}${content.slice(firstMatch.index + firstMatch[0].length)}`,
    matchCount: 1,
    matchedLines,
  };
}

function collectGlobalMatches(content: string, searchPattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = searchPattern.exec(content)) !== null) {
    matches.push(match);
    if (match.index === searchPattern.lastIndex) {
      searchPattern.lastIndex += 1;
    }
  }
  return matches;
}

function replaceSingleLineContent(
  content: string,
  searchPattern: RegExp,
  replaceText: string,
  replaceAll: boolean
): { newContent: string; matchCount: number; matchedLines: number[] } {
  const lineMatches = collectLineMatches(content.split("\n"), searchPattern);
  if (lineMatches.length === 0) {
    return { newContent: content, matchCount: 0, matchedLines: [] };
  }

  if (replaceAll) {
    return {
      newContent: content.replace(searchPattern, replaceText),
      matchCount: lineMatches.length,
      matchedLines: lineMatches.map((match) => match.lineNumber),
    };
  }

  const firstMatchRegex = new RegExp(searchPattern.source, searchPattern.flags.replace("g", ""));
  return {
    newContent: content.replace(firstMatchRegex, replaceText),
    matchCount: 1,
    matchedLines: [lineMatches[0].lineNumber],
  };
}

function collectLineMatches(
  lines: string[],
  searchPattern: RegExp
): Array<{ lineNumber: number; index: number }> {
  const matches: Array<{ lineNumber: number; index: number }> = [];
  lines.forEach((line, index) => {
    const lineRegex = new RegExp(searchPattern.source, searchPattern.flags);
    let match: RegExpExecArray | null = null;
    while ((match = lineRegex.exec(line)) !== null) {
      matches.push({ lineNumber: index + 1, index: match.index });
      if (match.index === lineRegex.lastIndex) {
        lineRegex.lastIndex += 1;
      }
    }
  });
  return matches;
}
