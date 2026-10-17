import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { LiveStatus } from './LiveStatus';

describe('LiveStatus', () => {
    it('is a polite atomic status region with the test id', () => {
        render(<LiveStatus message={null} />);
        const region = screen.getByTestId('status-live');
        expect(region).toHaveAttribute('role', 'status');
        expect(region).toHaveAttribute('aria-live', 'polite');
        expect(region).toHaveAttribute('aria-atomic', 'true');
        // There from the first render and empty: a live region announces what changes in it.
        expect(region).toBeEmptyDOMElement();
        expect(region).toHaveClass('nuiget-visually-hidden');
    });

    it('announces the latest message', async () => {
        const { rerender } = render(<LiveStatus message="Uninstalled Serilog" />);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uninstalled Serilog'));
        rerender(<LiveStatus message="Updated Newtonsoft.Json" />);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Updated Newtonsoft.Json'));
        rerender(<LiveStatus message={null} />);
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('re-announces an identical message', async () => {
        const { rerender } = render(<LiveStatus message="Restore failed" repeat={1} />);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restore failed'));
        rerender(<LiveStatus message="Restore failed" repeat={2} />);
        // Emptied first: only a change of the text is announced.
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restore failed'));
    });

    it('has no axe violations', async () => {
        const { container } = render(<LiveStatus message="Uninstalled Serilog" />);
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uninstalled Serilog'));
        expect(await axe(container)).toHaveNoViolations();
    });
});
