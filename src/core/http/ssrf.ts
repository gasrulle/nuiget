import * as net from 'net';

/**
 * Pure helpers for redirect handling: address classification, the single redirect-target
 * safety check and URL redaction for logs. No I/O; the DNS-based re-validation lives in the
 * transport because it needs an injectable resolver.
 */

export type AddressClass = 'public' | 'private' | 'loopback' | 'link-local' | 'unspecified' | 'multicast' | 'reserved';

export interface RedirectSafetyOptions {
    /** Treat loopback targets as public. Only for tests that run local servers. */
    allowLoopback?: boolean;
}

export interface RedirectResolution {
    /** Absolute redirect target. */
    url: string;
    /** `Authorization` value to forward; set only for same-origin redirects. */
    forwardAuth: string | undefined;
    /** True for 303 responses, which must be re-issued as GET. */
    switchToGet: boolean;
}

const MAX_U16 = 0xffff;

function classifyIPv4Octets(a: number, b: number, c: number): AddressClass {
    if (a === 0) {
        return 'unspecified';
    }
    if (a === 127) {
        return 'loopback';
    }
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
        return 'private';
    }
    if (a === 169 && b === 254) {
        return 'link-local';
    }
    if (a >= 224 && a <= 239) {
        return 'multicast';
    }
    if (a >= 240) {
        return 'reserved';
    }
    // 198.18.0.0/15 (benchmarking) and the /24 blocks 192.0.0.0, 192.0.2.0, 198.51.100.0 and 203.0.113.0 are never
    // routable; the rest of 192.0/16, 198.51/16 and 203.0/16 is ordinary public address space (finding N49).
    if ((a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) {
        return 'reserved';
    }
    return 'public';
}

function classifyIPv4(address: string): AddressClass | undefined {
    if (!net.isIPv4(address)) {
        return undefined;
    }
    const [a, b, c] = address.split('.').map(Number);
    return classifyIPv4Octets(a, b, c);
}

