import { afterEach, describe, expect, it } from 'vitest';
import { applyLook } from './look';

const root = document.documentElement;

describe('applyLook (ADR-011 Decision 2, UX-P4.1)', () => {
    afterEach(() => {
        for (const name of ['data-look', 'data-density', 'data-uppercase-headers', 'data-always-show-header-actions']) {
            root.removeAttribute(name);
        }
    });

    it('writes the look and the density as values and the two booleans as present attributes', () => {
        applyLook({ look: 'modern', density: 'compact', uppercaseViewHeaders: true, alwaysShowHeaderActions: true });

        expect(root.getAttribute('data-look')).toBe('modern');
        expect(root.getAttribute('data-density')).toBe('compact');
        expect(root.getAttribute('data-uppercase-headers')).toBe('');
        expect(root.getAttribute('data-always-show-header-actions')).toBe('');
    });

    it('a later change back removes the boolean attributes instead of writing false', () => {
        applyLook({ look: 'modern', density: 'compact', uppercaseViewHeaders: true, alwaysShowHeaderActions: true });
        applyLook({ look: 'classic', density: 'default', uppercaseViewHeaders: false, alwaysShowHeaderActions: false });

        expect(root.getAttribute('data-look')).toBe('classic');
        expect(root.getAttribute('data-density')).toBe('default');
        expect(root.hasAttribute('data-uppercase-headers')).toBe(false);
        expect(root.hasAttribute('data-always-show-header-actions')).toBe(false);
    });

    it('writes onto the element it is given and leaves the document element alone', () => {
        const element = document.createElement('html');
        applyLook({ look: 'modern', density: 'default', uppercaseViewHeaders: false, alwaysShowHeaderActions: true }, element);

        expect(element.getAttribute('data-look')).toBe('modern');
        expect(element.hasAttribute('data-always-show-header-actions')).toBe(true);
        expect(root.hasAttribute('data-look')).toBe(false);
    });
});
