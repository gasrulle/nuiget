import type { ChildProcess, ExecFileException } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_POWERSHELL_TIMEOUT_MS,
    POWERSHELL_EXECUTABLE,
    POWERSHELL_UNAVAILABLE_MESSAGE,
    encodePowerShellCommand,
    runPowerShellEncoded,
    type ExecFileFunction,
} from './powershell';
import { InvalidArgumentError } from './validate';

type Outcome = { error?: Partial<ExecFileException> & { message?: string }; stdout?: string; stderr?: string };

/** An `execFile` that records its call and answers with `outcome` on the next tick, like the real one. */
function recordingExecFile(outcome: Outcome = {}) {
    const execFile = vi.fn<ExecFileFunction>((_file, _args, _options, callback) => {
        const error = outcome.error ? Object.assign(new Error(outcome.error.message ?? 'failed'), outcome.error) : null;
        queueMicrotask(() => callback(error, outcome.stdout ?? '', outcome.stderr ?? ''));
        return {} as ChildProcess;
    });
    return execFile;
}

const decode = (encoded: string): string => Buffer.from(encoded, 'base64').toString('utf16le');

describe('encodePowerShellCommand', () => {
    it('is the base64 of the UTF-16LE script', () => {
        expect(encodePowerShellCommand('A')).toBe('QQA=');
        const script = 'Write-Output "åäö $env:USERNAME"; exit 3';
        expect(decode(encodePowerShellCommand(script))).toBe(script);
    });
});

describe('runPowerShellEncoded', () => {
    it('does not start anything outside Windows', async () => {
        const execFile = recordingExecFile();
        for (const platform of ['darwin', 'linux'] as const) {
            await expect(runPowerShellEncoded('Get-Date', { platform, execFile }))
                .resolves.toEqual({ exitCode: -1, stdout: '', stderr: POWERSHELL_UNAVAILABLE_MESSAGE });
        }
        expect(execFile).not.toHaveBeenCalled();
    });

    it('passes the script as -EncodedCommand, never as command text', async () => {
        const execFile = recordingExecFile({ stdout: 'ok\r\n' });
        const script = 'Write-Output "it\'s $(1+1)" | Out-String; & calc.exe';

        const result = await runPowerShellEncoded(script, { platform: 'win32', execFile });

        expect(result).toEqual({ exitCode: 0, stdout: 'ok\r\n', stderr: '' });
        expect(execFile).toHaveBeenCalledTimes(1);
        const [file, args, options] = execFile.mock.calls[0];
        expect(file).toBe(POWERSHELL_EXECUTABLE);
        expect(args).toHaveLength(4);
        expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
        expect(args[3]).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(decode(args[3])).toBe(script);
        // No element of argv contains a character of the script as written.
        expect(args.join(' ')).not.toContain('calc.exe');
        expect(options).toMatchObject({ windowsHide: true, encoding: 'utf8', timeout: DEFAULT_POWERSHELL_TIMEOUT_MS });
        expect(options).not.toHaveProperty('shell');
    });

    it('passes a custom timeout', async () => {
        const execFile = recordingExecFile();
        await runPowerShellEncoded('Get-Date', { platform: 'win32', execFile, timeoutMs: 250 });
        expect(execFile.mock.calls[0][2]).toMatchObject({ timeout: 250 });
    });

    it('reports the exit code and stderr of a failing script', async () => {
        const execFile = recordingExecFile({ error: { code: 3, message: 'Command failed' }, stdout: 'partial', stderr: 'Access denied' });
        await expect(runPowerShellEncoded('exit 3', { platform: 'win32', execFile }))
            .resolves.toEqual({ exitCode: 3, stdout: 'partial', stderr: 'Access denied' });
    });

    it('describes a timeout when the process was killed without output', async () => {
        const execFile = recordingExecFile({ error: { killed: true, signal: 'SIGTERM', message: 'Command failed' } });
        await expect(runPowerShellEncoded('Start-Sleep 60', { platform: 'win32', execFile, timeoutMs: 100 }))
            .resolves.toEqual({ exitCode: -1, stdout: '', stderr: 'PowerShell timed out after 100 ms' });
    });

    it('describes output over the limit and a process that could not be started', async () => {
        const tooMuch = recordingExecFile({ error: { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', message: 'stdout maxBuffer length exceeded' } });
        const overflow = await runPowerShellEncoded('Get-Content big.txt', { platform: 'win32', execFile: tooMuch });
        expect(overflow.exitCode).toBe(-1);
        expect(overflow.stderr).toMatch(/^PowerShell produced more than \d+ bytes of output$/);

        const missing = recordingExecFile({ error: { code: 'ENOENT', message: 'spawn powershell.exe ENOENT' } });
        await expect(runPowerShellEncoded('Get-Date', { platform: 'win32', execFile: missing }))
            .resolves.toEqual({ exitCode: -1, stdout: '', stderr: 'spawn powershell.exe ENOENT' });
    });

    it('resolves instead of throwing when execFile itself throws', async () => {
        const throwsError: ExecFileFunction = () => {
            throw new Error('EPERM');
        };
        await expect(runPowerShellEncoded('Get-Date', { platform: 'win32', execFile: throwsError }))
            .resolves.toEqual({ exitCode: -1, stdout: '', stderr: 'EPERM' });

        const throwsText: ExecFileFunction = () => {
            // eslint-disable-next-line no-throw-literal -- exercises the non-Error path
            throw 'boom';
        };
        await expect(runPowerShellEncoded('Get-Date', { platform: 'win32', execFile: throwsText }))
            .resolves.toEqual({ exitCode: -1, stdout: '', stderr: 'boom' });
    });

    it('rejects an empty script before looking at the platform', async () => {
        const execFile = recordingExecFile();
        await expect(runPowerShellEncoded('   ', { platform: 'win32', execFile })).rejects.toBeInstanceOf(InvalidArgumentError);
        await expect(runPowerShellEncoded('', { platform: 'linux', execFile })).rejects.toBeInstanceOf(InvalidArgumentError);
        expect(execFile).not.toHaveBeenCalled();
    });
});
