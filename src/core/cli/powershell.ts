import { execFile as nodeExecFile, type ChildProcess, type ExecFileException, type ExecFileOptionsWithStringEncoding } from 'child_process';
import { InvalidArgumentError } from './validate';

export const POWERSHELL_EXECUTABLE = 'powershell.exe';
export const DEFAULT_POWERSHELL_TIMEOUT_MS = 10_000;
export const POWERSHELL_UNAVAILABLE_MESSAGE = 'PowerShell is only available on Windows';
// DPAPI round-trips are tiny; the cap exists so a misbehaving script cannot exhaust memory.
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface PowerShellResult {
    /** 0 on success; the script's exit code otherwise, or -1 when no exit code exists (not started, killed, non-Windows). */
    exitCode: number;
    stdout: string;
    stderr: string;
    /** Set when the process was killed at `timeoutMs`. */
    timedOut?: boolean;
}

/** `child_process.execFile` shape used by the runner (tests inject a recorder). */
export type ExecFileFunction = (
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding,
    callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
) => ChildProcess;

export interface PowerShellOptions {
    timeoutMs?: number;
    execFile?: ExecFileFunction;
    platform?: NodeJS.Platform;
}

/** Base64 of the UTF-16LE script, the form `powershell.exe -EncodedCommand` expects. */
export function encodePowerShellCommand(script: string): string {
    return Buffer.from(script, 'utf16le').toString('base64');
}

/**
 * Run a PowerShell script through `-EncodedCommand`, so no character of the script is ever
 * interpreted by a shell or re-parsed from the command line. Resolves for every outcome;
 * on non-Windows platforms it resolves immediately with exit code -1 and never spawns.
 * Output is decoded as UTF-8; scripts that print non-ASCII text should set
 * `[Console]::OutputEncoding` themselves.
 */
export function runPowerShellEncoded(script: string, options: PowerShellOptions = {}): Promise<PowerShellResult> {
    if (script.trim().length === 0) {
        return Promise.reject(new InvalidArgumentError('PowerShell script', script, 'must not be empty'));
    }
    const platform = options.platform ?? process.platform;
    if (platform !== 'win32') {
        return Promise.resolve({ exitCode: -1, stdout: '', stderr: POWERSHELL_UNAVAILABLE_MESSAGE });
    }
    const execFile = options.execFile ?? nodeExecFile;
    const timeoutMs = options.timeoutMs ?? DEFAULT_POWERSHELL_TIMEOUT_MS;
    const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(script)];

    return new Promise<PowerShellResult>(resolve => {
        const settle = (error: ExecFileException | null, stdout: string, stderr: string): void => {
            resolve({
                exitCode: exitCodeFrom(error),
                stdout,
                stderr: stderr.length > 0 || !error ? stderr : describeFailure(error, timeoutMs),
                ...(error?.killed === true ? { timedOut: true } : {}),
            });
        };
        try {
            execFile(
                POWERSHELL_EXECUTABLE,
                args,
                { timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
                settle,
            );
        } catch (error) {
            settle(toExecFileException(error), '', '');
        }
    });
}

function exitCodeFrom(error: ExecFileException | null): number {
    if (!error) {
        return 0;
    }
    return typeof error.code === 'number' ? error.code : -1;
}

function describeFailure(error: ExecFileException, timeoutMs: number): string {
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return `PowerShell produced more than ${MAX_OUTPUT_BYTES} bytes of output`;
    }
    if (error.killed) {
        return `PowerShell timed out after ${timeoutMs} ms`;
    }
    return error.message;
}

function toExecFileException(error: unknown): ExecFileException {
    return error instanceof Error ? error : new Error(String(error));
}
