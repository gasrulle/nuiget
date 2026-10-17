'use strict';

// Stand-in for the `dotnet` executable in DotnetRunner tests. Prints the received argv, cwd and
// the environment variables the runner is expected to set, then behaves as the FAKE_* variables
// dictate so tests can exercise exit codes, hangs, output caps and signal handling.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture executed directly by node
const { spawn } = require('child_process');

const REPORTED_ENV_KEYS = [
    'DOTNET_CLI_UI_LANGUAGE',
    'DOTNET_NOLOGO',
    'DOTNET_CLI_TELEMETRY_OPTOUT',
    'DOTNET_SKIP_FIRST_TIME_EXPERIENCE',
    'NO_COLOR',
    'TERM',
    'FAKE_EXTRA',
];

function numberFromEnv(name) {
    const value = Number(process.env[name] ?? '0');
    return Number.isFinite(value) ? value : 0;
}

function reportedEnv() {
    const env = {};
    for (const key of REPORTED_ENV_KEYS) {
        if (process.env[key] !== undefined) {
            env[key] = process.env[key];
        }
    }
    return env;
}

function write(stream, text) {
    return new Promise((resolve, reject) => {
        stream.write(text, error => (error ? reject(error) : resolve()));
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    if (process.env.FAKE_IGNORE_SIGTERM === '1') {
        process.on('SIGTERM', () => undefined);
    }

    const report = JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: reportedEnv() });
    await write(process.stdout, process.env.FAKE_STDOUT ?? `${report}\n`);

    const stdoutBytes = numberFromEnv('FAKE_STDOUT_BYTES');
    if (stdoutBytes > 0) {
        await write(process.stdout, 'x'.repeat(stdoutBytes));
    }
    if (process.env.FAKE_STDERR) {
        await write(process.stderr, process.env.FAKE_STDERR);
    }

    const orphanMs = numberFromEnv('FAKE_ORPHAN_MS');
    if (orphanMs > 0) {
        spawn(process.execPath, ['-e', `setTimeout(() => {}, ${orphanMs})`], { stdio: 'inherit', detached: true }).unref();
    }

    const sleepMs = numberFromEnv('FAKE_SLEEP_MS');
    if (sleepMs > 0) {
        await sleep(sleepMs);
    }
    process.exitCode = numberFromEnv('FAKE_EXIT');
}

main().catch(error => {
    process.stderr.write(`fake-dotnet failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 70;
});
