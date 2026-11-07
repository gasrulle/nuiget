import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { axeRuleOutcome } from './testSupport';

/** The bulk uninstall confirmation of interaction model §5: the packages, listed. */
function renderBulkUninstall(handlers: { onConfirm?: () => void; onCancel?: () => void; busy?: boolean } = {}) {
    return render(
        <ConfirmDialog
            open
            title="Uninstall 2 packages?"
            confirmLabel="Uninstall"
            onConfirm={handlers.onConfirm ?? (() => undefined)}
            onCancel={handlers.onCancel ?? (() => undefined)}
            busy={handlers.busy}
        >
            <p>These packages are removed from MyApp.csproj:</p>
            <ul>
                <li>Serilog 3.0.0</li>
                <li>xunit 2.9.0</li>
            </ul>
        </ConfirmDialog>,
    );
}

describe('ConfirmDialog', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is an alertdialog with the test ids of interaction model §8 and opens with focus on Cancel', () => {
        renderBulkUninstall();
        const dialog = screen.getByRole('alertdialog', { name: 'Uninstall 2 packages?' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('data-testid', 'confirm-dialog');
        expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Uninstall');
        // Cancel changes nothing, so a stray Enter does no harm.
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel');
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
    });

    it('opens with focus on Cancel when the message holds a link', () => {
        render(
            <ConfirmDialog open title="Remove source?" confirmLabel="Remove" onConfirm={() => undefined} onCancel={() => undefined}>
                The source is removed from <a href="#nuget-config">nuget.config</a>.
            </ConfirmDialog>,
        );
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
    });

    it('the message is the description and may hold a list', () => {
        const consoleError = vi.spyOn(console, 'error');
        renderBulkUninstall();
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveAccessibleDescription('These packages are removed from MyApp.csproj: Serilog 3.0.0 xunit 2.9.0');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        // React reports invalid nesting (a list in a paragraph) through console.error.
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('renders its groups as lists under their leads, in the description, with every rhythm a gap (UX-P3.5)', () => {
        render(
            <ConfirmDialog open title="Uninstall 3 packages?" confirmLabel="Uninstall" onConfirm={() => undefined} onCancel={() => undefined}
                groups={[{ label: 'From Api:', items: ['Serilog', 'Polly'] }, { label: 'From Web:', items: ['xunit'] }]} />,
        );
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveAccessibleDescription('From Api: Serilog Polly From Web: xunit');
        expect(screen.getAllByRole('list')).toHaveLength(2);
        expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Serilog', 'Polly', 'xunit']);
        expect(dialog.querySelectorAll('.nuiget-dialog-group > .nuiget-dialog-lead + .nuiget-dialog-list')).toHaveLength(2);
        // A group without a lead is its list alone.
        render(<ConfirmDialog open title="Update 1 package?" confirmLabel="Update" onConfirm={() => undefined} onCancel={() => undefined} groups={[{ items: ['Serilog: 3.0.0 → 3.1.0'] }]} />);
        expect(screen.getAllByRole('alertdialog')[1].querySelector('.nuiget-dialog-lead')).toBeNull();
    });

    it('Confirm and Cancel report, and Escape cancels', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        renderBulkUninstall({ onConfirm, onCancel });
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(onCancel).toHaveBeenCalledTimes(1);
        await user.keyboard('{Escape}');
        expect(onCancel).toHaveBeenCalledTimes(2);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('busy disables Confirm and leaves Cancel', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        renderBulkUninstall({ onConfirm, busy: true });
        expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
        expect(screen.getByTestId('confirm-dialog-cancel')).toBeEnabled();
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('renders nothing when closed', () => {
        render(<ConfirmDialog open={false} title="Remove source?" confirmLabel="Remove" onConfirm={() => undefined} onCancel={() => undefined}>Gone for good.</ConfirmDialog>);
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });

    it('has no axe violations', async () => {
        renderBulkUninstall({ busy: true });
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });
});
