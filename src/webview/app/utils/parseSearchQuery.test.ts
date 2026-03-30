import { describe, expect, it } from 'vitest';
import { FILTER_PREFIXES, parseSearchQuery } from './parseSearchQuery';

describe('parseSearchQuery', () => {
    // ─── Default mode (empty / whitespace) ────────────────────────────────
    it('returns default mode for empty string', () => {
        expect(parseSearchQuery('')).toEqual({ mode: 'default', filterText: '' });
    });

    it('returns default mode for whitespace-only', () => {
        expect(parseSearchQuery('   ')).toEqual({ mode: 'default', filterText: '' });
    });

    it('returns default mode for tab/newline whitespace', () => {
        expect(parseSearchQuery('\t\n')).toEqual({ mode: 'default', filterText: '' });
    });

    // ─── Browse mode (plain text) ─────────────────────────────────────────
    it('returns browse mode for plain search text', () => {
        expect(parseSearchQuery('Newtonsoft.Json')).toEqual({ mode: 'browse', filterText: 'Newtonsoft.Json' });
    });

    it('trims whitespace for browse mode filterText', () => {
        expect(parseSearchQuery('  serilog  ')).toEqual({ mode: 'browse', filterText: 'serilog' });
    });

    it('returns browse mode for partial prefix (@install is not @installed)', () => {
        expect(parseSearchQuery('@install')).toEqual({ mode: 'browse', filterText: '@install' });
    });

    it('returns browse mode for @ alone', () => {
        expect(parseSearchQuery('@')).toEqual({ mode: 'browse', filterText: '@' });
    });

    it('returns browse mode for unknown prefix (@foo)', () => {
        expect(parseSearchQuery('@foo')).toEqual({ mode: 'browse', filterText: '@foo' });
    });

    // ─── @installed prefix ────────────────────────────────────────────────
    it('returns installed mode for @installed alone', () => {
        expect(parseSearchQuery('@installed')).toEqual({ mode: 'installed', filterText: '' });
    });

    it('returns installed mode with filterText for @installed query', () => {
        expect(parseSearchQuery('@installed serilog')).toEqual({ mode: 'installed', filterText: 'serilog' });
    });

    it('is case-insensitive for @INSTALLED', () => {
        expect(parseSearchQuery('@INSTALLED')).toEqual({ mode: 'installed', filterText: '' });
    });

    it('is case-insensitive for @Installed with filter', () => {
        expect(parseSearchQuery('@Installed Newtonsoft')).toEqual({ mode: 'installed', filterText: 'Newtonsoft' });
    });

    it('trims the filterText after prefix', () => {
        expect(parseSearchQuery('@installed   json  ')).toEqual({ mode: 'installed', filterText: 'json' });
    });

    // ─── @updates prefix ──────────────────────────────────────────────────
    it('returns updates mode for @updates alone', () => {
        expect(parseSearchQuery('@updates')).toEqual({ mode: 'updates', filterText: '' });
    });

    it('returns updates mode with filterText for @updates query', () => {
        expect(parseSearchQuery('@updates Pkg.A')).toEqual({ mode: 'updates', filterText: 'Pkg.A' });
    });

    it('is case-insensitive for @Updates', () => {
        expect(parseSearchQuery('@Updates')).toEqual({ mode: 'updates', filterText: '' });
    });

    // ─── @vulnerable prefix ───────────────────────────────────────────────
    it('returns vulnerable mode for @vulnerable alone', () => {
        expect(parseSearchQuery('@vulnerable')).toEqual({ mode: 'vulnerable', filterText: '' });
    });

    it('returns vulnerable mode with filterText for @vulnerable query', () => {
        expect(parseSearchQuery('@vulnerable Pkg.B')).toEqual({ mode: 'vulnerable', filterText: 'Pkg.B' });
    });

    it('is case-insensitive for @VULNERABLE', () => {
        expect(parseSearchQuery('@VULNERABLE')).toEqual({ mode: 'vulnerable', filterText: '' });
    });

    // ─── Edge cases ───────────────────────────────────────────────────────
    it('does not match @installedx as @installed prefix', () => {
        // '@installedx' doesn't equal '@installed' and doesn't start with '@installed '
        expect(parseSearchQuery('@installedx')).toEqual({ mode: 'browse', filterText: '@installedx' });
    });

    it('does not match @updatesx as @updates prefix', () => {
        expect(parseSearchQuery('@updatesx')).toEqual({ mode: 'browse', filterText: '@updatesx' });
    });

    it('preserves original case in filterText', () => {
        expect(parseSearchQuery('@installed Newtonsoft.Json')).toEqual({ mode: 'installed', filterText: 'Newtonsoft.Json' });
    });
});

describe('FILTER_PREFIXES', () => {
    it('exports all three filter prefixes', () => {
        expect(FILTER_PREFIXES).toEqual(['@installed', '@updates', '@vulnerable']);
    });

    it('has exactly 3 prefixes', () => {
        expect(FILTER_PREFIXES).toHaveLength(3);
    });
});
