import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { MessageBusProvider } from '../../../shared/bus/useMessageBus';
import { axeRuleOutcome, expectFocusAfterClose, installFakeLayout } from '../../../shared/primitives/testSupport';
import { ProjectsProvider } from '../../../shared/store/projects';
import { CentralUpdateDialog, type CentralUpdateRequest } from './CentralUpdateDialog';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const REQUEST: CentralUpdateRequest = { kind: 'update', projectPath: A, packageId: 'Serilog', fromVersion: '3.0.0', toVersion: '3.1.0' };
const PREVIEW = { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Serilog', fromVersion: '3.0.0', toVersion: '3.1.0', affectedProjects: [A, B] };

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

let restoreLayout: () => void;
beforeEach(() => {
    restoreLayout = installFakeLayout();
});
afterEach(() => {
    restoreLayout();
});

/** The dialog with an opener, as in the product: a focused control opens it (UX-P0.24 design-advisor ruling). */
function Owner({ onConfirm }: { onConfirm: () => void }) {
    const [request, setRequest] = useState<CentralUpdateRequest | null>(null);
    return (
        <>
            <button type="button" data-testid="opener" onClick={() => setRequest(REQUEST)}>Update</button>
            <CentralUpdateDialog request={request} onClose={() => setRequest(null)} onConfirm={onConfirm} />
        </>
    );
}

async function mount(): Promise<{ host: FakeHost; onConfirm: ReturnType<typeof vi.fn> }> {
    const host = createFakeHost();
    const onConfirm = vi.fn();
    render(<MessageBusProvider bus={host.bus}><ProjectsProvider><Owner onConfirm={onConfirm} /></ProjectsProvider></MessageBusProvider>);
    await userEvent.setup().click(screen.getByTestId('opener'));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    return { host, onConfirm };
}

const dialog = () => screen.getByTestId('cpm-preview-dialog');
const confirmButton = () => screen.getByTestId('cpm-preview-confirm');

describe('CentralUpdateDialog', () => {
    it('asks for the preview, says it is loading and offers no action until it answered', async () => {
        const { host } = await mount();
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0' }]);
        expect(dialog()).toHaveAttribute('role', 'alertdialog');
        expect(dialog()).toHaveAccessibleName('Serilog is centrally managed');
        expect(dialog()).toHaveTextContent('Looking up the projects that use the central version');
        expect(confirmButton()).toBeDisabled();
        // Cancel has the focus: it changes nothing.
        expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    it('lists the projects by name, a project the list does not know by its file name, and confirms', async () => {
        const user = userEvent.setup();
        const { host, onConfirm } = await mount();
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: PREVIEW }));
        expect(dialog()).toHaveTextContent('Changes the central version 3.0.0 → 3.1.0 in Directory.Packages.props for:');
        expect(within(dialog()).getAllByRole('listitem').map(item => item.textContent)).toEqual(['App', 'Lib.csproj']);
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        await user.click(confirmButton());
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('a package without a central entry says the update changes this project only and still offers it', async () => {
        const { host } = await mount();
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: null }));
        expect(dialog()).toHaveTextContent('The central entry was not found; the change reaches this project only.');
        expect(confirmButton()).toBeEnabled();
    });

    it('an error shows Retry, which asks again', async () => {
        const user = userEvent.setup();
        const { host } = await mount();
        await hostSays(() => host.fail(host.requests('cpm/preview')[0], 'failed', 'no context'));
        expect(within(dialog()).getByRole('alert')).toHaveTextContent('The projects this change reaches could not be listed: no context');
        expect(confirmButton()).toBeDisabled();
        await user.click(within(dialog()).getByRole('button', { name: 'Retry' }));
        expect(host.requests('cpm/preview')).toHaveLength(2);
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: PREVIEW }));
        expect(confirmButton()).toBeEnabled();
    });

    it('an install request says what the install sets', async () => {
        const host = createFakeHost();
        render(<MessageBusProvider bus={host.bus}><ProjectsProvider><CentralUpdateDialog request={{ kind: 'install', projectPath: A, packageId: 'Polly', toVersion: '8.4.2' }} onClose={() => undefined} onConfirm={() => undefined} /></ProjectsProvider></MessageBusProvider>);
        expect(dialog()).toHaveAccessibleDescription('Installing it sets the central version in Directory.Packages.props for every project that uses it: 8.4.2.');
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: null }));
        expect(dialog()).toHaveTextContent('The central entry was not found; the change reaches this project only.');
        expect(confirmButton()).toHaveTextContent('Update central version');
    });

    it('Cancel closes the dialog and cancels the request', async () => {
        const user = userEvent.setup();
        const { host, onConfirm } = await mount();
        const pending = host.requests('cpm/preview')[0];
        await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expectFocusAfterClose('central-update-cancel');
        expect(host.cancelled()).toContain(pending.id);
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
