import { describe, expect, it, vi } from 'vitest';
import { addCopyButtons, clearCopied, copyButtonOf, copyCodeOf, IMAGE_CONCURRENCY, markCopied, renderMarkdownToHtml, rewriteImages, upgradeHttpToHttps } from './markdown';

// Ported from 1.x `src/webview/app/markdownSetup.test.ts` (20 titles); the code-block and copy-button titles follow the
// post-sanitize buttons of `addCopyButtons`.

const containerOf = (html: string): HTMLElement => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container;
};

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
        expect(upgradeHttpToHttps('http://raw.githubusercontent.com/img.png')).toBe('https://raw.githubusercontent.com/img.png');
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
        const result = upgradeHttpToHttps('http://github.com and http://codecov.io');
        expect(result).toContain('https://github.com');
        expect(result).toContain('https://codecov.io');
    });

    it('is case-insensitive', () => {
        expect(upgradeHttpToHttps('http://GitHub.COM/repo')).toBe('https://GitHub.COM/repo');
    });
});

describe('renderMarkdownToHtml', () => {
    it('renders basic markdown to HTML', () => {
        const result = renderMarkdownToHtml('# Hello');
        expect(result).toContain('<h1');
        expect(result).toContain('Hello');
    });

    it('renders paragraphs', () => {
        expect(renderMarkdownToHtml('Hello world')).toContain('<p>');
    });

    it('renders links', () => {
        const result = renderMarkdownToHtml('[Click](https://example.com)');
        expect(result).toContain('<a');
        expect(result).toContain('https://example.com');
    });

    it('renders code blocks with syntax highlighting', () => {
        const result = renderMarkdownToHtml('```csharp\nvar x = 1;\n```');
        expect(result).toContain('class="nuiget-hljs language-csharp"');
        expect(result).toContain('nuiget-hljs-keyword');
    });

    it('adds copy icon and language label to code blocks', () => {
        const container = containerOf(renderMarkdownToHtml('```json\n{}\n```'));
        addCopyButtons(container);
        const button = container.querySelector('button.nuiget-readme-copy');
        // The copy and check icons, each in its own span, then the language.
        expect(button?.querySelectorAll('.nuiget-readme-copy-icon > svg')).toHaveLength(2);
        expect(button?.querySelector('.nuiget-readme-copy-icon--copy svg')).toHaveAttribute('aria-hidden', 'true');
        expect(button?.querySelector('.nuiget-readme-copy-label')).toHaveTextContent('JSON');
        expect(button).toHaveAccessibleName('Copy JSON code');
        expect(copyCodeOf(button)).toBe('{}');
        // Once per block, however often it runs.
        addCopyButtons(container);
        expect(container.querySelectorAll('button')).toHaveLength(1);
        expect(copyCodeOf(container.querySelector('pre'))).toBeUndefined();
    });

    it('markCopied swaps the icon and the label and clearCopied restores them', () => {
        const container = containerOf(renderMarkdownToHtml('```json\n{}\n```'));
        addCopyButtons(container);
        const button = copyButtonOf(container.querySelector('.nuiget-readme-copy-label'));
        expect(button).toBeInstanceOf(HTMLButtonElement);
        markCopied(button!);
        expect(button).toHaveAttribute('data-copied');
        expect(button?.querySelector('.nuiget-readme-copy-label')).toHaveTextContent('Copied');
        expect(button).toHaveAccessibleName('Copy JSON code');
        clearCopied(button!);
        expect(button).not.toHaveAttribute('data-copied');
        expect(button?.querySelector('.nuiget-readme-copy-label')).toHaveTextContent('JSON');
        expect(copyButtonOf(container.querySelector('pre'))).toBeUndefined();
    });

    it('strips script tags (XSS prevention)', () => {
        const result = renderMarkdownToHtml('<script>alert("xss")</script>');
        expect(result).not.toContain('<script');
        expect(result).not.toContain('alert');
    });

    it('strips style tags', () => {
        expect(renderMarkdownToHtml('<style>body { color: red }</style>')).not.toContain('<style');
    });

    it('strips form elements', () => {
        const result = renderMarkdownToHtml('<form action="/"><input type="text"></form>');
        expect(result).not.toContain('<form');
        expect(result).not.toContain('<input');
    });

    it('strips style attributes', () => {
        expect(renderMarkdownToHtml('<div style="color:red">text</div>')).not.toContain('style=');
    });

    it('strips srcset, so that every image goes through the host', () => {
        const result = renderMarkdownToHtml('<picture><source srcset="https://example.com/dark.png" media="(prefers-color-scheme: dark)"><img src="https://example.com/light.png" srcset="https://example.com/2x.png 2x" alt="logo"></picture>');
        expect(result).not.toContain('srcset');
        expect(result).toContain('src="https://example.com/light.png"');
    });

    it('upgrades HTTP URLs for known domains', () => {
        expect(renderMarkdownToHtml('![badge](http://img.shields.io/badge/test)')).toContain('https://img.shields.io');
    });

    it('supports GFM tables', () => {
        expect(renderMarkdownToHtml('| Col |\n|-----|\n| val |')).toContain('<table');
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

    it('strips event handlers and javascript: URLs, and keeps a button of the README out', () => {
        const result = renderMarkdownToHtml('<img src="x" onerror="alert(1)"> [a](javascript:alert(2)) <button>press</button>');
        expect(result).not.toContain('onerror');
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('<button');
    });
});

describe('rewriteImages', () => {
    it('asks the host for every https image, after upgrading http URLs of known hosts, and puts the data URI in', async () => {
        const container = containerOf('<img src="http://img.shields.io/a.svg" alt="a"><img src="https://example.com/b.png" alt="b">');
        const fetchImage = vi.fn(async (url: string) => `data:image/png;base64,${url.length}`);

        await rewriteImages(container, fetchImage, new AbortController().signal);

        expect(fetchImage.mock.calls.map(([url]) => url)).toEqual(['https://img.shields.io/a.svg', 'https://example.com/b.png']);
        expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['data:image/png;base64,28', 'data:image/png;base64,25']);
    });

    it('an image the host cannot fetch, or an http one, becomes its alt text', async () => {
        const container = containerOf('<p><img src="https://example.com/gone.png" alt="build status"> <img src="http://example.com/x.png" alt="plain"></p>');
        const fetchImage = vi.fn(async () => null);

        await rewriteImages(container, fetchImage, new AbortController().signal);

        expect(fetchImage).toHaveBeenCalledTimes(1);
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toBe('build status plain');
    });

    it(`asks ${IMAGE_CONCURRENCY} at a time, takes no image off the page before the host answers, and stops on abort`, async () => {
        const container = containerOf(Array.from({ length: 6 }, (_, index) => `<img src="https://example.com/${index}.png" alt="${index}">`).join(''));
        const controller = new AbortController();
        const pending: Array<(value: string) => void> = [];
        const fetchImage = vi.fn(() => new Promise<string>(resolve => pending.push(resolve)));

        const done = rewriteImages(container, fetchImage, controller.signal);
        expect(fetchImage).toHaveBeenCalledTimes(IMAGE_CONCURRENCY);
        expect([...container.querySelectorAll('img')].every(image => !image.hasAttribute('src'))).toBe(true);
        controller.abort();
        pending.forEach(resolve => resolve('data:image/png;base64,AAAA'));
        await done;

        expect(fetchImage).toHaveBeenCalledTimes(IMAGE_CONCURRENCY);
        expect(container.querySelectorAll('img[src]')).toHaveLength(0);
    });
});
