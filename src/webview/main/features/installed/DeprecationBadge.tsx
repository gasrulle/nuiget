import type React from 'react';
import type { PackageDeprecation } from '../../../../protocol';
import { deprecationSentence } from '../../../shared/installed/rules';
import { Badge } from '../../../shared/primitives';

/**
 * A deprecated row's label badge (UX-P5.2b, DS-ROW-5, design-advisor opening ruling of 2026-11-27, DO 6): "Deprecated" in the
 * warning tone, no glyph (the glyph is the severity scale's), with the deprecation's sentence for assistive technology;
 * nothing for a row not known deprecated.
 */
export function DeprecationBadge({ deprecation }: { deprecation: PackageDeprecation | undefined }): React.JSX.Element | null {
    if (deprecation === undefined) {
        return null;
    }
    return <Badge label="Deprecated" tone="warning" title={deprecationSentence(deprecation)} data-testid="row-deprecation" />;
}
