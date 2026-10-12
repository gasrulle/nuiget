import * as esbuild from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');
const isAnalyze = process.argv.includes('--analyze');
const isV2 = process.argv.includes('--v2');

// Extension code runs in the VS Code 1.85 extension host (Node 18); webviews run in its Chromium 114.
const EXTENSION_TARGET = 'node18';
const WEBVIEW_TARGET = ['chrome114'];

// `--v2` builds the 2.0 entry points into the same three output files; the default builds 1.x.
const ENTRIES = isV2
    ? {
          extension: 'src/extension.next.ts',
          webview: 'src/webview/main/index.tsx',
          sidebar: 'src/webview/sidebar-next/index.tsx',
      }
    : {
          extension: 'src/extension.ts',
          webview: 'src/webview/app/index.tsx',
          sidebar: 'src/webview/sidebar/index.tsx',
      };

// Minified JavaScript size limits in bytes: the 1.18.9 bundles plus 10 %, Math.ceil(measured * 1.1).
// Measured with `node esbuild.mjs --production --analyze` on the legacy entries at commit 24cf07b plus
// these targets: 272655 (extension), 546077 (webview), 276451 (sidebar). Keyed by output file, so the
// limits also hold for the 2.0 entries. CSS output is not measured.
const BUNDLE_CEILINGS = {
    'dist/extension.js': 299_921,
    'dist/webview.js': 600_685,
    'dist/sidebar.js': 304_097,
};

const ANALYSIS_DIR = 'out/esbuild';

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (!location) {
                    return;
                }
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
    entryPoints: [ENTRIES.extension],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: EXTENSION_TARGET,
    format: 'cjs',
    external: ['vscode'],
    sourcemap: !isProduction,
    minify: isProduction,
    plugins: [esbuildProblemMatcherPlugin],
    logLevel: 'warning',
};

/**
 * @param {string} entry
 * @param {string} outfile
 * @returns {import('esbuild').BuildOptions}
 */
function webviewBundle(entry, outfile) {
    return {
        entryPoints: [entry],
        bundle: true,
        outfile,
        platform: 'browser',
        target: WEBVIEW_TARGET,
        format: 'iife',
        sourcemap: !isProduction,
        minify: isProduction,
        jsx: 'automatic',
        define: {
            'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
        },
        loader: {
            '.tsx': 'tsx',
            '.ts': 'ts',
        },
        plugins: [esbuildProblemMatcherPlugin],
        logLevel: 'warning',
    };
}

const bundles = [
    { name: 'extension', config: extensionConfig },
    { name: 'webview', config: webviewBundle(ENTRIES.webview, 'dist/webview.js') },
    { name: 'sidebar', config: webviewBundle(ENTRIES.sidebar, 'dist/sidebar.js') },
];

// Written outside dist/: the VSIX packs everything in dist/ that .vscodeignore does not exclude.
async function writeAnalysis(name, metafile) {
    const metaPath = `${ANALYSIS_DIR}/${name}.meta.json`;
    await mkdir(ANALYSIS_DIR, { recursive: true });
    await writeFile(metaPath, JSON.stringify(metafile), 'utf8');
    console.log(`\n=== ${name} bundle (${metaPath}) ===`);
    console.log(await esbuild.analyzeMetafile(metafile));
}

/** Prints each bundle against its ceiling and returns the output files that exceed theirs. */
function reportCeilings(results) {
    const exceeded = [];
    console.log('\n=== Bundle sizes (bytes / ceiling) ===');
    for (const [index, { config }] of bundles.entries()) {
        const bytes = results[index].metafile.outputs[config.outfile].bytes;
        const ceiling = BUNDLE_CEILINGS[config.outfile];
        console.log(`${config.outfile} ${bytes} / ${ceiling}`);
        if (bytes > ceiling) {
            exceeded.push(config.outfile);
        }
    }
    return exceeded;
}

async function build() {
    try {
        if (isWatch) {
            const contexts = await Promise.all(bundles.map(({ config }) => esbuild.context(config)));
            await Promise.all(contexts.map((ctx) => ctx.watch()));
            console.log('[watch] Watching for changes...');
            return;
        }

        const results = await Promise.all(
            bundles.map(({ config }) => esbuild.build({ ...config, metafile: isAnalyze })),
        );

        if (isAnalyze) {
            for (const [index, { name }] of bundles.entries()) {
                await writeAnalysis(name, results[index].metafile);
            }
            const exceeded = reportCeilings(results);
            if (!isProduction) {
                console.log('Note: ceilings apply to --production output.');
            } else if (exceeded.length > 0) {
                console.error(`Bundle ceiling exceeded: ${exceeded.join(', ')}`);
                process.exit(1);
            }
        }

        console.log(isProduction ? '[production] Build complete' : '[development] Build complete');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
