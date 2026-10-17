import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { compare, compareText, normalize, parseVersion, sortDescending, type NuGetVersion } from './NuGetVersion';

/** The rows of a markdown table under `heading` in CONFORMANCE.md, as the backtick-quoted cells of each row. */
function tableRows(heading: string): string[][] {
    const text = fs.readFileSync(path.join(__dirname, 'CONFORMANCE.md'), 'utf8');
    const start = text.indexOf(`## ${heading}`);
    if (start < 0) {
        throw new Error(`CONFORMANCE.md has no section ${heading}`);
    }
    const end = text.indexOf('\n## ', start + 1);
    const section = end < 0 ? text.slice(start) : text.slice(start, end);
    return section.split('\n')
        .filter(line => line.startsWith('| `'))
        .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()).filter(cell => /^`[^`]*`$/.test(cell)).map(cell => cell.slice(1, -1)));
}

const RELATION: Record<string, -1 | 0 | 1> = { '<': -1, '=': 0, '>': 1 };

describe('NuGetVersion conformance table (CONFORMANCE.md)', () => {
    const normalization = tableRows('Normalization');
    const precedence = tableRows('Precedence');
    const rejected = tableRows('Not a version');

    it('has rows in every table', () => {
        expect(normalization.length).toBeGreaterThanOrEqual(10);
        expect(precedence.length).toBeGreaterThanOrEqual(15);
        expect(rejected.length).toBeGreaterThanOrEqual(8);
    });

    it.each(normalization)('normalizes %s to %s', (input, expected) => {
        expect(normalize(input)).toBe(expected);
    });

    it.each(precedence)('%s %s %s', (left, relation, right) => {
        expect(compareText(left, right)).toBe(RELATION[relation]);
        expect(compareText(right, left)).toBe(-RELATION[relation] || 0);
    });

    it.each(rejected)('%s is not a version', input => {
        expect(parseVersion(input)).toBeUndefined();
        expect(normalize(input)).toBeUndefined();
        expect(compareText(input, '1.0.0')).toBeUndefined();
    });
});

/** A small deterministic generator (mulberry32): a failing law names its seed, so the case can be replayed. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LETTERS = ['alpha', 'Alpha', 'beta', 'BETA', 'rc', 'preview', 'Preview', 'a', 'zzz', 'x1', 'build-7'];

function versionText(next: () => number): string {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
    const number = (): string => {
        const value = String(Math.floor(next() * 4) === 0 ? 0 : Math.floor(next() * 12));
        return next() < 0.15 ? `0${value}` : value;
    };
    const parts = Array.from({ length: 1 + Math.floor(next() * 4) }, number);
    let text = parts.join('.');
    if (next() < 0.5) {
        // Numeric identifiers without leading zeros (CONFORMANCE.md, "Not covered").
        const identifiers = Array.from({ length: 1 + Math.floor(next() * 3) }, () => (next() < 0.4 ? String(Math.floor(next() * 12)) : pick(LETTERS)));
        text += `-${identifiers.join('.')}`;
    }
    if (next() < 0.2) {
        text += `+${pick(['sha.abc', 'build.5', 'ci'])}`;
    }
    return text;
}

function generate(seed: number, count: number): Array<{ text: string; version: NuGetVersion }> {
    const next = random(seed);
    return Array.from({ length: count }, () => {
        const text = versionText(next);
        const version = parseVersion(text);
        if (version === undefined) {
            throw new Error(`seed ${seed}: the generator made an unparsable version ${text}`);
        }
        return { text, version };
    });
}

const SEEDS = [1, 7, 42, 2026, 31337];
const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0);

describe('NuGetVersion laws on generated versions', () => {
    it.each(SEEDS)('normalize is idempotent and keeps the version (seed %i)', seed => {
        for (const { text, version } of generate(seed, 300)) {
            const normalized = normalize(text) as string;
            expect(normalize(normalized), `seed ${seed}: ${text}`).toBe(normalized);
            expect(compare(parseVersion(normalized) as NuGetVersion, version), `seed ${seed}: ${text}`).toBe(0);
        }
    });

    it.each(SEEDS)('compare is reflexive, antisymmetric and transitive (seed %i)', seed => {
        const versions = generate(seed, 60);
        for (const a of versions) {
            expect(compare(a.version, a.version), `seed ${seed}: ${a.text}`).toBe(0);
            for (const b of versions) {
                expect(compare(a.version, b.version), `seed ${seed}: ${a.text} vs ${b.text}`).toBe(-compare(b.version, a.version) || 0);
                for (const c of versions) {
                    if (compare(a.version, b.version) <= 0 && compare(b.version, c.version) <= 0) {
                        expect(compare(a.version, c.version), `seed ${seed}: ${a.text} ≤ ${b.text} ≤ ${c.text}`).toBeLessThanOrEqual(0);
                    }
                }
            }
        }
    });

    it.each(SEEDS)('equal precedence is equal normalized text, ignoring case (seed %i)', seed => {
        const versions = generate(seed, 150);
        for (const a of versions) {
            for (const b of versions) {
                const sameText = (normalize(a.text) as string).toLowerCase() === (normalize(b.text) as string).toLowerCase();
                expect(compare(a.version, b.version) === 0, `seed ${seed}: ${a.text} vs ${b.text}`).toBe(sameText);
            }
        }
    });

    it.each(SEEDS)('metadata never changes the precedence (seed %i)', seed => {
        for (const { text, version } of generate(seed, 300)) {
            const plain = text.split('+')[0];
            expect(compareText(`${plain}+meta.1`, text), `seed ${seed}: ${text}`).toBe(0);
            expect(compare(parseVersion(plain) as NuGetVersion, version), `seed ${seed}: ${text}`).toBe(0);
        }
    });

    it.each(SEEDS)('sortDescending is in non-increasing order (seed %i)', seed => {
        const sorted = sortDescending(generate(seed, 200).map(entry => entry.text));
        for (let i = 1; i < sorted.length; i++) {
            expect(sign(compareText(sorted[i - 1], sorted[i]) as number), `seed ${seed}: ${sorted[i - 1]} before ${sorted[i]}`).toBeGreaterThanOrEqual(0);
        }
    });
});
