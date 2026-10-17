/**
 * README rendering of the 2.0 details pane, ported from 1.x (`src/webview/app/markdownSetup.ts`, which the import
 * fence keeps out of reach): marked with highlight.js, then DOMPurify. Three changes from 1.x:
 * - no code-block renderer: 1.x put a copy button into the HTML that the sanitizer then removed (`button` is a
 *   forbidden tag); `addCopyButtons` adds it to the sanitized DOM instead;
 * - `<style>` and `style` attributes are removed (ADR-006: the CSP has no `'unsafe-inline'`);
 * - images are fetched by the host (`readme/image`): the CSP's `img-src` allows `data:` only, so every image goes
 *   through `rewriteImages`.
 * This module is the main panel's alone: its module-level setup would otherwise be kept in the sidebar bundle (N63).
 */

import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import fsharp from 'highlight.js/lib/languages/fsharp';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

const LANGUAGES = { csharp, fsharp, xml, json, bash, powershell, sql, yaml, javascript, typescript, css, dockerfile, markdown, ini, plaintext };
const ALIASES: Record<string, keyof typeof LANGUAGES> = {
    cs: 'csharp', fs: 'fsharp', html: 'xml', shell: 'bash', ps1: 'powershell', yml: 'yaml', js: 'javascript', ts: 'typescript',
    docker: 'dockerfile', md: 'markdown', toml: 'ini', text: 'plaintext',
};

/** How a code block's language is named on its copy button. */
const LANGUAGE_NAMES: Record<string, string> = {
    csharp: 'C#', fsharp: 'F#', xml: 'XML', json: 'JSON', bash: 'Bash', powershell: 'PowerShell', sql: 'SQL', yaml: 'YAML',
    javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS', dockerfile: 'Dockerfile', markdown: 'Markdown', ini: 'INI',
    plaintext: 'Text',
};

let renderer: Marked | undefined;

/** Built on first use, not at module load: nothing here runs in a bundle until a README is shown. */
function markdownRenderer(): Marked {
    if (renderer === undefined) {
        // Highlighted tokens carry `nuiget-hljs-*` classes: every class a 2.0 stylesheet styles has the prefix.
        hljs.configure({ classPrefix: 'nuiget-hljs-' });
        for (const [name, language] of Object.entries(LANGUAGES)) {
            hljs.registerLanguage(name, language);
        }
        for (const [alias, name] of Object.entries(ALIASES)) {
            hljs.registerAliases(alias, { languageName: name });
        }
        renderer = new Marked(
            markedHighlight({
                langPrefix: 'nuiget-hljs language-',
                highlight(code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    // A malformed block in a README must not throw.
                    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
                },
            }),
            { breaks: true, gfm: true },
        );
    }
    return renderer;
}

// Hosts known to serve https: an `http:` URL to one of them is upgraded before the host is asked for the image (the
// host answers nothing for `http:`).
const HTTPS_HOSTS = 'img\\.shields\\.io|shields\\.io|github\\.com|raw\\.githubusercontent\\.com|user-images\\.githubusercontent\\.com|'
    + 'avatars\\.githubusercontent\\.com|camo\\.githubusercontent\\.com|badge\\.fury\\.io|travis-ci\\.org|travis-ci\\.com|ci\\.appveyor\\.com|'
    + 'codecov\\.io|coveralls\\.io|david-dm\\.org|snyk\\.io|api\\.codacy\\.com|sonarcloud\\.io|img\\.badgesize\\.io|badgen\\.net|flat\\.badgen\\.net';

/** `http://` URLs of hosts known to serve https become `https://` (1.x `upgradeHttpToHttps`). */
export function upgradeHttpToHttps(text: string): string {
    return text.replace(new RegExp(`http://(?:www\\.)?(${HTTPS_HOSTS})`, 'gi'), 'https://$1');
}

/** The README as sanitized HTML: no script, style, form element or `style` attribute survives. */
export function renderMarkdownToHtml(text: string): string {
    const html = markdownRenderer().parse(upgradeHttpToHttps(text), { async: false });
    return DOMPurify.sanitize(html, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button'],
        // `srcset` would load images past `rewriteImages`, which the CSP refuses.
        FORBID_ATTR: ['style', 'srcset'],
    });
}

const languageOf = (code: Element): string => {
    const match = /language-([\w-]+)/.exec(code.className);
    const name = match ? (ALIASES[match[1].toLowerCase()] ?? match[1].toLowerCase()) : '';
    return LANGUAGE_NAMES[name] ?? (name ? name.toUpperCase() : 'Code');
};

