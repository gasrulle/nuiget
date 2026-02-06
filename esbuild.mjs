import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

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
    logLevel: 'info',
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
    logLevel: 'info',
};

async function build() {
    try {
        if (isWatch) {
            // Use context API for watch mode
            const [extCtx, webCtx] = await Promise.all([
                esbuild.context(extensionConfig),
                esbuild.context(webviewConfig),
            ]);

            await Promise.all([
                extCtx.watch(),
                webCtx.watch(),
            ]);

            console.log('[watch] Build started. Watching for changes...');
        } else {
            // One-shot build
            await Promise.all([
                esbuild.build(extensionConfig),
                esbuild.build(webviewConfig),
            ]);

            console.log(isProduction ? '[production] Build complete' : '[development] Build complete');
        }
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
