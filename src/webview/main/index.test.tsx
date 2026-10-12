import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MainShell } from './index';

describe('main panel 2.0 placeholder', () => {
    afterEach(cleanup);

    it('renders the shell text', () => {
        render(<MainShell />);

        expect(screen.getByText('2.0 shell')).toBeInTheDocument();
    });

    it('does not mount itself when the page has no root element', () => {
        expect(document.body).toBeEmptyDOMElement();
    });
});
