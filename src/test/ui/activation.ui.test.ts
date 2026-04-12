import { expect } from 'chai';
import { ActivityBar, SideBarView } from 'vscode-extension-tester';

/**
 * Wait for the nUIget Activity Bar icon to appear (extension activation can be slow).
 */
async function waitForNuigetIcon(maxWait = 20_000): Promise<string[]> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const activityBar = new ActivityBar();
        const controls = await activityBar.getViewControls();
        const titles = await Promise.all(controls.map(c => c.getTitle()));
        if (titles.some(t => t.toLowerCase().includes('nuiget') || t.toLowerCase().includes('nuget'))) {
            return titles;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    // Return final attempt
    const activityBar = new ActivityBar();
    const controls = await activityBar.getViewControls();
    return Promise.all(controls.map(c => c.getTitle()));
}

/**
 * UI test: Extension activation — Activity Bar icon visible, sidebar resolves.
 */
describe('Extension Activation', () => {
    it('should show nUIget icon in the Activity Bar', async function () {
        this.timeout(60_000);

        const titles = await waitForNuigetIcon();

        const hasNuiget = titles.some(
            t => t.toLowerCase().includes('nuiget') || t.toLowerCase().includes('nuget'),
        );
        expect(hasNuiget, `nUIget Activity Bar icon should be visible. Found titles: ${titles.join(', ')}`).to.be.true;
    });

    it('should resolve sidebar when clicked', async function () {
        this.timeout(60_000);

        await waitForNuigetIcon();
        const activityBar = new ActivityBar();
        const controls = await activityBar.getViewControls();

        for (const control of controls) {
            const title = await control.getTitle();
            if (title.toLowerCase().includes('nuiget') || title.toLowerCase().includes('nuget')) {
                await control.openView();
                await new Promise(resolve => setTimeout(resolve, 3000));

                const sideBar = new SideBarView();
                const content = await sideBar.getContent();
                expect(content).to.not.be.undefined;
                return;
            }
        }
        expect.fail('nUIget sidebar not found');
    });
});
