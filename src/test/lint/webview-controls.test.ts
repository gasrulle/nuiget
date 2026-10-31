import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The non-test TSX of the webviews: where a feature could write a primitive's class (ADR-010 Decision 4, UX-P2.3). */
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) {
            return sources(file);
        }
        return file.endsWith('.tsx') && !file.endsWith('.test.tsx') ? [file] : [];
    });
}

const holders = (needle: string): string[] => sources('src/webview').filter(file => readFileSync(file, 'utf8').includes(needle)).map(file => path.basename(file));

describe('the webviews\' controls', () => {
    it('every text button renders through Button: no nuiget-button class outside Button.tsx', () => {
        expect(holders('nuiget-button')).toEqual(['Button.tsx']);
    });

    it('every select renders through Select: no <select outside Select.tsx', () => {
        expect(holders('<select')).toEqual(['Select.tsx']);
    });

    it('every text input renders through TextField: no <input outside Checkbox.tsx and TextField.tsx', () => {
        expect(holders('<input').sort()).toEqual(['Checkbox.tsx', 'TextField.tsx']);
    });

    it('every check box renders through Checkbox: no input type=checkbox outside Checkbox.tsx', () => {
        expect(holders('type="checkbox"')).toEqual(['Checkbox.tsx']);
    });
});
