import { render, screen } from '@testing-library/react';
import type React from 'react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

let broken = false;

function Fragile(): React.JSX.Element {
    if (broken) {
        throw new Error('boom');
    }
    return <p>The view</p>;
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // React logs a caught rendering error; the boundary is what the test looks at.
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        broken = false;
        vi.restoreAllMocks();
    });

    it('error boundary renders reload', async () => {
        const user = userEvent.setup();
        const onError = vi.fn();
        broken = true;
        const { container } = render(<ErrorBoundary onError={onError}><Fragile /></ErrorBoundary>);

        expect(screen.getByText('Something went wrong in this view.')).toBeInTheDocument();
        expect(screen.queryByText('The view')).toBeNull();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
        expect((onError.mock.calls[0][0] as Error).message).toBe('boom');
        expect(typeof onError.mock.calls[0][1]).toBe('string');
        expect(await axe(container)).toHaveNoViolations();

        broken = false;
        await user.click(screen.getByRole('button', { name: 'Reload' }));
        expect(screen.getByText('The view')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    });

    it('a boundary without an error renders its children only', () => {
        const onError = vi.fn();
        const { container } = render(<ErrorBoundary onError={onError}><Fragile /></ErrorBoundary>);
        expect(container).toHaveTextContent('The view');
        expect(container.children).toHaveLength(1);
        expect(screen.queryByRole('button')).toBeNull();
        expect(onError).not.toHaveBeenCalled();
    });
});
