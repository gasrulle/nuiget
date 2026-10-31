import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Checkbox, SectionHeader, Select } from '../shared/primitives';
import { installFakeLayout, installStylesheet } from '../shared/primitives/testSupport';

/** The shared stylesheets and the main panel's own, so computed styles reflect the cascade the panel ships. */
function installMainStylesheet(): () => void {
    const removeShared = installStylesheet();
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve('src/webview/main/main.css'), 'utf-8');
    document.head.appendChild(style);
    return () => {
        style.remove();
        removeShared();
    };
}

describe('main panel parity: header controls and All Projects headers (P9.11)', () => {
    let removeLayout: () => void;
    let removeStyles: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
        removeStyles = installMainStylesheet();
    });

    afterEach(() => {
        removeStyles();
        removeLayout();
    });

    it('All Projects project headers are in normal case and the folder caption stays in capitals', () => {
        render(
            <>
                <h2 className="nuiget-installed-folder-title">src</h2>
                <section className="nuiget-installed-project nuiget-installed-project--grouped">
                    <SectionHeader title="App.csproj" titleId="t" level={3} expanded onToggle={() => undefined} contentId="c" testKey="app" />
                </section>
                <section className="nuiget-installed-project">
                    <SectionHeader title="Direct packages" titleId="u" level={3} expanded onToggle={() => undefined} contentId="d" testKey="direct" />
                </section>
            </>,
        );
        const toggle = screen.getByTestId('section-header-app');
        expect(getComputedStyle(toggle).textTransform).toBe('none');
        // jsdom computes `normal` as its numeric weight.
        expect(getComputedStyle(toggle.closest('h3') as HTMLElement).fontWeight).toMatch(/^(?:normal|400)$/);
        expect(getComputedStyle(screen.getByText('src')).textTransform).toBe('uppercase');
        expect(getComputedStyle(screen.getByTestId('section-header-direct')).textTransform).toBe('uppercase');
        expect(getComputedStyle(screen.getByTestId('section-header-direct').closest('h3') as HTMLElement).fontWeight).not.toMatch(/^(?:normal|400)$/);
    });

    it('the header check boxes and the drop-down are sized and coloured by the tokens', () => {
        const { container } = render(
            <main className="nuiget-main">
                <label className="nuiget-main-toggle"><Checkbox aria-label="Restore" checked={false} onChange={() => undefined} /></label>
                <Select aria-label="Project" value="" onChange={() => undefined}><option value="">–</option></Select>
            </main>,
        );
        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLElement;
        const select = container.querySelector('.nuiget-select-input') as HTMLElement;
        expect(getComputedStyle(checkbox).inlineSize).toBe('var(--nuiget-checkbox-size)');
        expect(getComputedStyle(select).color).toBe('var(--nuiget-color-dropdown-fg)');
    });
});
