// Script to replace method bodies in NuGetService.ts with facade delegations
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/services/NuGetService.ts');
const src = fs.readFileSync(filePath, 'utf8');
// Detect line ending
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const lines = src.split(eol);
const totalLines = lines.length;
console.log(`Original: ${totalLines} lines, EOL: ${eol === '\r\n' ? 'CRLF' : 'LF'}`);

// Verify a few known lines
console.log(`Line 2495: "${lines[2494].trim()}"`);
console.log(`Line 537: "${lines[536].trim()}"`);

function findJSDocStart(lines, methodLine0) {
    let i = methodLine0 - 1;
    while (i >= 0 && lines[i].trim() === '') i--;
    if (i >= 0 && lines[i].trim() === '*/') {
        while (i >= 0) {
            if (lines[i].trim().startsWith('/**')) return i;
            i--;
        }
    }
    return methodLine0;
}

const ops = [];

function addDelete(startLine1, endLine1) {
    const jsDocStart0 = findJSDocStart(lines, startLine1 - 1);
    ops.push({ start0: jsDocStart0, end0: endLine1 - 1, replacement: [] });
}

function addFacade(startLine1, endLine1, facadeLines) {
    const jsDocStart0 = findJSDocStart(lines, startLine1 - 1);
    ops.push({ start0: jsDocStart0, end0: endLine1 - 1, replacement: facadeLines });
}

// Now let me verify exact end lines by finding '    }' at known positions
function verifyEndLine(line1, expected) {
    if (lines[line1 - 1].trim() !== '}') {
        console.error(`VERIFY FAIL: Line ${line1} is "${lines[line1 - 1].trim()}" (expected "}")`);
        // Try to find the actual closing brace nearby
        for (let delta = -5; delta <= 5; delta++) {
            const idx = line1 - 1 + delta;
            if (idx >= 0 && idx < lines.length && lines[idx].trim() === '}') {
                console.error(`  -> Found } at line ${idx + 1}`);
            }
        }
        return false;
    }
    return true;
}

// Verify all end lines (these are the method closing braces)
const endLines = [537, 550, 570, 589, 675, 843, 905, 946, 993, 1114, 1341,
    1433, 1450, 1482, 1686, 1713, 1767, 1825, 1925, 1953, 2036, 2091,
    2278, 2327, 2405, 2495, 2551, 2562, 2648, 3246, 3368];

let allOk = true;
for (const el of endLines) {
    if (!verifyEndLine(el)) allOk = false;
}
if (!allOk) {
    console.error('Some end lines are wrong. Aborting.');
    process.exit(1);
}
console.log('All end lines verified.');

// ==================== Define operations ====================

// fetchTransitivePackageMetadata: 3342-3368 -> facade
addFacade(3342, 3368, [
    '',
    '    public async fetchTransitivePackageMetadata(packages: TransitivePackage[]): Promise<void> {',
    '        return this._packageService.fetchTransitivePackageMetadata(packages);',
    '    }',
]);

// extractReadmeFromPackage: 3047-3246 -> facade
addFacade(3047, 3246, [
    '',
    '    public async extractReadmeFromPackage(packageId: string, version: string, source?: string): Promise<string | null> {',
    '        return this._packageService.extractReadmeFromPackage(packageId, version, source);',
    '    }',
]);

// getPackageSearchMetadata: 2573-2648 -> delete
addDelete(2573, 2648);

// getPackageIconUrl: 2556-2562 -> delete
addDelete(2556, 2562);

// checkPackageUpdatesMinimal: 2502-2551 -> facade
addFacade(2502, 2551, [
    '',
    '    async checkPackageUpdatesMinimal(',
    '        installedPackages: InstalledPackage[],',
    '        includePrerelease: boolean',
    '    ): Promise<{ id: string; installedVersion: string; latestVersion: string; sourceUrl?: string }[]> {',
    '        return this._packageService.checkPackageUpdatesMinimal(installedPackages, includePrerelease);',
    '    }',
]);

// checkPackageUpdates: 2414-2495 -> facade
addFacade(2414, 2495, [
    '',
    '    async checkPackageUpdates(',
    '        installedPackages: InstalledPackage[],',
    '        includePrerelease: boolean',
    '    ): Promise<{',
    '        id: string;',
    '        installedVersion: string;',
    '        latestVersion: string;',
    '        iconUrl?: string;',
    '        verified?: boolean;',
    '        authors?: string;',
    '        sourceUrl?: string;',
    '    }[]> {',
    '        return this._packageService.checkPackageUpdates(installedPackages, includePrerelease);',
    '    }',
]);

// getPackageMetadataFromNuspec: 2332-2405 -> delete
addDelete(2332, 2405);

// getPackageMetadataFromSearch: 2283-2327 -> delete
addDelete(2283, 2327);

// getPackageMetadataFromSource: 2093-2278 -> delete
addDelete(2093, 2278);

