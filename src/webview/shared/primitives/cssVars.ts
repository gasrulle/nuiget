import type React from 'react';

/** The name of a design token or of a per-element number that a stylesheet reads. */
export type NuigetVar = `--nuiget-${string}`;

/**
 * The only way a primitive produces a `style` prop: custom properties, never a layout property. A number that
 * only the script knows (a virtual offset, a split percentage) reaches the DOM as a custom property through
 * the CSSOM, which the Content Security Policy of the webviews permits (ADR-006); the stylesheet owns the
 * property that uses it.
 */
export function cssVars(vars: Partial<Record<NuigetVar, string>>): React.CSSProperties {
    return vars as React.CSSProperties;
}
