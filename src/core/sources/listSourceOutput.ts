import type { NuGetSource } from '../../protocol/domain';

// "  1.  Private Feed [Enabled]". The words are English because the runner fixes the CLI language.
const SOURCE_LINE = /^\s*\d+\.\s+(.+?)\s+\[(Enabled|Disabled)\]\s*$/;
// Any numbered line, whatever follows the name: never the address of the source before it.
const NUMBERED_LINE = /^\s*\d+\.\s+\S/;
const REMOTE_URL = /^https?:\/\//i;

/**
 * Parse the output of `dotnet nuget list source --format detailed`: a header, then for each source a
 * numbered line with its name and state and an indented line with its address. A pair that does not
 * have that form is skipped.
 */
export function parseListSourceOutput(stdout: string): NuGetSource[] {
    const lines = stdout.split(/\r?\n/);
    const sources: NuGetSource[] = [];
    for (let index = 0; index < lines.length - 1; index++) {
        const match = SOURCE_LINE.exec(lines[index]);
        const url = lines[index + 1].trim();
        if (match === null || url.length === 0 || NUMBERED_LINE.test(lines[index + 1])) {
            continue;
        }
        const source: NuGetSource = { name: match[1], url, enabled: match[2] === 'Enabled' };
        if (!REMOTE_URL.test(url)) {
            source.isLocal = true;
        }
        sources.push(source);
        index++;
    }
    return sources;
}
