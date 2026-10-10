import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error, Key } from 'selenium-webdriver';

const mocks = vi.hoisted(() => ({
    switchToFrame: vi.fn(),
    defaultContent: vi.fn(),
    findElements: vi.fn(),
    findWebElement: vi.fn(),
    sendKeys: vi.fn(),
    getAttribute: vi.fn(),
    wait: vi.fn(),
}));

vi.mock('vscode-extension-tester', async () => {
    const { By } = await import('selenium-webdriver');
    return {
        By,
        WebView: class {
            switchToFrame = mocks.switchToFrame;
            findWebElement = mocks.findWebElement;
            getDriver() {
                return {
                    wait: mocks.wait,
                    findElements: mocks.findElements,
                    switchTo: () => ({ defaultContent: mocks.defaultContent }),
                };
            }
        },
    };
});

import { WebView } from 'vscode-extension-tester';
import { findByTestId, hasTestId, switchToWebviewFrame, typeIntoTestId } from '../ui/helpers/webview-helpers';

describe('UI webview helpers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.wait.mockImplementation(async (predicate: () => Promise<unknown>) => {
            for (let i = 0; i < 3; i++) {
                const result = await predicate();
                if (result) { return result; }
            }
            throw new error.TimeoutError('Condition did not become true');
        });
        mocks.findWebElement.mockResolvedValue({
            sendKeys: mocks.sendKeys,
            getAttribute: mocks.getAttribute,
        });
    });

    it.each(['Serilog', ''])('replaces or clears controlled input text (%j)', async text => {
        mocks.getAttribute.mockResolvedValue(text);
        await typeIntoTestId(new WebView(), 'search-input', text);

        const modifier = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;
        expect(mocks.sendKeys).toHaveBeenNthCalledWith(1, Key.chord(modifier, 'a'), Key.BACK_SPACE);
        if (text) {
            expect(mocks.sendKeys).toHaveBeenNthCalledWith(2, text);
        } else {
            expect(mocks.sendKeys).toHaveBeenCalledTimes(1);
        }
        expect(mocks.getAttribute).toHaveBeenCalledWith('value');
    });

    it('fails explicitly when a controlled input does not accept the new value', async () => {
        mocks.getAttribute.mockResolvedValue('old text');
        await expect(typeIntoTestId(new WebView(), 'search-input', 'new text'))
            .rejects.toThrow(error.TimeoutError);
    });

    it('waits through missing elements while the webview renders', async () => {
        mocks.findWebElement.mockRejectedValueOnce(new error.NoSuchElementError());
        expect(await findByTestId(new WebView(), 'search-input')).toBeDefined();
        expect(mocks.findWebElement).toHaveBeenCalledTimes(2);
    });

    it('does not mask WebDriver session errors as missing elements', async () => {
        const failure = new error.NoSuchSessionError('Driver disconnected');
        mocks.findWebElement.mockRejectedValue(failure);
        await expect(findByTestId(new WebView(), 'search-input')).rejects.toBe(failure);
        await expect(hasTestId(new WebView(), 'search-input')).rejects.toBe(failure);
    });

    it('returns false when an optional element never renders', async () => {
        mocks.findWebElement.mockRejectedValue(new error.NoSuchElementError());
        expect(await hasTestId(new WebView(), 'optional-button')).toBe(false);
    });

    it('returns to the main frame before retrying a panel that is still opening', async () => {
        mocks.switchToFrame.mockRejectedValueOnce(new error.NoSuchElementError());
        mocks.findElements.mockResolvedValue([{}]);
        expect(await switchToWebviewFrame()).toBeInstanceOf(WebView);
        expect(mocks.defaultContent).toHaveBeenCalledTimes(2);
        expect(mocks.switchToFrame).toHaveBeenCalledTimes(2);
    });

    it('waits for the app container rather than accepting an unrelated frame', async () => {
        mocks.findElements.mockResolvedValueOnce([]).mockResolvedValue([{}]);
        await switchToWebviewFrame();
        expect(mocks.switchToFrame).toHaveBeenCalledTimes(2);
    });
});
