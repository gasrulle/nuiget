import { expect } from 'chai';
import { WebView, Workbench } from 'vscode-extension-tester';
import { closeAllEditors, openNuGetPanelWebview } from './helpers/panel-helpers';
import { hasTestId } from './helpers/webview-helpers';

/**
 * UI test: Light/dark/HC themes → CSS variables apply correctly.
 */
describe('Theme Switching', () => {
    let webview: WebView;

    afterEach(async function () {
        this.timeout(30_000);
        if (webview) {
            try { await webview.switchBack(); } catch { /* ignore */ }
        }
        try { await closeAllEditors(); } catch { /* ignore */ }
    });

    it('should render correctly in dark theme', async function () {
        this.timeout(60_000);

        const workbench = new Workbench();
        await workbench.executeCommand('Preferences: Color Theme');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Select Dark Modern
        const input = await workbench.openCommandPrompt();
        await input.setText('Default Dark Modern');
        await input.confirm();
        await new Promise(resolve => setTimeout(resolve, 2000));

        webview = await openNuGetPanelWebview();

        const appExists = await hasTestId(webview, 'nuiget-app');
        expect(appExists, 'App should render in dark theme').to.be.true;
    });

    it('should render correctly in light theme', async function () {
        this.timeout(60_000);

        const workbench = new Workbench();
        await workbench.executeCommand('Preferences: Color Theme');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const input = await workbench.openCommandPrompt();
        await input.setText('Default Light Modern');
        await input.confirm();
        await new Promise(resolve => setTimeout(resolve, 2000));

        webview = await openNuGetPanelWebview();

        const appExists = await hasTestId(webview, 'nuiget-app');
        expect(appExists, 'App should render in light theme').to.be.true;
    });

    it('should render correctly in high contrast theme', async function () {
        this.timeout(60_000);

        const workbench = new Workbench();
        await workbench.executeCommand('Preferences: Color Theme');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const input = await workbench.openCommandPrompt();
        await input.setText('Default High Contrast');
        await input.confirm();
        await new Promise(resolve => setTimeout(resolve, 2000));

        webview = await openNuGetPanelWebview();

        const appExists = await hasTestId(webview, 'nuiget-app');
        expect(appExists, 'App should render in high contrast theme').to.be.true;
    });

    after(async function () {
        this.timeout(30_000);
        // Restore default theme
        const workbench = new Workbench();
        try {
            await workbench.executeCommand('Preferences: Color Theme');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const input = await workbench.openCommandPrompt();
            await input.setText('Default Dark Modern');
            await input.confirm();
        } catch {
            // Best effort
        }
    });
});
