import { describe, expect, it } from 'vitest';
import { redact, redactArgv } from './index';

const REDACTED = '[REDACTED]';

describe('redact', () => {
    // Ported from the 1.x tests of `sanitizeForLogging`. The secret must be gone in every case; the exact
    // replacement text follows this module, which differs from 1.x in form (no quotes, whole userinfo).

    it('returns empty and missing input unchanged', () => {
        expect(redact('')).toBe('');
        expect(redact(undefined as unknown as string)).toBeUndefined();
        expect(redact(null as unknown as string)).toBeNull();
    });

    it('redacts URLs with embedded credentials', () => {
        const result = redact('Fetching from https://user:p4ssw0rd@myhost.com/nuget/v3/index.json');
        expect(result).toBe(`Fetching from https://${REDACTED}@myhost.com/nuget/v3/index.json`);
        expect(result).not.toContain('p4ssw0rd');
        expect(result).not.toContain('user:');
    });

    it('redacts CLI password arguments', () => {
        const result = redact('dotnet nuget add source "url" --password "my-secret-pass"');
        expect(result).toBe(`dotnet nuget add source "url" --password ${REDACTED}`);
        expect(result).not.toContain('my-secret-pass');
    });

    it('redacts the short -p password flag', () => {
        const result = redact('some command -p secret123');
        expect(result).toBe(`some command -p ${REDACTED}`);
        expect(result).not.toContain('secret123');
    });

    it('redacts API key patterns (key=value)', () => {
        const result = redact('Request with apikey=abc123xyz and access_token=tok456');
        expect(result).toBe(`Request with apikey=${REDACTED} and access_token=${REDACTED}`);
        expect(result).not.toContain('abc123xyz');
        expect(result).not.toContain('tok456');
    });

    it('redacts Authorization headers', () => {
        const result = redact('Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(result).toBe(`Authorization: ${REDACTED}`);
        expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(result).not.toContain('Bearer');
    });

    it('redacts the X-NuGet-ApiKey header', () => {
        const result = redact('X-NuGet-ApiKey=my-api-key-value');
        expect(result).toContain('X-NuGet-ApiKey');
        expect(result).toContain(REDACTED);
        expect(result).not.toContain('my-api-key-value');
    });

    it('redacts ClearTextPassword in NuGet config output', () => {
        const result = redact('ClearTextPassword=supersecret');
        expect(result).toBe(`ClearTextPassword=${REDACTED}`);
        expect(result).not.toContain('supersecret');
    });

    it('leaves text without secrets unchanged', () => {
        const input = 'Successfully installed Newtonsoft.Json 13.0.3';
        expect(redact(input)).toBe(input);
    });

    it('redacts multiple patterns in a single string', () => {
        const result = redact('https://user:pass@host.com apikey=abc123 Authorization: Basic dXNlcjpwYXNz');
        expect(result).not.toContain('pass@');
        expect(result).not.toContain('abc123');
        expect(result).not.toContain('dXNlcjpwYXNz');
        expect(result).toContain(`https://${REDACTED}@host.com`);
    });

    // Cases that 1.x let through.

    it('redacts a userinfo that is a token without a password', () => {
        const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
        const result = redact(`GET https://${token}@nuget.pkg.github.com/acme/index.json`);
        expect(result).toBe(`GET https://${REDACTED}@nuget.pkg.github.com/acme/index.json`);
        expect(result).not.toContain(token);

        expect(redact('https://plain-token@feed.example.test/v3/index.json'))
            .toBe(`https://${REDACTED}@feed.example.test/v3/index.json`);
    });

    it('redacts the Proxy-Authorization header', () => {
        const result = redact('Proxy-Authorization: Basic dXNlcjpwYXNz');
        expect(result).toBe(`Proxy-Authorization: ${REDACTED}`);
        expect(result).not.toContain('dXNlcjpwYXNz');
    });

    it('redacts Cookie and Set-Cookie headers', () => {
        const cookie = redact('Cookie: session=abc123; theme=dark');
        expect(cookie).toBe(`Cookie: ${REDACTED}`);
        expect(cookie).not.toContain('abc123');

        const setCookie = redact('Set-Cookie: sid=xyz789; HttpOnly; Secure');
        expect(setCookie).toBe(`Set-Cookie: ${REDACTED}`);
        expect(setCookie).not.toContain('xyz789');
    });

    it('redacts a quoted --password value whole, including its spaces', () => {
        const double = redact('dotnet nuget add source https://f --password "my secret pass" --username me');
        expect(double).toBe(`dotnet nuget add source https://f --password ${REDACTED} --username me`);
        expect(double).not.toContain('secret');

        const single = redact("dotnet nuget add source https://f --password 'single quoted' --username me");
        expect(single).toBe(`dotnet nuget add source https://f --password ${REDACTED} --username me`);
        expect(single).not.toContain('quoted');

        const assigned = redact('--password="with = and spaces" --name feed');
        expect(assigned).not.toContain('with = and spaces');
        expect(assigned).not.toContain('spaces');
        expect(assigned).toContain('--name feed');
    });

    // The remaining patterns of the module.

    it('redacts a header value up to the end of its line and leaves the next line alone', () => {
        const result = redact('Authorization: Bearer abc.def\r\nContent-Type: application/json\nX-Api-Key: k-123');
        expect(result).not.toContain('abc.def');
        expect(result).not.toContain('k-123');
        expect(result).toContain(`Authorization: ${REDACTED}\r\nContent-Type: application/json\n`);
        expect(result).toMatch(/X-Api-Key[:=] ?\[REDACTED\]$/);
    });

    it('redacts secret query-string parameters', () => {
        const signed = redact('GET https://feed.example.test/v3/index.json?take=20&sig=s3cr3t&skip=5');
        expect(signed).toBe(`GET https://feed.example.test/v3/index.json?take=20&sig=${REDACTED}&skip=5`);

        // The text before a secret parameter always survives. What follows it may be redacted with it:
        // the module prefers redacting too much.
        const keyed = redact('GET https://feed.example.test/v3/index.json?api_key=abc123&sig=s3cr3t next');
        expect(keyed).not.toContain('abc123');
        expect(keyed).not.toContain('s3cr3t');
        expect(keyed).toContain(`GET https://feed.example.test/v3/index.json?api_key=${REDACTED}`);
        expect(keyed).toMatch(/ next$/);
    });

    it('redacts credentials in nuget.config XML', () => {
        const result = redact('<add key="Username" value="me" /><add key="ClearTextPassword" value="hunter2" />');
        expect(result).toBe(`<add key="Username" value="me" /><add key="ClearTextPassword" value="${REDACTED}" />`);
    });

    it('redacts JSON Web Tokens and well-known token formats anywhere in the text', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.c2lnbmF0dXJlLXZhbHVl';
        const githubToken = `ghp_${'a1B2'.repeat(9)}`;
        const nugetKey = `oy2${'a1b2c3d4e5'.repeat(4)}abc`;

        const result = redact(`jwt ${jwt} github ${githubToken} nuget ${nugetKey} end`);
        expect(result).toBe(`jwt ${REDACTED} github ${REDACTED} nuget ${REDACTED} end`);
    });

    it('does not take an MSBuild property for a password', () => {
        const input = 'dotnet msbuild App.csproj -p:Configuration=Release -getProperty:TargetFramework';
        expect(redact(input)).toBe(input);
    });

    it('is stable when applied twice', () => {
        const once = redact('https://user:pw@host/x --password "a b" apikey=k Authorization: Basic Zm9v');
        expect(redact(once)).toBe(once);
        const json = redact('{"Username":"VssSessionToken","Password":"abc123SECRET"}');
        expect(redact(json)).toBe(json);
    });

    it('redacts a secret that is the value of a quoted JSON key (N56)', () => {
        for (const [input, secret] of [
            ['{"Username":"VssSessionToken","Password":"abc123SECRET"}', 'abc123SECRET'],
            ['{"token":"tok456"}', 'tok456'],
            ['{"Authorization":"Basic Zm9v"}', 'Zm9v'],
        ]) {
            const output = redact(input);
            expect(output, input).toContain(REDACTED);
            expect(output, input).not.toContain(secret);
            expect(redact(output), input).toBe(output);
        }
        expect(redact('{"Username":"VssSessionToken","Password":"abc123SECRET"}')).toContain('VssSessionToken');
    });
});

