import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Helper function to validate and resolve asset paths/UUIDs
 */
async function resolveAssetPath(urlOrUuid: string): Promise<{ valid: boolean; filePath?: string; url?: string; isReadOnly?: boolean; error?: string }> {
  try {
    // Query asset info to get actual file path and details
    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', urlOrUuid);
    
    if (!assetInfo) {
      // Asset doesn't exist - this is okay for write operations
      if (urlOrUuid.startsWith('db://')) {
        return { 
          valid: true, 
          url: urlOrUuid,
          isReadOnly: urlOrUuid.startsWith('db://internal/'),
          filePath: undefined // Will be created
        };
      } else {
        return { valid: false, error: `Asset with UUID/ID ${urlOrUuid} not found` };
      }
    }
    
    // Check if it's a read-only internal asset
    const isReadOnly = assetInfo.url && assetInfo.url.startsWith('db://internal/');
    
    return {
      valid: true,
      filePath: assetInfo.file,
      url: assetInfo.url,
      isReadOnly: !!isReadOnly
    };
  } catch (error) {
    return { 
      valid: false, 
      error: `Error resolving asset path: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

interface FileOperationResult {
  success: boolean;
  data?: any;
  error?: string;
  logs?: string[];
}

interface SearchMatch {
  line: number;
  content: string;
  startColumn: number;
  endColumn: number;
  context?: {
    before: string[];
    after: string[];
  };
}

interface CodeLocation {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Extract component names from @ccclass decorators in TypeScript content
 */
function extractComponentNames(content: string): string[] {
  const componentNames: string[] = [];
  
  // Regex to match @ccclass decorators with component names
  // Matches: @ccclass('ComponentName') or @ccclass("ComponentName")
  const ccclassRegex = /@ccclass\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  
  let match;
  while ((match = ccclassRegex.exec(content)) !== null) {
    const componentName = match[1].trim();
    if (componentName && !componentNames.includes(componentName)) {
      componentNames.push(componentName);
    }
  }
  
  return componentNames;
}

/**
 * Adjust URL to match component class name for TypeScript files
 */
function adjustUrlForClassName(urlOrUuid: string, content: string): { adjustedUrl: string; wasChanged: boolean } {
  // Only process TypeScript URLs
  if (!urlOrUuid.includes('.ts')) {
    return { adjustedUrl: urlOrUuid, wasChanged: false };
  }
  
  const componentNames = extractComponentNames(content);
  if (componentNames.length === 0) {
    return { adjustedUrl: urlOrUuid, wasChanged: false };
  }
  
  // Use the first component name found
  const className = componentNames[0];
  const parts = urlOrUuid.split('/');
  const currentFileName = parts[parts.length - 1];
  const expectedFileName = `${className}.ts`;
  
  if (currentFileName === expectedFileName) {
    return { adjustedUrl: urlOrUuid, wasChanged: false };
  }
  
  // Replace the filename with class name
  parts[parts.length - 1] = expectedFileName;
  return { adjustedUrl: parts.join('/'), wasChanged: true };
}

/**
 * Get available component types and filter out new components that don't already exist
 */
async function getNewComponentsOnly(detectedComponents: string[]): Promise<string[]> {
  if (detectedComponents.length === 0) {
    return [];
  }
  
  try {
    const options = {
      name: packageJSON.name,
      method: 'queryComponentTypes',
      args: []
    };
    
    const componentTypes = await Editor.Message.request('scene', 'execute-scene-script', options);
    
    if (!componentTypes || !Array.isArray(componentTypes)) {
      // If we can't get existing components, return all detected components
      return detectedComponents;
    }
    
    // Filter out components that already exist
    const newComponents = detectedComponents.filter(componentName => {
      return !componentTypes.includes(componentName);
    });
    
    return newComponents;
  } catch (error) {
    // If there's an error checking existing components, return all detected components
    console.warn('Error checking existing components:', error);
    return detectedComponents;
  }
}

/**
 * Simple validation for TypeScript component constraints
 */
function validateTypeScriptContent(content: string, isEditing: boolean = false): { valid: boolean; error?: string } {
  const detectedComponents = extractComponentNames(content);
  
  // Check if content has multiple components
  if (detectedComponents.length > 1) {
    return { 
      valid: false, 
      error: `Content contains multiple components (${detectedComponents.join(', ')}). Each TypeScript file must contain only one @ccclass component.` 
    };
  }

  return { valid: true };
}

/**
 * Check if asset exists and is accessible
 */
async function validateAssetAccess(urlOrUuid: string, operation: 'read' | 'write'): Promise<{ valid: boolean; assetInfo?: any; error?: string }> {
  try {
    const resolveResult = await resolveAssetPath(urlOrUuid);
    
    if (!resolveResult.valid) {
      return { valid: false, error: resolveResult.error };
    }
    
    // Check if trying to write to read-only asset
    if (operation === 'write' && resolveResult.isReadOnly) {
      return { valid: false, error: `Cannot write to read-only asset: ${resolveResult.url}` };
    }
    
    // For read operations, asset must exist
    if (operation === 'read' && !resolveResult.filePath) {
      return { valid: false, error: `Asset does not exist: ${urlOrUuid}` };
    }
    
    return { 
      valid: true, 
      assetInfo: {
        filePath: resolveResult.filePath,
        url: resolveResult.url,
        isReadOnly: resolveResult.isReadOnly,
        exists: !!resolveResult.filePath
      }
    };
  } catch (error) {
    return { 
      valid: false, 
      error: `Error validating asset access: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Read file content with optional line range and context
 */
async function readFile(urlOrUuid: string, startLine?: number, endLine?: number, contextLines: number = 0): Promise<FileOperationResult> {
  try {
    const resolveResult = await resolveAssetPath(urlOrUuid);
    
    if (!resolveResult.valid) {
      return { success: false, error: resolveResult.error };
    }
    
    if (!resolveResult.filePath) {
      return { success: false, error: `Asset does not exist: ${urlOrUuid}` };
    }
    
    const fullContent = fs.readFileSync(resolveResult.filePath, 'utf8');
    const lines = fullContent.split('\n');
    
    if (startLine !== undefined) {
      const start = Math.max(0, startLine - 1); // Convert to 0-based index
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
      
      // Add context lines if requested
      const contextStart = Math.max(0, start - contextLines);
      const contextEnd = Math.min(lines.length, end + contextLines);
      
      const selectedLines = lines.slice(start, end);
      const contextBefore = contextLines > 0 ? lines.slice(contextStart, start) : [];
      const contextAfter = contextLines > 0 ? lines.slice(end, contextEnd) : [];
      
      return {
        success: true,
        data: {
          content: selectedLines.join('\n'),
          totalLines: lines.length,
          requestedRange: { startLine: startLine, endLine: end },
          ...(contextLines > 0 && { 
            context: { before: contextBefore, after: contextAfter } 
          }),
          assetUrl: resolveResult.url
        }
      };
    }
    
    return {
      success: true,
      data: {
        content: fullContent,
        totalLines: lines.length,
        assetUrl: resolveResult.url
      }
    };
  } catch (error) {
    return { 
      success: false,
      error: `Error reading file: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Write content to file with various modes
 */
async function writeFile(
  urlOrUuid: string, 
  content: string, 
  mode: 'overwrite' | 'append' | 'prepend' | 'insert' = 'overwrite',
  insertLine?: number
): Promise<FileOperationResult> {
  try {
    let targetUrl = urlOrUuid;
    let fileNameChanged = false;
    
    // For TypeScript files, adjust URL to match class name if needed
    if (urlOrUuid.includes('.ts')) {
      const adjustment = adjustUrlForClassName(urlOrUuid, content);
      targetUrl = adjustment.adjustedUrl;
      fileNameChanged = adjustment.wasChanged;
      
      // Validate TypeScript content
      const validation = validateTypeScriptContent(content, false);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }
    
    const resolveResult = await resolveAssetPath(targetUrl);
    
    if (!resolveResult.valid) {
      return { success: false, error: resolveResult.error };
    }
    
    if (resolveResult.isReadOnly) {
      return { success: false, error: `Cannot write to read-only asset: ${resolveResult.url}` };
    }
    
    const contentLines = content.split('\n');
    
    // If asset doesn't exist, create it using asset-db API
    if (!resolveResult.filePath) {
      if (!resolveResult.url) {
        return { success: false, error: 'Cannot create asset without URL' };
      }
      
      try {
        await Editor.Message.request('asset-db', 'create-asset', resolveResult.url, content);
        await Editor.Message.request('asset-db', 'refresh-asset', resolveResult.url);

        // Check for new components in created TypeScript files
        const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
        const newComponents = await getNewComponentsOnly(detectedComponents);
        
        return {
          success: true,
          data: {
            linesWritten: contentLines.length,
            mode: 'create',
            assetUrl: resolveResult.url,
            ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
            ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to create asset: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    // Asset exists, use filesystem operations
    const resolvedPath = resolveResult.filePath;
    
    if (mode === 'insert' && insertLine !== undefined) {
      if (fs.existsSync(resolvedPath)) {
        const existingContent = fs.readFileSync(resolvedPath, 'utf8');
        const existingLines = existingContent.split('\n');
        const insertIndex = Math.max(0, Math.min(insertLine - 1, existingLines.length));
        
        existingLines.splice(insertIndex, 0, ...contentLines);
        const newContent = existingLines.join('\n');
        fs.writeFileSync(resolvedPath, newContent, 'utf8');
        
        const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
        const newComponents = await getNewComponentsOnly(detectedComponents);
        
        return {
          success: true,
          data: {
            linesWritten: contentLines.length,
            totalLines: existingLines.length,
            insertedAt: insertLine,
            mode,
            assetUrl: resolveResult.url,
            ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
            ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
          }
        };
      } else {
        fs.writeFileSync(resolvedPath, content, 'utf8');
        
        const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
        const newComponents = await getNewComponentsOnly(detectedComponents);
        
        return {
          success: true,
          data: {
            linesWritten: contentLines.length,
            mode,
            assetUrl: resolveResult.url,
            ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
            ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
          }
        };
      }
    } else if (mode === 'append') {
      const existingContent = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, 'utf8') : '';
      fs.appendFileSync(resolvedPath, '\n' + content, 'utf8');
      
      const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
      const newComponents = await getNewComponentsOnly(detectedComponents);
      
      return {
        success: true,
        data: {
          linesWritten: contentLines.length,
          mode,
          assetUrl: resolveResult.url,
          ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
          ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
        }
      };
    } else if (mode === 'prepend') {
      const existingContent = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, 'utf8') : '';
      
      if (fs.existsSync(resolvedPath)) {
        fs.writeFileSync(resolvedPath, content + '\n' + existingContent, 'utf8');
      } else {
        fs.writeFileSync(resolvedPath, content, 'utf8');
      }
      
      const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
      const newComponents = await getNewComponentsOnly(detectedComponents);
      
      return {
        success: true,
        data: {
          linesWritten: contentLines.length,
          mode,
          assetUrl: resolveResult.url,
          ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
          ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
        }
      };
    } else {
      // Overwrite
      fs.writeFileSync(resolvedPath, content, 'utf8');
    }
    
    // Check for new components in TypeScript content when overwriting or creating files
    const detectedComponents = targetUrl.includes('.ts') ? extractComponentNames(content) : [];
    const newComponents = await getNewComponentsOnly(detectedComponents);
    
    return {
      success: true,
      data: {
        linesWritten: contentLines.length,
        mode,
        assetUrl: resolveResult.url,
        ...(fileNameChanged && { originalUrl: urlOrUuid, adjustedUrl: targetUrl }),
        ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
      }
    };
  } catch (error) {
    return { 
      success: false,
      error: `Error writing file: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Replace text in file - similar to VS Code's replace functionality
 */
async function replaceInFile(
  urlOrUuid: string,
  searchText: string,
  replaceText: string,
  options: {
    replaceAll?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
    contextLines?: number;
  } = {}
): Promise<FileOperationResult> {
  try {
    const resolveResult = await resolveAssetPath(urlOrUuid);
    
    if (!resolveResult.valid) {
      return { success: false, error: resolveResult.error };
    }
    
    if (resolveResult.isReadOnly) {
      return { success: false, error: `Cannot modify read-only asset: ${resolveResult.url}` };
    }
    
    if (!resolveResult.filePath) {
      return { success: false, error: `Asset does not exist: ${urlOrUuid}` };
    }
    
    const content = fs.readFileSync(resolveResult.filePath, 'utf8');
    const lines = content.split('\n');
    
    // For TypeScript files, validate the replacement text
    if (urlOrUuid.includes('.ts')) {
      const validation = validateTypeScriptContent(replaceText, true);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }
    
    let searchPattern: RegExp;
    // Add 's' flag for dotall mode to handle multiline patterns properly
    const flags = `g${options.caseSensitive ? '' : 'i'}s`;
    
    if (options.regex) {
      searchPattern = new RegExp(searchText, flags);
    } else {
      let escapedPattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (options.wholeWord) {
        escapedPattern = `\\b${escapedPattern}\\b`;
      }
      searchPattern = new RegExp(escapedPattern, flags);
    }
    
    const replacements: Array<{
      line: number;
      originalContent?: string;
      newContent?: string;
      position: { start: number; end: number };
    }> = [];
    
    let newContent = content;
    let matchCount = 0;
    
    // Check if pattern contains newlines - if so, search in full content, otherwise search line by line
    const isMultilinePattern = searchText.includes('\n') || (options.regex && (searchText.includes('\\s') || searchText.includes('[\\s\\S]')));
    
    if (isMultilinePattern) {
      // For multiline patterns, search in the entire content
      const globalMatches: RegExpExecArray[] = [];
      let globalMatch;
      while ((globalMatch = searchPattern.exec(content)) !== null) {
        globalMatches.push(globalMatch);
        if (globalMatch.index === searchPattern.lastIndex) {
          searchPattern.lastIndex++;
        }
      }
      
      if (globalMatches.length > 0) {
        if (options.replaceAll) {
          // Reset regex for replacement
          searchPattern.lastIndex = 0;
          newContent = content.replace(searchPattern, replaceText);
          matchCount = globalMatches.length;
        } else {
          // Replace only first match
          const firstMatch = globalMatches[0];
          newContent = content.substring(0, firstMatch.index) + 
                      replaceText + 
                      content.substring(firstMatch.index + firstMatch[0].length);
          matchCount = 1;
        }
        
        // Calculate line numbers for matches (exclude content already known to AI)
        globalMatches.slice(0, matchCount).forEach((match) => {
          const beforeMatch = content.substring(0, match.index);
          const lineNumber = beforeMatch.split('\n').length;
          
          replacements.push({
            line: lineNumber,
            position: { start: match.index, end: match.index + match[0].length }
          });
        });
      }
    } else {
      // For single-line patterns, search line by line (existing logic)
      const allMatches: Array<{ match: RegExpExecArray; lineNumber: number; lineContent: string }> = [];
      
      lines.forEach((line, lineIndex) => {
        const lineRegex = new RegExp(searchPattern.source, searchPattern.flags);
        let lineMatch;
        while ((lineMatch = lineRegex.exec(line)) !== null) {
          allMatches.push({
            match: lineMatch,
            lineNumber: lineIndex + 1,
            lineContent: line
          });
          if (lineMatch.index === lineRegex.lastIndex) {
            lineRegex.lastIndex++;
          }
        }
      });
    
      // Perform replacements for single-line patterns
      if (allMatches.length > 0) {
        if (options.replaceAll) {
          newContent = content.replace(searchPattern, replaceText);
          matchCount = allMatches.length;
          
          // Track minimal replacement info (exclude content already known to AI)
          allMatches.forEach(({ match, lineNumber }) => {
            replacements.push({
              line: lineNumber,
              position: { start: match.index, end: match.index + match[0].length }
            });
          });
        } else {
          // Replace only first match
          const firstMatch = allMatches[0];
          const firstMatchRegex = new RegExp(searchPattern.source, searchPattern.flags.replace('g', ''));
          newContent = content.replace(firstMatchRegex, replaceText);
          matchCount = 1;
          
          const newLineContent = firstMatch.lineContent.replace(firstMatchRegex, replaceText);
          replacements.push({
            line: firstMatch.lineNumber,
            position: { start: firstMatch.match.index, end: firstMatch.match.index + firstMatch.match[0].length }
          });
        }
      }
    }
    
    // Write the new content if there were any replacements
    if (matchCount > 0) {
      fs.writeFileSync(resolveResult.filePath, newContent, 'utf8');
    }
    
    // Check for new components in the replacement text if it's a TypeScript file
    const detectedComponents = urlOrUuid.includes('.ts') ? extractComponentNames(replaceText) : [];
    const newComponents = await getNewComponentsOnly(detectedComponents);
    
    return {
      success: true,
      data: {
        replacementsMade: matchCount,
        totalMatches: replacements.length,
        matchedLines: replacements.map(r => r.line),
        assetUrl: resolveResult.url,
        ...(newComponents.length > 0 && { newComponentsAvailable: newComponents })
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Error replacing in file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Search for patterns in file with context
 */
async function searchFile(
  urlOrUuid: string, 
  pattern: string, 
  options: { 
    caseSensitive?: boolean; 
    wholeWord?: boolean; 
    regex?: boolean;
    contextLines?: number;
    maxResults?: number;
  } = {}
): Promise<FileOperationResult> {
  try {
    const resolveResult = await resolveAssetPath(urlOrUuid);
    
    if (!resolveResult.valid) {
      return { success: false, error: resolveResult.error };
    }
    
    if (!resolveResult.filePath) {
      return { success: false, error: `Asset does not exist: ${urlOrUuid}` };
    }
    
    const content = fs.readFileSync(resolveResult.filePath, 'utf8');
    const lines = content.split('\n');
    const matches: SearchMatch[] = [];
    
    let searchPattern: RegExp;
    // Add 's' flag for dotall mode to handle multiline patterns properly
    const flags = options.caseSensitive ? 'gs' : 'gis';
    
    if (options.regex) {
      searchPattern = new RegExp(pattern, flags);
    } else {
      let escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (options.wholeWord) {
        escapedPattern = `\\b${escapedPattern}\\b`;
      }
      searchPattern = new RegExp(escapedPattern, flags);
    }
    
    const contextLines = options.contextLines || 0;
    const maxResults = options.maxResults || Infinity;
    
    // Check if pattern contains newlines - if so, search in full content, otherwise search line by line
    const isMultilinePattern = pattern.includes('\n') || (options.regex && (pattern.includes('\\s') || pattern.includes('[\\s\\S]')));
    
    if (isMultilinePattern) {
      // For multiline patterns, search in the entire content
      let globalMatch;
      while ((globalMatch = searchPattern.exec(content)) !== null && matches.length < maxResults) {
        const beforeMatch = content.substring(0, globalMatch.index);
        const lineNumber = beforeMatch.split('\n').length;
        const matchedText = globalMatch[0];
        
        // Calculate context for multiline matches
        const matchStartLine = lineNumber - 1; // 0-based
        const matchLines = matchedText.split('\n').length;
        const matchEndLine = matchStartLine + matchLines - 1;
        
        const context = contextLines > 0 ? {
          before: lines.slice(Math.max(0, matchStartLine - contextLines), matchStartLine),
          after: lines.slice(matchEndLine + 1, Math.min(lines.length, matchEndLine + 1 + contextLines))
        } : undefined;
        
        matches.push({
          line: lineNumber,
          content: matchedText,
          startColumn: 0, // For multiline matches, start at beginning
          endColumn: matchedText.split('\n').pop()?.length || 0,
          context
        });
        
        if (globalMatch.index === searchPattern.lastIndex) {
          searchPattern.lastIndex++;
        }
      }
    } else {
      // For single-line patterns, search line by line (existing logic)
      lines.forEach((line, index) => {
        if (matches.length >= maxResults) return;
        
        let match;
        const lineRegex = new RegExp(searchPattern.source, searchPattern.flags);
        while ((match = lineRegex.exec(line)) !== null && matches.length < maxResults) {
          const context = contextLines > 0 ? {
            before: lines.slice(Math.max(0, index - contextLines), index),
            after: lines.slice(index + 1, Math.min(lines.length, index + 1 + contextLines))
          } : undefined;
          
          matches.push({
            line: index + 1,
            content: line,
            startColumn: match.index,
            endColumn: match.index + match[0].length,
            context
          });
          
          if (match.index === lineRegex.lastIndex) {
            lineRegex.lastIndex++;
          }
        }
      });
    }
    
    return {
      success: true,
      data: {
        matches,
        totalMatches: matches.length,
        assetUrl: resolveResult.url
      }
    };
  } catch (error) {
    return { 
      success: false,
      error: `Error searching file: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Get file information and stats
 */
async function getFileInfo(urlOrUuid: string): Promise<FileOperationResult> {
  try {
    const resolveResult = await resolveAssetPath(urlOrUuid);
    
    if (!resolveResult.valid) {
      return { success: false, error: resolveResult.error };
    }
    
    if (!resolveResult.filePath) {
      return {
        success: true,
        data: { 
          exists: false, 
          assetUrl: resolveResult.url,
          isReadOnly: resolveResult.isReadOnly 
        }
      };
    }
    
    const stats = fs.statSync(resolveResult.filePath);
    const content = fs.readFileSync(resolveResult.filePath, 'utf8');
    const lines = content.split('\n');
    
    return {
      success: true,
      data: {
        exists: true,
        path: resolveResult.filePath,
        assetUrl: resolveResult.url,
        isReadOnly: resolveResult.isReadOnly,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        extension: path.extname(resolveResult.filePath),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        lineCount: lines.length,
        characterCount: content.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting file info: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function registerOperateScriptsAndTextTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_scripts_and_text",
    {
      title: "Advanced File Operations",
      description: "File operations: read, write, search, replace text.",
      inputSchema: {
        operation: z.enum(["read", "write", "search", "replace", "info"]).describe("File operation type"),
        urlOrUuid: z.string().describe("Asset UUID or db:// format URL"),
        
        // Read operation parameters
        startLine: z.number().optional().describe("Starting line number for reading (1-based)"),
        endLine: z.number().optional().describe("Ending line number for reading (1-based)"),
        contextLines: z.number().optional().default(0).describe("Number of context lines to include before/after the requested range"),
        
        // Write operation parameters
        content: z.string().optional().describe("Content to write (required for write operation)"),
        writeMode: z.enum(["overwrite", "append", "prepend", "insert"]).optional().default("overwrite").describe("Write mode: overwrite entire file, append to end, prepend to start, or insert at specific line"),
        insertLine: z.number().optional().describe("Line number for insert mode (1-based)"),
        
        // Search operation parameters
        searchPattern: z.string().optional().describe("Pattern to search for (required for search operation)"),
        caseSensitive: z.boolean().optional().default(false).describe("Case sensitive search"),
        wholeWord: z.boolean().optional().default(false).describe("Match whole words only"),
        useRegex: z.boolean().optional().default(false).describe("Treat pattern as regular expression"),
        maxResults: z.number().optional().describe("Maximum number of search results to return"),
        
        // Replace operation parameters
        replaceText: z.string().optional().describe("Replacement text (required for replace operation)"),
        replaceAll: z.boolean().optional().default(false).describe("Replace all occurrences (false = replace first only)")
      }
    },
    async ({ 
      operation, 
      urlOrUuid, 
      startLine, 
      endLine, 
      contextLines, 
      content, 
      writeMode, 
      insertLine, 
      searchPattern, 
      caseSensitive, 
      wholeWord, 
      useRegex, 
      maxResults, 
      replaceText, 
      replaceAll 
    }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      
      try {
        let result: FileOperationResult = { success: false };
        
        // For info operation, skip validation and go directly to the operation
        if (operation === 'info') {
          result = await getFileInfo(urlOrUuid);
        } else {
          // Validate asset access for other operations
          const accessCheck = await validateAssetAccess(urlOrUuid, operation === 'read' || operation === 'search' ? 'read' : 'write');
          if (!accessCheck.valid) {
            result = {
              success: false,
              error: accessCheck.error
            };
          } else {
            switch (operation) {
              case "read":
                result = await readFile(urlOrUuid, startLine, endLine, contextLines);
                break;
                
              case "write":
                if (!content) {
                  result = { success: false, error: "content parameter is required for write operation" };
                } else {
                  result = await writeFile(urlOrUuid, content, writeMode, insertLine);
                }
                break;
                
              case "search":
                if (!searchPattern) {
                  result = { success: false, error: "searchPattern parameter is required for search operation" };
                } else {
                  result = await searchFile(urlOrUuid, searchPattern, {
                    caseSensitive,
                    wholeWord,
                    regex: useRegex,
                    contextLines,
                    maxResults
                  });
                }
                break;
                
              case "replace":
                if (!searchPattern || replaceText === undefined) {
                  result = { success: false, error: "searchPattern and replaceText parameters are required for replace operation" };
                } else {
                  result = await replaceInFile(urlOrUuid, searchPattern, replaceText, {
                    replaceAll,
                    caseSensitive,
                    wholeWord,
                    regex: useRegex,
                    contextLines
                  });
                }
                break;
            }
          }
        }
        
        // Capture any logs from the operation
        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        if (capturedLogs && capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }
        
        // Return compact response (exclude parameters AI already knows)
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: result.success,
              ...(result.data && { data: result.data }),
              ...(result.error && { error: result.error }),
              ...(result.logs && result.logs.length > 0 && { logs: result.logs })
            })
          }]
        };
        
      } catch (error) {
        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        const errorResult = {
          success: false,
          error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          ...(capturedLogs && capturedLogs.length > 0 && { logs: capturedLogs })
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(errorResult)
          }]
        };
      }
    }
  );
}