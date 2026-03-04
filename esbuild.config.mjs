import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

// Read package.json to get dependencies
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Native modules that cannot be bundled (must remain external)
const nativeModules = [
    // No native modules currently used
];

// Cocos Creator editor modules (provided by the editor runtime)
const editorExternals = [
    'electron',
    'cc',
    '@cocos/creator-types',
    '@cocos/creator-types/editor',
    // Note: Vue is NOT provided by Cocos Creator to extensions, must bundle it
];

// All external modules
const external = [...nativeModules, ...editorExternals];

// Common build options
const commonOptions = {
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'cjs',
    external,
    sourcemap: false,
    minify: false,  // Keep readable for debugging
    treeShaking: true,
    logLevel: 'info',
};

// Build entries
const entries = [
    // Main extension entry
    {
        entryPoints: ['source/main.ts'],
        outfile: 'dist/main.js',
    },
    // Scene script
    {
        entryPoints: ['source/scene/index.ts'],
        outfile: 'dist/scene/index.js',
    },
    // Panel: default
    {
        entryPoints: ['source/panels/default/index.ts'],
        outfile: 'dist/panels/default/index.js',
    },
];

async function build() {
    console.log('🔨 Building Cocos Skill extension with esbuild...\n');

    // Clean dist directory
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true });
    }
    fs.mkdirSync('dist', { recursive: true });

    // Build all entries
    for (const entry of entries) {
        try {
            await esbuild.build({
                ...commonOptions,
                ...entry,
            });
            console.log(`✅ Built: ${entry.outfile}`);
        } catch (error) {
            console.error(`❌ Failed to build ${entry.entryPoints[0]}:`, error);
            process.exit(1);
        }
    }

    // Copy native modules to dist/node_modules (if any)
    if (nativeModules.length > 0) {
        console.log('\n📦 Copying native modules...');
        const distNodeModules = 'dist/node_modules';
        fs.mkdirSync(distNodeModules, { recursive: true });

        for (const mod of nativeModules) {
            const srcPath = path.join('node_modules', mod);
            const destPath = path.join(distNodeModules, mod);

            if (fs.existsSync(srcPath)) {
                copyRecursive(srcPath, destPath);
                console.log(`✅ Copied: ${mod}`);
            } else {
                console.warn(`⚠️ Module not found: ${mod}`);
            }
        }
    }

    console.log('\n🎉 Build completed successfully!');
    console.log('\nNote: The dist folder now contains:');
    console.log('  - Bundled JS files (dependencies included)');
    if (nativeModules.length > 0) {
        console.log('  - node_modules/ with native modules');
    }
}

function copyRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(src)) {
            copyRecursive(path.join(src, file), path.join(dest, file));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