describe('redactArgv', () => {
    it('replaces the value that follows a secret option, whatever it contains', () => {
        const argv = ['nuget', 'add', 'source', 'https://feed.example.test', '--password', 'my secret with spaces', '--username', 'me'];
        expect(redactArgv(argv)).toEqual(['nuget', 'add', 'source', 'https://feed.example.test', '--password', REDACTED, '--username', 'me']);
    });

    it('handles the short options, the assignment form and upper case', () => {
        expect(redactArgv(['-p', 'pw', '-k', 'key', '--api-key', 'k2', '--apikey', 'k3']))
            .toEqual(['-p', REDACTED, '-k', REDACTED, '--api-key', REDACTED, '--apikey', REDACTED]);
        expect(redactArgv(['--password=pw', '--API-KEY=abc', '--PASSWORD', 'pw']))
            .toEqual([`--password=${REDACTED}`, `--API-KEY=${REDACTED}`, '--PASSWORD', REDACTED]);
    });

    it('runs every other argument through redact', () => {
        expect(redactArgv(['restore', '--source', 'https://user:pw@feed.example.test/v3/index.json']))
            .toEqual(['restore', '--source', `https://${REDACTED}@feed.example.test/v3/index.json`]);
    });

    it('keeps MSBuild properties, a trailing option without a value, and the input array', () => {
        const argv = ['msbuild', '-p:Configuration=Release', '--password'];
        const result = redactArgv(argv);
        expect(result).toEqual(['msbuild', '-p:Configuration=Release', '--password']);
        expect(result).not.toBe(argv);
        expect(argv).toEqual(['msbuild', '-p:Configuration=Release', '--password']);
    });

    it('returns an empty array for no arguments', () => {
        expect(redactArgv([])).toEqual([]);
    });
});
