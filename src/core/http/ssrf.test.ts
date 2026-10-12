import { describe, expect, it } from 'vitest';
import {
    classifyAddress,
    isLocalhostName,
    isPrivateAddress,
    isRedirectStatus,
    isSafeRedirectTarget,
    parseIPv6,
    redactUrl,
    resolveRedirect,
} from './index';

const ORIG = 'https://api.nuget.org/v3/index.json';

// The cases of the first three blocks are ported from the 1.x tests of `Http2Client` (`isSafeRedirectTarget`,
// `isRedirectStatus`, `resolveRedirect`). Where 2.0 decides differently, the test title says so.

describe('isSafeRedirectTarget', () => {
    describe('protocol validation', () => {
        it('allows HTTPS to HTTPS, HTTP to HTTPS and HTTP to HTTP', () => {
            expect(isSafeRedirectTarget('https://other.nuget.org/v3/index.json', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://api.nuget.org/v3/index.json', 'http://api.nuget.org/v3/index.json')).toBe(true);
            expect(isSafeRedirectTarget('http://other.example.com/', 'http://example.com/')).toBe(true);
        });

        it('blocks a downgrade from HTTPS to HTTP, also to the same host', () => {
            expect(isSafeRedirectTarget('http://api.nuget.org/v3/index.json', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('http://other.nuget.org/', ORIG)).toBe(false);
        });

        it('blocks every scheme other than http and https', () => {
            for (const target of ['ftp://evil.com/file', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<h1>hi</h1>']) {
                expect(isSafeRedirectTarget(target, ORIG)).toBe(false);
            }
        });
    });

    describe('loopback detection', () => {
        it('blocks localhost, 127.0.0.1 and ::1', () => {
            expect(isSafeRedirectTarget('https://localhost/api', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://127.0.0.1/api', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[::1]/api', ORIG)).toBe(false);
        });

        it('blocks all of 127.0.0.0/8, not only 127.0.0.1', () => {
            for (const host of ['127.0.0.2', '127.1.2.3', '127.255.255.254']) {
                expect(classifyAddress(host)).toBe('loopback');
                expect(isSafeRedirectTarget(`https://${host}/api`, ORIG)).toBe(false);
            }
        });

        it('blocks localhost names in any spelling', () => {
            for (const host of ['LOCALHOST', 'localhost.', 'api.localhost', 'a.b.localhost']) {
                expect(isSafeRedirectTarget(`https://${host}/api`, ORIG)).toBe(false);
            }
        });
    });

    describe('private IPv4 ranges', () => {
        it('blocks 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16', () => {
            for (const host of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.255.255']) {
                expect(isSafeRedirectTarget(`https://${host}/`, ORIG)).toBe(false);
            }
        });

        it('allows the addresses just outside 172.16.0.0/12', () => {
            expect(isSafeRedirectTarget('https://172.15.0.1/', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://172.32.0.1/', ORIG)).toBe(true);
        });

        it('blocks link-local (the cloud metadata address) and 0.0.0.0', () => {
            expect(isSafeRedirectTarget('https://169.254.169.254/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://0.0.0.0/', ORIG)).toBe(false);
        });

        it('blocks carrier-grade NAT, 100.64.0.0/10, and allows its neighbours', () => {
            for (const host of ['100.64.0.1', '100.100.100.200', '100.127.255.255']) {
                expect(classifyAddress(host)).toBe('private');
                expect(isSafeRedirectTarget(`https://${host}/`, ORIG)).toBe(false);
            }
            for (const host of ['100.63.255.255', '100.128.0.1']) {
                expect(classifyAddress(host)).toBe('public');
                expect(isSafeRedirectTarget(`https://${host}/`, ORIG)).toBe(true);
            }
        });
    });

    describe('private IPv6 ranges', () => {
        it('blocks unique local, link-local and the unspecified address', () => {
            for (const host of ['[fc00::1]', '[fd12::1]', '[fe80::1]', '[::]']) {
                expect(isSafeRedirectTarget(`https://${host}/`, ORIG)).toBe(false);
            }
        });

        it('blocks an IPv4-mapped IPv6 address by the IPv4 address inside it', () => {
            expect(classifyAddress('::ffff:127.0.0.1')).toBe('loopback');
            expect(classifyAddress('::ffff:10.0.0.1')).toBe('private');
            expect(classifyAddress('::ffff:169.254.169.254')).toBe('link-local');
            expect(classifyAddress('::ffff:8.8.8.8')).toBe('public');
            expect(isSafeRedirectTarget('https://[::ffff:127.0.0.1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[::ffff:7f00:1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[::ffff:192.168.1.1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[::ffff:8.8.8.8]/', ORIG)).toBe(true);
        });

        it('blocks a NAT64 address, 64:ff9b::/96, by the IPv4 address inside it', () => {
            expect(classifyAddress('64:ff9b::7f00:1')).toBe('loopback');
            expect(classifyAddress('64:ff9b::a00:1')).toBe('private');
            expect(classifyAddress('64:ff9b::808:808')).toBe('public');
            expect(isSafeRedirectTarget('https://[64:ff9b::7f00:1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[64:ff9b::10.0.0.1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[64:ff9b::808:808]/', ORIG)).toBe(true);
        });

        it('blocks a 6to4 address, 2002::/16, by the IPv4 address inside it', () => {
            expect(classifyAddress('2002:7f00:1::')).toBe('loopback');
            expect(classifyAddress('2002:c0a8:101::1')).toBe('private');
            expect(classifyAddress('2002:808:808::1')).toBe('public');
            expect(isSafeRedirectTarget('https://[2002:7f00:1::]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[2002:c0a8:101::1]/', ORIG)).toBe(false);
            expect(isSafeRedirectTarget('https://[2002:808:808::1]/', ORIG)).toBe(true);
        });

        it('classifies an address with a zone id by the address, and rejects it as a redirect target', () => {
            expect(classifyAddress('fe80::1%eth0')).toBe('link-local');
            expect(classifyAddress('[fe80::1%25en0]')).toBe('link-local');
            expect(classifyAddress('::1%lo0')).toBe('loopback');
            expect(isPrivateAddress('fe80::1%eth0')).toBe(true);
            // A URL cannot carry a zone id; such a Location does not parse and is never followed.
            expect(isSafeRedirectTarget('https://[fe80::1%25eth0]/', ORIG)).toBe(false);
        });
    });

    describe('valid public URLs', () => {
        it('allows public hosts, a port and a relative location', () => {
            expect(isSafeRedirectTarget('https://www.nuget.org/api/v2/', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://api.example.com:8443/v3/', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('/v3/registration/newtonsoft.json/index.json', ORIG)).toBe(true);
            expect(isSafeRedirectTarget('https://[2001:4860:4860::8888]/', ORIG)).toBe(true);
        });
    });

    describe('same-host exemption (new in 2.0)', () => {
        it('lets a private or loopback host redirect to itself', () => {
            expect(isSafeRedirectTarget('https://10.0.0.5/v3/other', 'https://10.0.0.5/v3/index.json')).toBe(true);
            expect(isSafeRedirectTarget('/v3/other', 'https://192.168.1.20/v3/index.json')).toBe(true);
            expect(isSafeRedirectTarget('http://127.0.0.1:5000/b', 'http://127.0.0.1:5000/a')).toBe(true);
            expect(isSafeRedirectTarget('https://localhost/b', 'https://localhost/a')).toBe(true);
            expect(isSafeRedirectTarget('https://[fd12::1]/b', 'https://[fd12::1]/a')).toBe(true);
            expect(isSafeRedirectTarget('https://NAS.local/b', 'https://nas.local/a')).toBe(true);
        });

        it('does not extend to another private host or to a downgrade', () => {
            expect(isSafeRedirectTarget('https://10.0.0.6/', 'https://10.0.0.5/v3/index.json')).toBe(false);
            expect(isSafeRedirectTarget('https://127.0.0.1/', 'https://10.0.0.5/v3/index.json')).toBe(false);
            expect(isSafeRedirectTarget('http://10.0.0.5/v3/other', 'https://10.0.0.5/v3/index.json')).toBe(false);
        });

        it('compares host names, so another port of the same host is allowed', () => {
            expect(isSafeRedirectTarget('https://10.0.0.5:8443/v3/other', 'https://10.0.0.5/v3/index.json')).toBe(true);
        });
    });

    describe('allowLoopback (tests with local servers)', () => {
        it('admits loopback targets and nothing else', () => {
            const options = { allowLoopback: true };
            expect(isSafeRedirectTarget('http://127.0.0.1:5000/', 'http://example.com/', options)).toBe(true);
            expect(isSafeRedirectTarget('http://localhost:5000/', 'http://example.com/', options)).toBe(true);
            expect(isSafeRedirectTarget('http://[::1]:5000/', 'http://example.com/', options)).toBe(true);
            expect(isSafeRedirectTarget('http://10.0.0.1/', 'http://example.com/', options)).toBe(false);
            expect(isSafeRedirectTarget('http://169.254.169.254/', 'http://example.com/', options)).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('rejects when either URL does not parse', () => {
            expect(isSafeRedirectTarget('not-a-url', 'also-not-a-url')).toBe(false);
            expect(isSafeRedirectTarget('http://[::1', ORIG)).toBe(false);
        });

        it('treats an empty location as the original URL', () => {
            expect(isSafeRedirectTarget('', ORIG)).toBe(true);
        });
    });
});

describe('isRedirectStatus', () => {
    it('accepts 301, 302, 307 and 308', () => {
        for (const status of [301, 302, 307, 308]) {
            expect(isRedirectStatus(status)).toBe(true);
        }
    });

    it('accepts 303 (1.x did not follow it)', () => {
        expect(isRedirectStatus(303)).toBe(true);
    });

    it('rejects other status codes and undefined', () => {
        for (const status of [200, 204, 300, 304, 305, 404, 500, undefined]) {
            expect(isRedirectStatus(status)).toBe(false);
        }
    });
});

describe('resolveRedirect', () => {
    it('returns undefined for a status that is not a redirect', () => {
        expect(resolveRedirect(ORIG, 200, 'https://other.nuget.org/')).toBeUndefined();
        expect(resolveRedirect(ORIG, 404, 'https://other.nuget.org/')).toBeUndefined();
        expect(resolveRedirect(ORIG, undefined, 'https://other.nuget.org/')).toBeUndefined();
    });

    it('returns undefined when the Location header is missing or empty', () => {
        expect(resolveRedirect(ORIG, 301, undefined)).toBeUndefined();
        expect(resolveRedirect(ORIG, 302, '')).toBeUndefined();
    });

    it('resolves an absolute and a relative location', () => {
        expect(resolveRedirect(ORIG, 301, 'https://other.nuget.org/v3/data')?.url).toBe('https://other.nuget.org/v3/data');
        expect(resolveRedirect(ORIG, 302, '/v3/registration/pkg/index.json')?.url).toBe('https://api.nuget.org/v3/registration/pkg/index.json');
        expect(resolveRedirect(ORIG, 302, 'page2.json')?.url).toBe('https://api.nuget.org/v3/page2.json');
    });

    it('forwards the Authorization value to the same origin only', () => {
        expect(resolveRedirect(ORIG, 301, 'https://api.nuget.org/v3/other', 'Basic abc123')?.forwardAuth).toBe('Basic abc123');
        expect(resolveRedirect(ORIG, 301, 'https://other.nuget.org/v3/data', 'Basic abc123')?.forwardAuth).toBeUndefined();
        expect(resolveRedirect(ORIG, 301, 'https://api.nuget.org/v3/other')?.forwardAuth).toBeUndefined();
    });

    it('follows a redirect to another port of the same host without forwarding the credential', () => {
        const result = resolveRedirect(ORIG, 302, 'https://api.nuget.org:8443/v3/other', 'Basic abc123');
        expect(result).toEqual({ url: 'https://api.nuget.org:8443/v3/other', forwardAuth: undefined, switchToGet: false });
    });

    it('returns undefined for unsafe targets and for a downgrade', () => {
        for (const location of ['https://127.0.0.1/api', 'https://localhost/api', 'https://10.0.0.1/', 'https://192.168.1.1/', 'http://api.nuget.org/v3/other']) {
            expect(resolveRedirect(ORIG, 302, location)).toBeUndefined();
        }
    });

    it('re-issues a 303 as GET and leaves the method alone for the other codes', () => {
        expect(resolveRedirect(ORIG, 303, 'https://other.nuget.org/done')).toEqual({
            url: 'https://other.nuget.org/done',
            forwardAuth: undefined,
            switchToGet: true,
        });
        for (const status of [301, 302, 307, 308]) {
            const result = resolveRedirect(ORIG, status, 'https://other.nuget.org/');
            expect(result?.url).toBe('https://other.nuget.org/');
            expect(result?.switchToGet).toBe(false);
        }
    });

    it('returns undefined for a malformed location or current URL', () => {
        expect(resolveRedirect(ORIG, 301, 'http://[::1')).toBeUndefined();
        expect(resolveRedirect('not-a-valid-url', 301, 'https://other.nuget.org/')).toBeUndefined();
    });

    it('applies the same-host exemption and the loopback option', () => {
        expect(resolveRedirect('https://10.0.0.5/v3/index.json', 302, '/v3/other', 'Basic abc123')).toEqual({
            url: 'https://10.0.0.5/v3/other',
            forwardAuth: 'Basic abc123',
            switchToGet: false,
        });
        expect(resolveRedirect('http://example.com/', 302, 'http://127.0.0.1:5000/x')).toBeUndefined();
        expect(resolveRedirect('http://example.com/', 302, 'http://127.0.0.1:5000/x', undefined, { allowLoopback: true })?.url)
            .toBe('http://127.0.0.1:5000/x');
    });
});

describe('classifyAddress and isPrivateAddress', () => {
    it.each([
        ['8.8.8.8', 'public'],
        ['1.1.1.1', 'public'],
        ['0.0.0.0', 'unspecified'],
        ['0.1.2.3', 'unspecified'],
        ['10.1.2.3', 'private'],
        ['172.20.0.1', 'private'],
        ['192.168.10.10', 'private'],
        ['169.254.0.1', 'link-local'],
        ['224.0.0.1', 'multicast'],
        ['239.255.255.250', 'multicast'],
        ['240.0.0.1', 'reserved'],
        ['255.255.255.255', 'reserved'],
        ['192.0.2.1', 'reserved'],
        ['198.18.0.1', 'reserved'],
        ['198.51.100.7', 'reserved'],
        ['203.0.113.9', 'reserved'],
        ['::', 'unspecified'],
        ['::1', 'loopback'],
        ['[::1]', 'loopback'],
        ['fe80::1', 'link-local'],
        ['febf::1', 'link-local'],
        ['fc00::1', 'private'],
        ['fdff:ffff::1', 'private'],
        ['ff02::1', 'multicast'],
        ['2001:4860:4860::8888', 'public'],
        ['2606:4700:4700::1111', 'public'],
    ] as const)('classifies %s as %s', (address, expected) => {
        expect(classifyAddress(address)).toBe(expected);
        expect(isPrivateAddress(address)).toBe(expected !== 'public');
    });

    it('returns undefined for text that is not an IP address, and isPrivateAddress fails closed', () => {
        for (const text of ['example.com', '', '999.1.1.1', '1.2.3', 'localhost', '1.2.3.4.5', 'gggg::1']) {
            expect(classifyAddress(text)).toBeUndefined();
            expect(isPrivateAddress(text)).toBe(true);
        }
    });
});

describe('parseIPv6', () => {
    it('expands compressed, bracketed and zoned literals into eight groups', () => {
        expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
        expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        expect(parseIPv6('2001:db8::ff00:42:8329')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329]);
        expect(parseIPv6('[2001:DB8::1]')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
        expect(parseIPv6('fe80::1%eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
        expect(parseIPv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('converts a dotted IPv4 tail into two groups', () => {
        expect(parseIPv6('::ffff:192.168.1.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
        expect(parseIPv6('64:ff9b::10.0.0.1')).toEqual([0x64, 0xff9b, 0, 0, 0, 0, 0x0a00, 0x0001]);
    });

    it('returns undefined for anything that is not an IPv6 literal', () => {
        for (const text of ['', 'gggg::1', '1:2:3', '1::2::3', '192.168.1.1', 'example.com', '1:2:3:4:5:6:7:8:9']) {
            expect(parseIPv6(text)).toBeUndefined();
        }
    });
});

describe('isLocalhostName', () => {
    it('recognises localhost, its subdomains and the trailing-dot forms', () => {
        for (const name of ['localhost', 'LOCALHOST', 'localhost.', 'api.localhost', 'a.b.localhost.']) {
            expect(isLocalhostName(name)).toBe(true);
        }
    });

    it('does not take a name that merely contains the word', () => {
        for (const name of ['localhost.example.com', 'notlocalhost', 'example.com', '']) {
            expect(isLocalhostName(name)).toBe(false);
        }
    });
});

describe('redactUrl', () => {
    it('removes user name and password', () => {
        expect(redactUrl('https://user:p4ss@feed.example.test/v3/index.json')).toBe('https://***@feed.example.test/v3/index.json');
        expect(redactUrl('https://token-only@feed.example.test/v3/index.json')).toBe('https://***@feed.example.test/v3/index.json');
    });

    it('replaces the values of query parameters that look like credentials and keeps the others', () => {
        const redacted = redactUrl('https://feed.example.test/v3/index.json?api_key=abc123&take=20&sig=s3cr3t&code=xyz&key=k1');
        expect(redacted).not.toContain('abc123');
        expect(redacted).not.toContain('s3cr3t');
        expect(redacted).not.toContain('xyz');
        expect(redacted).not.toContain('k1');
        expect(redacted).toContain('take=20');
        expect(redacted).toContain('api_key=');
    });

    it('returns a URL without credentials unchanged', () => {
        const url = 'https://feed.example.test/v3/index.json?take=20&keyboard=us&q=serilog';
        expect(redactUrl(url)).toBe(url);
    });

    it('removes userinfo from text that is not a valid URL', () => {
        expect(redactUrl('see //user:pw@host/path for details')).toBe('see //***@host/path for details');
        expect(redactUrl('no url here')).toBe('no url here');
    });
});
