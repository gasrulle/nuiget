import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml, upgradeHttpToHttps } from './markdownSetup';

// ─── upgradeHttpToHttps ──────────────────────────────────────────────────────

describe('upgradeHttpToHttps', () => {
    it('upgrades http://img.shields.io to https', () => {
        const input = '![badge](http://img.shields.io/badge/test)';
        expect(upgradeHttpToHttps(input)).toContain('https://img.shields.io');
        expect(upgradeHttpToHttps(input)).not.toContain('http://img.shields.io');
    });

    it('upgrades http://github.com to https', () => {
        expect(upgradeHttpToHttps('http://github.com/repo')).toBe('https://github.com/repo');
    });

    it('upgrades http://raw.githubusercontent.com', () => {
        expect(upgradeHttpToHttps('http://raw.githubusercontent.com/img.png'))
            .toBe('https://raw.githubusercontent.com/img.png');
    });

    it('does not modify already-https URLs', () => {
        const input = 'https://img.shields.io/badge/test';
        expect(upgradeHttpToHttps(input)).toBe(input);
    });

    it('does not modify unknown domains', () => {
        const input = 'http://example.com/image.png';
        expect(upgradeHttpToHttps(input)).toBe(input);
    });

    it('handles multiple URLs in same content', () => {
        const input = 'http://github.com and http://codecov.io';
        const result = upgradeHttpToHttps(input);
        expect(result).toContain('https://github.com');
        expect(result).toContain('https://codecov.io');
    });

    it('is case-insensitive', () => {
        expect(upgradeHttpToHttps('http://GitHub.COM/repo')).toBe('https://GitHub.COM/repo');
    });
});

// ─── renderMarkdownToHtml ────────────────────────────────────────────────────

describe('renderMarkdownToHtml', () => {
    it('renders basic markdown to HTML', () => {
        const result = renderMarkdownToHtml('# Hello');
        expect(result).toContain('<h1');
        expect(result).toContain('Hello');
    });

    it('renders paragraphs', () => {
        const result = renderMarkdownToHtml('Hello world');
        expect(result).toContain('<p>');
    });

    it('renders links', () => {
        const result = renderMarkdownToHtml('[Click](https://example.com)');
        expect(result).toContain('<a');
        expect(result).toContain('https://example.com');
    });

    it('renders code blocks with syntax highlighting', () => {
        const result = renderMarkdownToHtml('```csharp\nvar x = 1;\n```');
        expect(result).toContain('hljs');
        expect(result).toContain('code-block-wrapper');
    });

    it('adds copy icon and language label to code blocks', () => {
        const result = renderMarkdownToHtml('```json\n{}\n```');
        expect(result).toContain('copy-icon');
        expect(result).toContain('code-lang-label');
        expect(result).toContain('JSON');
    });

    it('strips script tags (XSS prevention)', () => {
        const result = renderMarkdownToHtml('<script>alert("xss")</script>');
        expect(result).not.toContain('<script');
        expect(result).not.toContain('alert');
    });

    it('strips style tags', () => {
        const result = renderMarkdownToHtml('<style>body { color: red }</style>');
        expect(result).not.toContain('<style');
    });

    it('strips form elements', () => {
        const result = renderMarkdownToHtml('<form action="/"><input type="text"></form>');
        expect(result).not.toContain('<form');
        expect(result).not.toContain('<input');
    });

    it('strips style attributes', () => {
        const result = renderMarkdownToHtml('<div style="color:red">text</div>');
        expect(result).not.toContain('style=');
    });

    it('upgrades HTTP URLs for known domains', () => {
        const result = renderMarkdownToHtml('![badge](http://img.shields.io/badge/test)');
        expect(result).toContain('https://img.shields.io');
    });

    it('supports GFM tables', () => {
        const md = '| Col |\n|-----|\n| val |';
        const result = renderMarkdownToHtml(md);
        expect(result).toContain('<table');
    });

    it('renders inline code', () => {
        const result = renderMarkdownToHtml('Use `dotnet add`');
        expect(result).toContain('<code>');
        expect(result).toContain('dotnet add');
    });

    it('renders bold and italic', () => {
        const result = renderMarkdownToHtml('**bold** and *italic*');
        expect(result).toContain('<strong>bold</strong>');
        expect(result).toContain('<em>italic</em>');
    });
});