/**
 * Puts a copy button over every code block of the sanitized README. The buttons are made here, after sanitizing, so
 * the sanitizer can keep refusing `<button>` from the README itself; a click is handled by `copyCodeOf`.
 */
/** How long a copy button says Copied. */
export const COPIED_MS = 2000;

const SVG_NS = 'http://www.w3.org/2000/svg';
// GitHub Octicons (MIT): copy-16 and check-16, the icons 1.x showed.
const COPY_PATHS = [
    'M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z',
    'M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
];
const CHECK_PATHS = ['M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z'];

/** A 16 px icon of the copy button in its own span; the CSS shows the copy or the check icon by `data-copied`. */
function iconSpan(kind: 'copy' | 'check', paths: readonly string[]): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = `nuiget-readme-copy-icon nuiget-readme-copy-icon--${kind}`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [name, value] of [['width', '16'], ['height', '16'], ['viewBox', '0 0 16 16'], ['fill', 'currentColor'], ['aria-hidden', 'true']]) {
        svg.setAttribute(name, value);
    }
    for (const d of paths) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.append(path);
    }
    span.append(svg);
    return span;
}

export function addCopyButtons(container: HTMLElement): void {
    for (const pre of container.querySelectorAll('pre')) {
        const code = pre.querySelector('code');
        if (code === null || pre.parentElement?.classList.contains('nuiget-readme-code')) {
            continue;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'nuiget-readme-code';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nuiget-readme-copy';
        const language = languageOf(code);
        const label = document.createElement('span');
        label.className = 'nuiget-readme-copy-label';
        label.textContent = language;
        button.append(iconSpan('copy', COPY_PATHS), iconSpan('check', CHECK_PATHS), label);
        button.dataset.language = language;
        button.setAttribute('aria-label', `Copy ${language} code`);
        pre.replaceWith(wrapper);
        wrapper.append(button, pre);
    }
}

/** The copy button `target` is in, or `undefined` for any other element. */
export function copyButtonOf(target: EventTarget | null): HTMLButtonElement | undefined {
    const button = target instanceof Element ? target.closest('.nuiget-readme-copy') : null;
    return button instanceof HTMLButtonElement ? button : undefined;
}

/** The button says Copied and shows the check icon. */
export function markCopied(button: HTMLButtonElement): void {
    button.setAttribute('data-copied', '');
    const label = button.querySelector('.nuiget-readme-copy-label');
    if (label !== null) {
        label.textContent = 'Copied';
    }
}

/** The button shows its language and the copy icon again. */
export function clearCopied(button: HTMLButtonElement): void {
    button.removeAttribute('data-copied');
    const label = button.querySelector('.nuiget-readme-copy-label');
    if (label !== null) {
        label.textContent = button.dataset.language ?? '';
    }
}

/** The text of the code block whose copy button `target` is in, or `undefined` for any other element. */
export function copyCodeOf(target: EventTarget | null): string | undefined {
    const button = target instanceof Element ? target.closest('.nuiget-readme-copy') : null;
    // marked ends every block with a newline; the copy leaves it out.
    return button?.parentElement?.querySelector('pre code')?.textContent?.replace(/\n$/, '') ?? undefined;
}

/** How many README images are asked of the host at a time. */
export const IMAGE_CONCURRENCY = 4;

/**
 * Replaces every image source of the README with what the host fetched (`fetchImage` returns a `data:` URI or
 * `null`). An image the host could not fetch, or whose URL is not `https:`, is replaced by its alt text. Stops when
 * `signal` aborts (another README, another package).
 */
export async function rewriteImages(container: HTMLElement, fetchImage: (url: string) => Promise<string | null>, signal: AbortSignal): Promise<void> {
    const images = [...container.querySelectorAll('img')];
    const replaceByAlt = (image: HTMLImageElement): void => {
        const alt = image.getAttribute('alt') ?? '';
        image.replaceWith(document.createTextNode(alt));
    };
    const queue = images.map(image => {
        const url = upgradeHttpToHttps(image.getAttribute('src') ?? '');
        // No request for the image until the host answers; the CSP would refuse it anyway.
        image.removeAttribute('src');
        return { image, url };
    });
    const worker = async (): Promise<void> => {
        for (let next = queue.shift(); next !== undefined && !signal.aborted; next = queue.shift()) {
            const { image, url } = next;
            if (!url.startsWith('https://')) {
                replaceByAlt(image);
                continue;
            }
            const dataUri = await fetchImage(url).catch(() => null);
            if (signal.aborted) {
                return;
            }
            if (dataUri?.startsWith('data:')) {
                image.setAttribute('src', dataUri);
            } else {
                replaceByAlt(image);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, images.length) }, () => worker()));
}