// getPackageMetadata: 2038-2091 -> facade
addFacade(2038, 2091, [
    '',
    '    async getPackageMetadata(packageId: string, version: string, source?: string): Promise<PackageMetadata | null> {',
    '        return this._packageService.getPackageMetadata(packageId, version, source);',
    '    }',
]);

// getOfflineMetadata: 1959-2036 -> delete
addDelete(1959, 2036);

// resolveGlobalPackagesFolder: 1931-1953 -> delete
addDelete(1931, 1953);

// getPackageVersionsFromSource: 1827-1925 -> delete
addDelete(1827, 1925);

// raceForFirstResultWithIndex: 1773-1825 -> delete
addDelete(1773, 1825);

// raceForFirstResult: 1720-1767 -> delete
addDelete(1720, 1767);

// getPackageVersionsWithSource: 1693-1713 -> delete
addDelete(1693, 1713);

// getPackageVersions: 1638-1686 -> facade
addFacade(1638, 1686, [
    '',
    '    async getPackageVersions(packageId: string, source?: string, includePrerelease?: boolean, take: number = 20): Promise<string[]> {',
    '        return this._packageService.getPackageVersions(packageId, source, includePrerelease, take);',
    '    }',
]);

// checkUrlExistsHttp1: 1455-1482 -> delete
addDelete(1455, 1482);

// checkUrlExists: 1439-1450 -> delete
addDelete(1439, 1450);

// resolveIconUrl: 1355-1433 -> delete
addDelete(1355, 1433);

// searchPackages: 1116-1341 -> facade
addFacade(1116, 1341, [
    '',
    '    async searchPackages(query: string, sources?: string[], includePrerelease?: boolean, liteMode?: boolean, take?: number, exactMatch?: boolean): Promise<PackageSearchResult[]> {',
    '        return this._packageService.searchPackages(query, sources, includePrerelease, liteMode, take, exactMatch);',
    '    }',
]);

// searchPackagesViaApi: 1007-1114 -> delete
addDelete(1007, 1114);

// quickSearchSource: 951-993 -> delete
addDelete(951, 993);

// quickSearchNugetOrg: 910-946 -> delete
addDelete(910, 946);

// quickSearchGrouped: 856-905 -> facade
addFacade(856, 905, [
    '',
    '    async quickSearchGrouped(',
    '        query: string,',
    '        sources: Array<{ name: string; url: string }>,',
    '        includePrerelease?: boolean,',
    '        take: number = 5',
    '    ): Promise<QuickSearchSourceResult[]> {',
    '        return this._packageService.quickSearchGrouped(query, sources, includePrerelease, take);',
    '    }',
]);

// autocompletePackageId: 688-843 -> facade
addFacade(688, 843, [
    '',
    '    async autocompletePackageId(',
    '        query: string,',
    '        sources?: string[],',
    '        includePrerelease?: boolean,',
    '        take: number = 10',
    '    ): Promise<string[]> {',
    '        return this._packageService.autocompletePackageId(query, sources, includePrerelease, take);',
    '    }',
]);

// fetchInstalledPackageMetadata: 596-675 -> facade
addFacade(596, 675, [
    '',
    '    private async fetchInstalledPackageMetadata(packages: InstalledPackage[]): Promise<void> {',
    '        return this._packageService.fetchInstalledPackageMetadata(packages);',
    '    }',
]);

// getPackageSize: 576-589 -> facade
addFacade(576, 589, [
    '',
    '    async getPackageSize(packageId: string, version: string, sourceUrl?: string): Promise<number> {',
    '        return this._packageService.getPackageSize(packageId, version, sourceUrl);',
    '    }',
]);

// getVulnerabilities: 556-570 -> delete
addDelete(556, 570);

// mapSeverity: 542-550 -> delete
addDelete(542, 550);

// fetchVulnerabilityData: 478-537 -> delete
addDelete(478, 537);

// Sort descending by start position
ops.sort((a, b) => b.start0 - a.start0);

// Validate no overlaps
for (let i = 0; i < ops.length - 1; i++) {
    if (ops[i].start0 <= ops[i + 1].end0) {
        console.error(`OVERLAP: op[${i}] start=${ops[i].start0 + 1} <= op[${i + 1}] end=${ops[i + 1].end0 + 1}`);
        console.error(`  op[${i}]: lines ${ops[i].start0 + 1}-${ops[i].end0 + 1}`);
        console.error(`  op[${i + 1}]: lines ${ops[i + 1].start0 + 1}-${ops[i + 1].end0 + 1}`);
        process.exit(1);
    }
}

console.log(`Applying ${ops.length} operations...`);
for (const op of ops) {
    const count = op.end0 - op.start0 + 1;
    lines.splice(op.start0, count, ...op.replacement);
}

console.log(`Result: ${lines.length} lines (was ${totalLines}, delta ${lines.length - totalLines})`);
fs.writeFileSync(filePath, lines.join(eol), 'utf8');
console.log('Done.');