/** Parses an IPv6 literal (optionally bracketed, with zone id) into eight 16-bit groups. */
export function parseIPv6(address: string): number[] | undefined {
    let text = address.trim().replace(/^\[|\]$/g, '');
    const zoneIndex = text.indexOf('%');
    if (zoneIndex !== -1) {
        text = text.slice(0, zoneIndex);
    }
    if (!net.isIPv6(text)) {
        return undefined;
    }
    const lastColon = text.lastIndexOf(':');
    const tail = text.slice(lastColon + 1);
    if (tail.includes('.')) {
        const octets = tail.split('.').map(Number);
        if (octets.length !== 4 || octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) {
            return undefined;
        }
        text = `${text.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }
    const halves = text.split('::');
    if (halves.length > 2) {
        return undefined;
    }
    const toGroups = (part: string): number[] | undefined => {
        if (part === '') {
            return [];
        }
        const groups = part.split(':').map(g => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
        return groups.some(Number.isNaN) ? undefined : groups;
    };
    const head = toGroups(halves[0]);
    const rest = halves.length === 2 ? toGroups(halves[1]) : [];
    if (!head || !rest) {
        return undefined;
    }
    const missing = 8 - head.length - rest.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0)) {
        return undefined;
    }
    const groups = [...head, ...new Array<number>(missing).fill(0), ...rest];
    return groups.every(g => g >= 0 && g <= MAX_U16) ? groups : undefined;
}

function classifyIPv6Groups(groups: number[]): AddressClass {
    // An IPv4 address carried in two groups: `hi` holds the first two octets, `lo` the last two.
    const embeddedV4 = (hi: number, lo: number): AddressClass => classifyIPv4Octets(hi >> 8, hi & 0xff, lo >> 8);
    const leadingZero = groups.slice(0, 5).every(g => g === 0);
    if (groups.every(g => g === 0)) {
        return 'unspecified';
    }
    if (leadingZero && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
        return 'loopback';
    }
    // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d) addresses.
    if (leadingZero && (groups[5] === 0xffff || groups[5] === 0)) {
        return embeddedV4(groups[6], groups[7]);
    }
    // NAT64 well-known prefix 64:ff9b::/96.
    if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(g => g === 0)) {
        return embeddedV4(groups[6], groups[7]);
    }
    // 6to4 (2002::/16) embeds the IPv4 address in the next 32 bits.
    if (groups[0] === 0x2002) {
        return embeddedV4(groups[1], groups[2]);
    }
    if ((groups[0] & 0xffc0) === 0xfe80) {
        return 'link-local';
    }
    if ((groups[0] & 0xfe00) === 0xfc00) {
        return 'private';
    }
    if ((groups[0] & 0xff00) === 0xff00) {
        return 'multicast';
    }
    return 'public';
}

/** Classifies an IP literal; `undefined` when the input is not an IP address. */
export function classifyAddress(address: string): AddressClass | undefined {
    const v4 = classifyIPv4(address);
    if (v4) {
        return v4;
    }
    const groups = parseIPv6(address);
    return groups ? classifyIPv6Groups(groups) : undefined;
}

/** True unless `address` is an IP literal that is publicly routable (non-IP input fails closed). */
export function isPrivateAddress(address: string): boolean {
    return classifyAddress(address) !== 'public';
}

function bareHostname(url: URL): string {
    return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** `localhost`, `*.localhost` and the trailing-dot variants always mean the local machine. */
export function isLocalhostName(hostname: string): boolean {
    const name = hostname.toLowerCase().replace(/\.$/, '');
    return name === 'localhost' || name.endsWith('.localhost');
}

/**
 * String-level redirect safety: no scheme downgrade, http(s) only, and no loopback/private/
 * link-local/reserved IP literals unless the target is the host we are already talking to.
 */
export function isSafeRedirectTarget(redirectUrl: string, originalUrl: string, options: RedirectSafetyOptions = {}): boolean {
    let target: URL;
    let original: URL;
    try {
        original = new URL(originalUrl);
        target = new URL(redirectUrl, originalUrl);
    } catch {
        return false;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return false;
    }
    if (original.protocol === 'https:' && target.protocol === 'http:') {
        return false;
    }
    const host = bareHostname(target);
    if (host === '') {
        return false;
    }
    if (host === bareHostname(original)) {
        return true;
    }
    if (isLocalhostName(host)) {
        return options.allowLoopback === true;
    }
    const addressClass = classifyAddress(host);
    if (addressClass === undefined) {
        return true;
    }
    return addressClass === 'public' || (addressClass === 'loopback' && options.allowLoopback === true);
}

/** True for the status codes a GET/HEAD client follows. */
export function isRedirectStatus(status: number | undefined): status is 301 | 302 | 303 | 307 | 308 {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Resolves a redirect response into the next request, or `undefined` when the response is not
 * a followable redirect (wrong status, missing/malformed `Location`, unsafe target).
 */
export function resolveRedirect(
    currentUrl: string,
    status: number | undefined,
    location: string | undefined,
    authHeader?: string,
    options: RedirectSafetyOptions = {},
): RedirectResolution | undefined {
    if (!isRedirectStatus(status) || !location) {
        return undefined;
    }
    let target: URL;
    let current: URL;
    try {
        current = new URL(currentUrl);
        target = new URL(location, currentUrl);
    } catch {
        return undefined;
    }
    if (!isSafeRedirectTarget(target.href, current.href, options)) {
        return undefined;
    }
    return {
        url: target.href,
        forwardAuth: target.origin === current.origin ? authHeader : undefined,
        switchToGet: status === 303,
    };
}

const SENSITIVE_QUERY_PARAM = /token|secret|password|pwd|api[-_]?key|^key$|^sig(nature)?$|^auth(orization)?$|credential|^sas$|^code$/i;

/** Removes userinfo and credential-looking query values so URLs can be logged. */
export function redactUrl(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.username || parsed.password) {
            parsed.username = '***';
            parsed.password = '';
        }
        let changed = false;
        for (const key of [...parsed.searchParams.keys()]) {
            if (SENSITIVE_QUERY_PARAM.test(key)) {
                parsed.searchParams.set(key, '***');
                changed = true;
            }
        }
        return changed || parsed.username ? parsed.href : url;
    } catch {
        return url.replace(/\/\/[^/@\s]+@/, '//***@');
    }
}
