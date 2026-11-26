// Captures what nuget.org says about the deprecation of one package version and writes it as tracked fixtures (plan item
// UX-P5.2a, architecture-advisor ruling of 2026-11-26, DO 10): the version's registration leaf, the catalog document the
// leaf points to, and the package's search entry, each trimmed to the fields nUIget reads. The endpoints come from the
// service index, so the capture follows nuget.org's own resource URLs.
//
// Usage:
//   node scripts/capture-feed-fixture.mjs <package id> <version> [--out <dir>]
//
// Writes `<id>.<version>.registration-leaf.json`, `<id>.<version>.catalog.json` and `<id>.search.json` (lower-cased id)
// into `src/core/feeds/__fixtures__/deprecation/real/` unless `--out` names another folder. Needs access to nuget.org.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_INDEX = 'https://api.nuget.org/v3/index.json';
const HEADERS = { 'User-Agent': 'nuiget-fixture-capture', Accept: 'application/json' };

function usage(message) {
    console.error(`capture-feed-fixture: ${message}`);
    console.error('usage: node scripts/capture-feed-fixture.mjs <package id> <version> [--out <dir>]');
    process.exit(2);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1] ?? usage('--out needs a folder')) : path.join(repoRoot, 'src/core/feeds/__fixtures__/deprecation/real');
const positional = outIndex < 0 ? args : args.filter((_, index) => index !== outIndex && index !== outIndex + 1);
const [packageId, version] = positional;
if (!packageId || !version || !/^[A-Za-z0-9_.-]+$/.test(packageId) || !/^[A-Za-z0-9_.+-]+$/.test(version)) {
    usage('give a package id and a version');
}

async function getJson(url) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
        throw new Error(`${url} answered HTTP ${response.status}`);
    }
    return response.json();
}

function resource(index, prefix) {
    const found = (index.resources ?? []).find(entry => typeof entry['@type'] === 'string' && entry['@type'].startsWith(prefix));
    if (!found) {
        throw new Error(`the service index has no ${prefix} resource`);
    }
    return found['@id'];
}

/** Only the named fields, in that order, that the document has. */
function pick(document, fields) {
    return Object.fromEntries(fields.filter(field => document[field] !== undefined).map(field => [field, document[field]]));
}

const lowerId = packageId.toLowerCase();
const lowerVersion = version.toLowerCase();
const index = await getJson(SERVICE_INDEX);
const registrationBase = resource(index, 'RegistrationsBaseUrl/3.6.0').replace(/\/$/, '');
const searchBase = resource(index, 'SearchQueryService/3.5.0');

const leaf = await getJson(`${registrationBase}/${lowerId}/${lowerVersion}.json`);
if (typeof leaf.catalogEntry !== 'string') {
    throw new Error('the registration leaf carries no catalog URL');
}
const catalog = await getJson(leaf.catalogEntry);
const search = await getJson(`${searchBase}?q=${encodeURIComponent(`packageid:${packageId}`)}&prerelease=true&semVerLevel=2.0.0&take=1`);
const entry = (search.data ?? []).find(candidate => String(candidate.id).toLowerCase() === lowerId);
if (!entry) {
    throw new Error(`the search service does not know ${packageId}`);
}

const captured = new Date().toISOString();
const files = {
    [`${lowerId}.${lowerVersion}.registration-leaf.json`]: { captured, url: `${registrationBase}/${lowerId}/${lowerVersion}.json`, document: pick(leaf, ['@id', 'catalogEntry', 'listed', 'published']) },
    [`${lowerId}.${lowerVersion}.catalog.json`]: { captured, url: leaf.catalogEntry, document: pick(catalog, ['@id', 'id', 'version', 'listed', 'deprecation']) },
    [`${lowerId}.search.json`]: { captured, url: `${searchBase}?q=packageid:${packageId}&prerelease=true&semVerLevel=2.0.0&take=1`, document: { data: [pick(entry, ['id', 'version', 'deprecation', 'verified'])] } },
};
fs.mkdirSync(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(content, null, 2)}\n`);
    console.log(`capture-feed-fixture: wrote ${path.relative(repoRoot, path.join(outDir, name))}`);
}
