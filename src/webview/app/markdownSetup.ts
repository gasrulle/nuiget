/**
 * Markdown rendering configuration for package README display.
 * Sets up highlight.js with language registrations and marked with
 * syntax highlighting, code block copy buttons, and HTTPS URL upgrades.
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
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

// Register highlight.js languages
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('fsharp', fsharp);
hljs.registerLanguage('fs', fsharp);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('toml', ini);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);

// Configure marked with syntax highlighting
marked.use(
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            // ignoreIllegals: true prevents exceptions on malformed code in README content
            return hljs.highlight(code, { language, ignoreIllegals: true }).value;
        }
    })
);

// Language display names for code block labels
const languageDisplayNames: Record<string, string> = {
    'csharp': 'C#',
    'cs': 'C#',
    'fsharp': 'F#',
    'fs': 'F#',
    'xml': 'XML',
    'html': 'HTML',
    'json': 'JSON',
    'bash': 'Bash',
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'ps1': 'PowerShell',
    'sql': 'SQL',
    'yaml': 'YAML',
    'yml': 'YAML',
    'plaintext': 'Text',
    'text': 'Text',
    'javascript': 'JavaScript',
    'js': 'JavaScript',
    'typescript': 'TypeScript',
    'ts': 'TypeScript',
    'css': 'CSS',
    'dockerfile': 'Dockerfile',
    'docker': 'Docker',
    'markdown': 'Markdown',
    'md': 'Markdown',
    'ini': 'INI',
    'toml': 'TOML'
};

// Custom renderer to add unified header button with copy icon and language label to code blocks
const renderer = new marked.Renderer();
const originalCodeRenderer = renderer.code.bind(renderer);

// GitHub Octicon SVGs (MIT licensed)
const COPY_ICON_SVG = `<svg class="copy-icon" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>`;
const CHECK_ICON_SVG = `<svg class="check-icon" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>`;

renderer.code = function (code: { text: string; lang?: string; escaped?: boolean; type?: string; raw?: string }) {
    const lang = code.lang || '';
    const displayLang = languageDisplayNames[lang.toLowerCase()] || lang.toUpperCase() || 'Code';
    const html = originalCodeRenderer(code as Parameters<typeof originalCodeRenderer>[0]);

    // Unified header button with copy/check icons and language label
    const headerBtn = `<button class="code-header-btn" title="Copy to clipboard" aria-label="Copy ${displayLang} code to clipboard">${COPY_ICON_SVG}${CHECK_ICON_SVG}<span class="code-lang-label">${displayLang}</span></button>`;
    return `<div class="code-block-wrapper">${headerBtn}${html}</div>`;
};

marked.use({ renderer });

// Configure marked for safe rendering
marked.setOptions({
    breaks: true,
    gfm: true
});

// Known domains that support HTTPS - upgrade http:// to https:// for these
const httpsUpgradeDomains = [
    'img.shields.io',
    'shields.io',
    'github.com',
    'raw.githubusercontent.com',
    'user-images.githubusercontent.com',
    'avatars.githubusercontent.com',
    'camo.githubusercontent.com',
    'badge.fury.io',
    'travis-ci.org',
    'travis-ci.com',
    'ci.appveyor.com',
    'codecov.io',
    'coveralls.io',
    'david-dm.org',
    'snyk.io',
    'api.codacy.com',
    'sonarcloud.io',
    'img.badgesize.io',
    'badgen.net',
    'flat.badgen.net'
];

/**
 * Upgrade http:// URLs to https:// for known-safe domains.
 * Fixes broken images in READMEs that use http:// for domains that support https://.
 */
export function upgradeHttpToHttps(markdown: string): string {
    const pattern = new RegExp(
        `http://(?:www\\.)?(${httpsUpgradeDomains.map(d => d.replace(/\./g, '\\.')).join('|')})`,
        'gi'
    );
    return markdown.replace(pattern, 'https://$1');
}

/**
 * Render markdown content to sanitized HTML.
 * Uses marked for parsing with highlight.js syntax highlighting,
 * DOMPurify for XSS prevention, and HTTP→HTTPS URL upgrades.
 */
export function renderMarkdownToHtml(markdownContent: string): string {
    const upgraded = upgradeHttpToHttps(markdownContent);
    const rawHtml = marked.parse(upgraded) as string;
    return DOMPurify.sanitize(rawHtml, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button'],
        FORBID_ATTR: ['style']
    });
}
