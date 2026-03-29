import { beforeEach, describe, expect, it } from 'vitest';
import { createMockOutputChannel } from '../test/helpers/backend';
import { NuGetLogger } from './NuGetLogger';

describe('NuGetLogger', () => {
    let logger: NuGetLogger;
    let channel: ReturnType<typeof createMockOutputChannel>;

    beforeEach(() => {
        channel = createMockOutputChannel();
        logger = new NuGetLogger(channel as any);
    });

    // ──────────────────────────────────────────────
    // sanitizeForLogging
    // ──────────────────────────────────────────────
    describe('sanitizeForLogging', () => {
        it('returns empty/falsy input unchanged', () => {
            expect(logger.sanitizeForLogging('')).toBe('');
            expect(logger.sanitizeForLogging(undefined as any)).toBe(undefined);
            expect(logger.sanitizeForLogging(null as any)).toBe(null);
        });

        it('redacts URLs with embedded credentials', () => {
            const input = 'Fetching from https://user:p4ssw0rd@myhost.com/nuget/v3/index.json';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('[REDACTED]:[REDACTED]@myhost.com');
            expect(result).not.toContain('p4ssw0rd');
            expect(result).not.toContain('user:p4ssw0rd');
        });

        it('redacts CLI password arguments', () => {
            const input = 'dotnet nuget add source "url" --password "my-secret-pass"';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('--password "[REDACTED]"');
            expect(result).not.toContain('my-secret-pass');
        });

        it('redacts short -p password flag', () => {
            const input = 'some command -p secret123';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('-p "[REDACTED]"');
            expect(result).not.toContain('secret123');
        });

        it('redacts API key patterns (key=value)', () => {
            const input = 'Request with apikey=abc123xyz and access_token=tok456';
            const result = logger.sanitizeForLogging(input);
            expect(result).not.toContain('abc123xyz');
            expect(result).not.toContain('tok456');
            expect(result).toContain('apikey=[REDACTED]');
        });

        it('redacts Authorization headers', () => {
            const input = 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('Authorization: [REDACTED]');
            expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
        });

        it('redacts X-NuGet-ApiKey header', () => {
            const input = 'X-NuGet-ApiKey=my-api-key-value';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('X-NuGet-ApiKey=[REDACTED]');
            expect(result).not.toContain('my-api-key-value');
        });

        it('redacts ClearTextPassword in NuGet config output', () => {
            const input = 'ClearTextPassword=supersecret';
            const result = logger.sanitizeForLogging(input);
            expect(result).toContain('ClearTextPassword=[REDACTED]');
            expect(result).not.toContain('supersecret');
        });

        it('leaves text without secrets unchanged', () => {
            const input = 'Successfully installed Newtonsoft.Json 13.0.3';
            expect(logger.sanitizeForLogging(input)).toBe(input);
        });

        it('redacts multiple patterns in a single string', () => {
            const input = 'https://user:pass@host.com apikey=abc123 Authorization: Basic dXNlcjpwYXNz';
            const result = logger.sanitizeForLogging(input);
            expect(result).not.toContain('pass@');
            expect(result).not.toContain('abc123');
            expect(result).not.toContain('dXNlcjpwYXNz');
        });
    });

    // ──────────────────────────────────────────────
    // setupOutputChannel
    // ──────────────────────────────────────────────
    describe('setupOutputChannel', () => {
        it('appends blank line and shows channel by default', () => {
            logger.setupOutputChannel();
            expect(channel.appendLine).toHaveBeenCalledWith('');
            expect(channel.show).toHaveBeenCalledWith(true);
        });

        it('skips when skipSetup is true', () => {
            logger.setupOutputChannel(true);
            expect(channel.appendLine).not.toHaveBeenCalled();
            expect(channel.show).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // logOutput
    // ──────────────────────────────────────────────
    describe('logOutput', () => {
        it('logs command, stdout, and stderr with sanitization', () => {
            logger.logOutput('dotnet add pkg --password "secret"', 'output text', '', true);
            expect(channel.info).toHaveBeenCalledWith(expect.stringContaining('[REDACTED]'));
            expect(channel.debug).toHaveBeenCalledWith('output text');
        });

        it('logs stderr as warning on success', () => {
            logger.logOutput('cmd', '', 'some warning', true);
            expect(channel.warn).toHaveBeenCalledWith(expect.stringContaining('[stderr]'));
        });

        it('logs stderr as error on failure', () => {
            logger.logOutput('cmd', '', 'error details', false);
            expect(channel.error).toHaveBeenCalledWith(expect.stringContaining('[stderr]'));
        });

        it('skips empty stdout/stderr', () => {
            logger.logOutput('cmd', '', '', true);
            expect(channel.debug).not.toHaveBeenCalled();
            expect(channel.warn).not.toHaveBeenCalled();
            expect(channel.error).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // logSuccess / logWarning / logError
    // ──────────────────────────────────────────────
    describe('logSuccess', () => {
        it('logs with checkmark prefix', () => {
            logger.logSuccess('installed package');
            expect(channel.info).toHaveBeenCalledWith('✓ installed package');
        });
    });

    describe('logWarning', () => {
        it('logs with warning prefix', () => {
            logger.logWarning('cache miss');
            expect(channel.warn).toHaveBeenCalledWith('⚠ cache miss');
        });
    });

    describe('logError', () => {
        it('logs with error prefix', () => {
            logger.logError('failed to install');
            expect(channel.error).toHaveBeenCalledWith('✗ failed to install');
        });
    });

    // ──────────────────────────────────────────────
    // logBulkOperationHeader
    // ──────────────────────────────────────────────
    describe('logBulkOperationHeader', () => {
        it('formats header with package count when count > 0', () => {
            logger.logBulkOperationHeader('Updating', 5);
            expect(channel.info).toHaveBeenCalledWith('Updating 5 packages...');
            expect(channel.info).toHaveBeenCalledWith('='.repeat('Updating 5 packages...'.length));
        });

        it('uses operationType as full header when count is 0', () => {
            logger.logBulkOperationHeader('Removing all packages from Project.csproj...', 0);
            expect(channel.info).toHaveBeenCalledWith('Removing all packages from Project.csproj...');
        });

        it('logs separator line with matching length', () => {
            logger.logBulkOperationHeader('Test', 3);
            const header = 'Test 3 packages...';
            expect(channel.info).toHaveBeenCalledWith('='.repeat(header.length));
        });
    });
});
