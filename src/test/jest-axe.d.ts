/**
 * Types for `jest-axe` under Vitest. The package ships none, and `@types/jest-axe` is not an option here:
 * it depends on `@types/jest`, whose global `describe`/`it`/`expect` would sit next to `vitest/globals`.
 *
 * This file is a script on purpose (no top-level import or export): only then is `declare module
 * 'jest-axe'` a declaration of that module. The matcher's place on Vitest's `expect` is declared in
 * `setup-frontend.ts`, which is a module and can augment `vitest`.
 */
declare module 'jest-axe' {
    /** The part of axe-core's result that the tests and the matcher read. */
    export interface AxeResults {
        violations: Array<{
            id: string;
            impact?: string | null;
            help: string;
            helpUrl: string;
            nodes: Array<{ html: string; target: string[] }>;
        }>;
    }

    /** Runs axe-core on an element or an HTML string. Colour-contrast rules are off: jsdom cannot compute them. */
    export function axe(html: Element | string, options?: object): Promise<AxeResults>;
    export function configureAxe(options?: object): typeof axe;
    export const toHaveNoViolations: {
        toHaveNoViolations(results: AxeResults): { pass: boolean; message(): string };
    };
}
