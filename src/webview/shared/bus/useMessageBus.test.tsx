import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeHost } from './testSupport';
import { MessageBusProvider, useMessageBus } from './useMessageBus';

function Asks() {
    const bus = useMessageBus();
    return <button type="button" onClick={() => void bus.request('refresh/all', {})}>Refresh</button>;
}

describe('useMessageBus', () => {
    it('gives the bus of the provider above', () => {
        const host = createFakeHost();
        render(<MessageBusProvider bus={host.bus}><Asks /></MessageBusProvider>);
        screen.getByRole('button', { name: 'Refresh' }).click();
        expect(host.requests('refresh/all')).toHaveLength(1);
    });

    it('fails with a clear message without a provider', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => render(<Asks />)).toThrow('useMessageBus needs a MessageBusProvider above it');
        error.mockRestore();
    });
});
