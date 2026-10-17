#!/usr/bin/env node
// Fails when `vsce package` would ship a file outside the allow-list, or would leave out a file the
// extension needs. Uses the same file selection as `vsce ls`, so it needs a build but no VSIX.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOWED_PATTERNS = [
    'dist/*.js',
    'dist/*.css',
    'resources/**',
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
];

const ALWAYS_REQUIRED = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'dist/webview.js',
    'dist/webview.css',
    'dist/sidebar.js',
    'dist/sidebar.css',
    // Loaded by host code with Uri.joinPath, so the manifest does not mention them.
    'resources/tab-icon.png',
    'resources/package-icon.png',
];

function globToRegExp(pattern) {
    const escaped = pattern
        .split('**')
        .map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
        .join('.*');
    return new RegExp(`^${escaped}$`);
}

const allowed = ALLOWED_PATTERNS.map(globToRegExp);

export function normalize(file) {
    return file.split(path.sep).join('/').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isAllowed(file) {
    return allowed.some((pattern) => pattern.test(normalize(file)));
}

/** Icon references that are files; `$(codicon)` references are not. */
function iconFiles(icon) {
    const candidates = typeof icon === 'string' ? [icon] : Object.values(icon ?? {});
    return candidates.filter((candidate) => typeof candidate === 'string' && !candidate.startsWith('$('));
}

/** Every file the extension cannot load or render without, derived from the manifest. */
export function requiredFiles(manifest) {
    const contributes = manifest.contributes ?? {};
    const contributed = [
        ...Object.values(contributes.viewsContainers ?? {}).flat(),
        ...Object.values(contributes.views ?? {}).flat(),
        ...(contributes.commands ?? []),
    ];
    const fromManifest = [
        manifest.main ?? 'dist/extension.js',
        ...iconFiles(manifest.icon),
        ...contributed.flatMap((entry) => iconFiles(entry.icon)),
    ];
    const main = normalize(fromManifest[0]);
    const withExtension = path.posix.extname(main) === '' ? `${main}.js` : main;
    return [...new Set([...ALWAYS_REQUIRED, withExtension, ...fromManifest.slice(1).map(normalize)])].sort();
}

/** Splits a VSIX file list into files that must not ship and required files that are absent. */
export function checkFiles(files, manifest) {
    const normalized = files.map(normalize).sort();
    return {
        files: normalized,
        offenders: normalized.filter((file) => !isAllowed(file)),
        missing: requiredFiles(manifest).filter((file) => !normalized.includes(file)),
    };
}

async function main() {
    const { default: vsce } = await import('@vscode/vsce');
    const manifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    const listed = await vsce.listFiles({ cwd: repoRoot });

    if (listed.length === 0) {
        console.error('check:vsix: vsce reported an empty file list; refusing to treat that as success.');
        process.exit(1);
    }

    const { files, offenders, missing } = checkFiles(listed, manifest);

    console.log(`check:vsix: ${files.length} file(s) selected for the VSIX:`);
    for (const file of files) {
        console.log(`  ${offenders.includes(file) ? '✖' : '✓'} ${file}`);
    }

    if (offenders.length > 0) {
        console.error(`\ncheck:vsix: ${offenders.length} file(s) are outside the allow-list (${ALLOWED_PATTERNS.join(', ')}):`);
        for (const file of offenders) {
            console.error(`  ${file}`);
        }
        console.error('Add an exclusion to .vscodeignore or, if the file must ship, extend ALLOWED_PATTERNS in scripts/check-vsix-contents.mjs.');
    }
    if (missing.length > 0) {
        console.error(`\ncheck:vsix: required file(s) missing from the VSIX: ${missing.join(', ')}`);
        console.error('Build first (`npm run package`), or fix the manifest reference or the .vscodeignore rule that hides the file.');
    }
    if (offenders.length > 0 || missing.length > 0) {
        process.exit(1);
    }
    console.log('\ncheck:vsix: OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error('check:vsix: failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
