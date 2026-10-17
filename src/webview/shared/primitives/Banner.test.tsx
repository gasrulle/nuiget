import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';

describe('Banner', () => {
    it('warning and info are status, error is alert', () => {
        render(<>
            <Banner severity="info" data-testid="banner-info">Showing cached results</Banner>
            <Banner severity="warning" data-testid="banner-warning">Sources unreachable</Banner>
            <Banner severity="error" data-testid="banner-error">Restore failed</Banner>
        </>);
        expect(screen.getByTestId('banner-info')).toHaveAttribute('role', 'status');
        expect(screen.getByTestId('banner-warning')).toHaveAttribute('role', 'status');
        expect(screen.getByTestId('banner-error')).toHaveAttribute('role', 'alert');
        expect(screen.getByTestId('banner-warning')).toHaveClass('nuiget-banner', 'nuiget-banner--warning');
        // Never the hook of the one live region of the surface.
        expect(screen.queryByTestId('status-live')).toBeNull();
    });

    it('the severity is spoken before the text', () => {
        render(<>
            <Banner severity="info">Showing cached results</Banner>
            <Banner severity="warning">Sources unreachable</Banner>
            <Banner severity="error">Restore failed</Banner>
        </>);
        const [info, warning] = screen.getAllByRole('status');
        expect(info.textContent).toBe('Info: Showing cached results');
        expect(warning.textContent).toBe('Warning: Sources unreachable');
        expect(screen.getByRole('alert').textContent).toBe('Error: Restore failed');
        // In words for those who do not see the colour; not on the screen a second time.
        expect(warning.querySelector('.nuiget-visually-hidden')).toHaveTextContent('Warning:');
        // The icon repeats the severity for the eye only.
        expect(warning.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('the action is a button', async () => {
        const onClick = vi.fn();
        const { rerender } = render(<Banner severity="warning" action={{ label: 'Retry', onClick }}>Sources unreachable</Banner>);
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).toHaveAttribute('type', 'button');
        expect(retry).toHaveClass('nuiget-button', 'nuiget-button--secondary');
        await userEvent.click(retry);
        expect(onClick).toHaveBeenCalledTimes(1);

        rerender(<Banner severity="warning">Sources unreachable</Banner>);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('has no axe violations', async () => {
        const { container } = render(<main>
            <Banner severity="warning" action={{ label: 'Retry', onClick: () => undefined }}>Sources unreachable</Banner>
            <Banner severity="error">Restore failed</Banner>
        </main>);
        expect(await axe(container)).toHaveNoViolations();
    });
});
