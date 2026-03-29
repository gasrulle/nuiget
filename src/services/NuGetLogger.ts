import * as vscode from 'vscode';

/**
 * Shared logging utility for NuGet services.
 * Wraps a VS Code LogOutputChannel with formatted, security-sanitized output.
 */
export class NuGetLogger {
    constructor(private readonly outputChannel: vscode.LogOutputChannel) { }

    /**
     * Show the output channel before an operation (preserves user focus).
     * Pass skipSetup=true for background operations that should log without stealing focus.
     */
    setupOutputChannel(skipSetup: boolean = false): void {
        if (skipSetup) {
            return;
        }
        this.outputChannel.appendLine('');
        this.outputChannel.show(true);
    }

    /**
     * Sanitize text to remove sensitive information before logging.
     * Redacts: URLs with embedded credentials, API keys, tokens, passwords.
     */
    sanitizeForLogging(text: string): string {
        if (!text) {
            return text;
        }

        let sanitized = text;

        // Redact URLs with embedded credentials (user:password@host)
        sanitized = sanitized.replace(
            /(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi,
            '$1[REDACTED]:[REDACTED]@'
        );

        // Redact CLI-style password arguments (--password "value" or -p "value")
        sanitized = sanitized.replace(
            /(--password|-p)\s+["']?([^"'\s]+)["']?/gi,
            '$1 "[REDACTED]"'
        );

        // Redact common API key patterns (key=value, apikey=value, etc.)
        sanitized = sanitized.replace(
            /(api[-_]?key|apikey|access[-_]?token|auth[-_]?token|bearer|password|secret|credential)[\s]*[=:]\s*['"]?([^\s'"]+)['"]?/gi,
            '$1=[REDACTED]'
        );

        // Redact Authorization headers
        sanitized = sanitized.replace(
            /(Authorization|X-Api-Key|X-NuGet-ApiKey)[\s]*:[\s]*([^\r\n]+)/gi,
            '$1: [REDACTED]'
        );

        // Redact NuGet source credentials that might appear in verbose output
        sanitized = sanitized.replace(
            /(ClearTextPassword|Password|EncryptedPassword)[\s]*[=:]\s*['"]?([^\s'"<>]+)['"]?/gi,
            '$1=[REDACTED]'
        );

        return sanitized;
    }

    /**
     * Log CLI command output with color-coded levels and credential redaction.
     */
    logOutput(command: string, stdout: string, stderr: string, success: boolean = true): void {
        const safeCommand = this.sanitizeForLogging(command);
        const safeStdout = this.sanitizeForLogging(stdout);
        const safeStderr = this.sanitizeForLogging(stderr);

        this.outputChannel.info(`> ${safeCommand}`);

        if (safeStdout && safeStdout.trim()) {
            this.outputChannel.debug(safeStdout.trim());
        }
        if (safeStderr && safeStderr.trim()) {
            if (success) {
                this.outputChannel.warn(`[stderr] ${safeStderr.trim()}`);
            } else {
                this.outputChannel.error(`[stderr] ${safeStderr.trim()}`);
            }
        }

        this.outputChannel.trace('');
    }

    logSuccess(message: string): void {
        this.outputChannel.info(`✓ ${message}`);
    }

    logWarning(message: string): void {
        this.outputChannel.warn(`⚠ ${message}`);
    }

    logError(message: string): void {
        this.outputChannel.error(`✗ ${message}`);
    }

    /**
     * Log a summary header for bulk operations.
     * When packageCount=0, operationType is used as the full header string.
     */
    logBulkOperationHeader(operationType: string, packageCount: number): void {
        const header = packageCount > 0
            ? `${operationType} ${packageCount} packages...`
            : operationType;
        this.outputChannel.info(header);
        this.outputChannel.info('='.repeat(header.length));
        this.outputChannel.trace('');
    }
}
