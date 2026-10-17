import { afterEach, describe, expect, it } from 'vitest';
import { defaultPackageIcon, packageIconSrc } from './packageIcon';

const DEFAULT = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
const ICON = 'data:image/png;base64,AAAA';

describe('packageIconSrc', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('default icon used when no iconUrl: the root\'s data-package-icon, read once', () => {
        // No root yet (a test, or before the entry rendered): nothing to fall back to, and nothing remembered.
        expect(packageIconSrc(undefined)).toBeUndefined();

        document.body.innerHTML = `<div id="root" data-package-icon="${DEFAULT}"></div>`;
        expect(packageIconSrc(undefined)).toBe(DEFAULT);
        expect(packageIconSrc(ICON)).toBe(ICON);
        // A URL the CSP would block is no icon of its own: the default shows instead.
        expect(packageIconSrc('https://api.nuget.org/v3-flatcontainer/serilog/3.1.1/icon')).toBe(DEFAULT);

        // Read once: the root going away later changes nothing.
        document.body.innerHTML = '';
        expect(defaultPackageIcon()).toBe(DEFAULT);
        expect(packageIconSrc('')).toBe(DEFAULT);
    });
});
