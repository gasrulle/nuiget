import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');
const isAnalyze = process.argv.includes('--analyze');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`\u2718 [ERROR] ${text}`);
                if (location == null) return;
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: !isProduction, // Source maps only in development
    minify: isProduction,
    plugins: [esbuildProblemMatcherPlugin],
    logLevel: 'warning',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
    entryPoints: ['src/webview/app/index.tsx'],
    bundle: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    sourcemap: !isProduction, // Source maps only in development
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

/** @type {import('esbuild').BuildOptions} */
const sidebarConfig = {
    entryPoints: ['src/webview/sidebar/index.tsx'],
    bundle: true,
    outfile: 'dist/sidebar.js',
    platform: 'browser',
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

async function build() {
    try {
        if (isWatch) {
            // Use context API for watch mode
            const [extCtx, webCtx, sidebarCtx] = await Promise.all([
                esbuild.context(extensionConfig),
                esbuild.context(webviewConfig),
                esbuild.context(sidebarConfig),
            ]);

            await Promise.all([
                extCtx.watch(),
                webCtx.watch(),
                sidebarCtx.watch(),
            ]);

            console.log('[watch] Watching for changes...');
        } else {
            // One-shot build
            const metafile = isAnalyze;
            const [extResult, webResult, sidebarResult] = await Promise.all([
                esbuild.build({ ...extensionConfig, metafile }),
                esbuild.build({ ...webviewConfig, metafile }),
                esbuild.build({ ...sidebarConfig, metafile }),
            ]);

            if (isAnalyze) {
                console.log('\n=== Extension Bundle ===');
                console.log(await esbuild.analyzeMetafile(extResult.metafile));
                console.log('\n=== Webview Bundle ===');
                console.log(await esbuild.analyzeMetafile(webResult.metafile));
                console.log('\n=== Sidebar Bundle ===');
                console.log(await esbuild.analyzeMetafile(sidebarResult.metafile));
            }

            console.log(isProduction ? '[production] Build complete' : '[development] Build complete');
        }
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
