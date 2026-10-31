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

    it('All Projects project headers take the pane-header type and the folder caption stays in capitals (DS-TYPE-5, UX-P2.6)', () => {
        render(
            <>
                <h2 className="nuiget-installed-folder-title">src</h2>
                <section className="nuiget-installed-project">
                    <SectionHeader title="App.csproj" titleId="t" level={3} expanded onToggle={() => undefined} contentId="c" testKey="app" />
                </section>
                <section className="nuiget-installed-project">
                    <SectionHeader title="Direct packages" titleId="u" level={3} expanded onToggle={() => undefined} contentId="d" testKey="direct" />
                </section>
            </>,
        );
        // jsdom resolves no var(): the title reads the carrier and the box sets it as the direct header's does.
        for (const key of ['app', 'direct']) {
            const box = screen.getByTestId(`section-box-${key}`);
            expect(box).toHaveAttribute('data-variant', 'group');
            expect(getComputedStyle(box.querySelector('.nuiget-section-title') as HTMLElement).textTransform).toContain('--nuiget-section-title-transform');
            expect(getComputedStyle(box.querySelector('h3') as HTMLElement).fontWeight).toContain('--nuiget-section-title-weight');
        }
        expect(getComputedStyle(screen.getByText('src')).textTransform).toBe('uppercase');
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
