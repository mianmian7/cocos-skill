/**
 * Package script for creating distribution zip
 * Usage: node scripts/package.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Read package.json for version info
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = pkg.version;
const name = pkg.name;

// Output zip filename
const zipName = `${name}-v${version}.zip`;
const outputDir = 'release';

function commandExists(command) {
    try {
        const checker = process.platform === 'win32'
            ? `where ${command}`
            : `command -v ${command}`;
        execSync(checker, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function toWindowsPath(targetPath) {
    if (process.platform === 'win32') {
        return targetPath;
    }

    if (!commandExists('wslpath')) {
        return targetPath;
    }

    const escaped = targetPath.replace(/"/g, '\\"');
    return execSync(`wslpath -w "${escaped}"`, { encoding: 'utf8' }).trim();
}

// Files/directories to include in the distribution
const includeFiles = [
    'dist',           // Compiled code with bundled dependencies
    'static',         // Static assets (templates, styles)
    '@types',         // Type definitions for Cocos
    'package.json',   // Extension manifest
    'README.md',      // Documentation
];

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Check if all required files exist
console.log('📋 Checking required files...');
for (const file of includeFiles) {
    if (!fs.existsSync(file)) {
        console.error(`❌ Missing required file: ${file}`);
        console.log('   Run "npm run build" first!');
        process.exit(1);
    }
    console.log(`   ✓ ${file}`);
}

// Create zip using PowerShell (Windows) or zip command (Unix)
console.log(`\n📦 Creating ${zipName}...`);

const zipPath = path.join(outputDir, zipName);

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

// Use tar.exe on Windows (available since Windows 10)
const isWindows = process.platform === 'win32';

if (isWindows) {
    // Windows tar requires paths with @ to be prefixed, e.g. .\@types
    const filesToZip = includeFiles.map(f => `.\\\\${f}`).join(' ');
    try {
        execSync(`tar.exe -a -c -f "${zipPath}" ${filesToZip}`, { stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Failed to create zip:', error.message);
        process.exit(1);
    }
} else {
    if (commandExists('zip')) {
        // Unix zip command
        const filesToZip = includeFiles.join(' ');
        try {
            execSync(`zip -r "${zipPath}" ${filesToZip}`, { stdio: 'inherit' });
        } catch (error) {
            console.error('❌ Failed to create zip:', error.message);
            process.exit(1);
        }
    } else if (commandExists('tar.exe') && commandExists('wslpath')) {
        // WSL fallback using Windows tar.exe
        const windowsRoot = toWindowsPath(path.resolve('.'));
        const windowsZipPath = toWindowsPath(path.resolve(zipPath));
        const filesToZip = includeFiles.map((item) => `.\\\\${item}`).join(' ');
        try {
            execSync(`tar.exe -a -c -f "${windowsZipPath}" -C "${windowsRoot}" ${filesToZip}`, {
                stdio: 'inherit'
            });
        } catch (error) {
            console.error('❌ Failed to create zip via tar.exe:', error.message);
            process.exit(1);
        }
    } else if (commandExists('powershell.exe')) {
        // WSL fallback when zip is unavailable
        const windowsRoot = toWindowsPath(path.resolve('.'));
        const windowsZipPath = toWindowsPath(path.resolve(zipPath));
        const windowsPaths = includeFiles.map((item) => toWindowsPath(path.resolve(item)));
        const windowsPathArray = windowsPaths
            .map((item) => `'${item.replace(/'/g, "''")}'`)
            .join(', ');
        const psScript = [
            "$ErrorActionPreference = 'Stop'",
            "Add-Type -AssemblyName System.IO.Compression",
            "Add-Type -AssemblyName System.IO.Compression.FileSystem",
            `$root = '${windowsRoot.replace(/'/g, "''")}'`,
            `$zipPath = '${windowsZipPath.replace(/'/g, "''")}'`,
            `$paths = @(${windowsPathArray})`,
            "if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }",
            "$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)",
            "Push-Location -LiteralPath $root",
            "function Get-RelativeZipPath([string]$basePath, [string]$targetPath) {",
            "  $relative = Resolve-Path -LiteralPath $targetPath -Relative",
            "  $relative = $relative -replace '^[./\\\\]+', ''",
            "  return $relative.Replace('\\', '/')",
            "}",
            "try {",
            "  foreach ($item in $paths) {",
            "    if (Test-Path -LiteralPath $item -PathType Container) {",
            "      Get-ChildItem -LiteralPath $item -Recurse -File | ForEach-Object {",
            "        $entryName = Get-RelativeZipPath -basePath $root -targetPath $_.FullName",
            "        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null",
            "      }",
            "    } elseif (Test-Path -LiteralPath $item -PathType Leaf) {",
            "      $entryName = Get-RelativeZipPath -basePath $root -targetPath $item",
            "      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null",
            "    } else {",
            "      throw \"Missing path: $item\"",
            "    }",
            "  }",
            "} finally {",
            "  Pop-Location",
            "  $zip.Dispose()",
            "}"
        ].join(';\n');

        try {
            const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
            execSync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`, {
                stdio: 'inherit'
            });
        } catch (error) {
            console.error('❌ Failed to create zip via PowerShell:', error.message);
            process.exit(1);
        }
    } else {
        console.error('❌ Failed to create zip: no available packager found');
        console.log('   Install "zip" or make sure "powershell.exe" is available');
        process.exit(1);
    }
}

// Get zip file size
const stats = fs.statSync(zipPath);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log(`\n🎉 Package created successfully!`);
console.log(`   📁 ${zipPath}`);
console.log(`   📏 Size: ${sizeMB} MB`);
console.log(`\n📝 Installation instructions:`);
console.log(`   1. Open Cocos Creator`);
console.log(`   2. Go to Extension Manager`);
console.log(`   3. Click "Import Extension" and select the zip file`);
console.log(`   Or extract to: [Cocos Creator]/extensions/${name}/`);
