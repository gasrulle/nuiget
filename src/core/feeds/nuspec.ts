/**
 * The package manifest (`.nuspec`) as package metadata. A nuspec is package content, not configuration: a document with a
 * DOCTYPE is refused outright, so no entity a package defines is ever expanded.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { PackageDependency, PackageDependencyGroup, PackageMetadata } from '../../protocol/domain';

/** Largest nuspec parsed; real ones are a few KB. */
export const MAX_NUSPEC_CHARS = 1024 * 1024;
/** Target framework of a dependency group without one, and of dependencies declared outside any group. */
export const ANY_FRAMEWORK = 'Any';

export interface Nuspec {
    id: string;
    version: string;
    title?: string;
    description: string;
    authors: string;
    /** SPDX expression of `<license type="expression">`; a `type="file"` license has none. */
    license?: string;
    licenseUrl?: string;
    projectUrl?: string;
    iconUrl?: string;
    /** Path of the README inside the package. */
    readme?: string;
    dependencies: PackageDependencyGroup[];
}

const ATTRIBUTE_PREFIX = '@_';
const TEXT_NODE = '#text';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    textNodeName: TEXT_NODE,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    // The five XML entities and numeric references (`&#169;`); without a DOCTYPE there is nothing else to expand.
    htmlEntities: true,
    isArray: (tagName: string) => tagName === 'group' || tagName === 'dependency',
});

type XmlObject = Record<string, unknown>;

function isObject(value: unknown): value is XmlObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The text of an element that may carry attributes (`<license type="expression">MIT</license>`). */
function textOf(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (isObject(value) && typeof value[TEXT_NODE] === 'string') {
        return value[TEXT_NODE];
    }
    return undefined;
}

function optionalText(value: unknown): string | undefined {
    const text = textOf(value)?.trim();
    return text ? text : undefined;
}

function attribute(value: unknown, name: string): string | undefined {
    const attr = isObject(value) ? value[`${ATTRIBUTE_PREFIX}${name}`] : undefined;
    return typeof attr === 'string' && attr.trim() !== '' ? attr.trim() : undefined;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function parseDependencies(container: unknown): PackageDependency[] {
    const dependencies: PackageDependency[] = [];
    for (const entry of asArray(isObject(container) ? container.dependency : undefined)) {
        const id = attribute(entry, 'id');
        if (id) {
            dependencies.push({ id, versionRange: attribute(entry, 'version') ?? '*' });
        }
    }
    return dependencies;
}

/**
 * Groups as declared, an empty group included (it says the framework is supported and needs nothing). Dependencies
 * outside any group form one `Any` group, read only when the nuspec declares no group.
 */
function parseDependencyGroups(dependencies: unknown): PackageDependencyGroup[] {
    if (!isObject(dependencies)) {
        return [];
    }
    const groups = asArray(dependencies.group);
    if (groups.length > 0) {
        return groups.map(group => ({
            targetFramework: attribute(group, 'targetFramework') ?? ANY_FRAMEWORK,
            dependencies: parseDependencies(group),
        }));
    }
    const ungrouped = parseDependencies(dependencies);
    return ungrouped.length > 0 ? [{ targetFramework: ANY_FRAMEWORK, dependencies: ungrouped }] : [];
}

/** Parse a nuspec; `undefined` for a document that is not well-formed, has a DOCTYPE, is too large, or has no id or version. */
export function parseNuspec(xml: string): Nuspec | undefined {
    const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
    if (source.length > MAX_NUSPEC_CHARS || /<!DOCTYPE/i.test(source) || XMLValidator.validate(source) !== true) {
        return undefined;
    }
    let document: unknown;
    try {
        document = parser.parse(source);
    } catch {
        return undefined;
    }
    const metadata = isObject(document) && isObject(document.package) ? document.package.metadata : undefined;
    if (!isObject(metadata)) {
        return undefined;
    }
    const id = optionalText(metadata.id);
    const version = optionalText(metadata.version);
    if (!id || !version) {
        return undefined;
    }
    const license = attribute(metadata.license, 'type') === 'expression' ? optionalText(metadata.license) : undefined;
    return {
        id,
        version,
        title: optionalText(metadata.title),
        description: optionalText(metadata.description) ?? '',
        authors: optionalText(metadata.authors) ?? '',
        license,
        licenseUrl: optionalText(metadata.licenseUrl),
        projectUrl: optionalText(metadata.projectUrl),
        iconUrl: optionalText(metadata.iconUrl),
        readme: optionalText(metadata.readme),
        dependencies: parseDependencyGroups(metadata.dependencies),
    };
}

/** The package metadata a nuspec provides; downloads, publish date, size and vulnerabilities come from elsewhere. */
export function nuspecToMetadata(nuspec: Nuspec, origin: { sourceUrl?: string; offline?: boolean } = {}): PackageMetadata {
    const metadata: PackageMetadata = {
        id: nuspec.id,
        version: nuspec.version,
        description: nuspec.description,
        authors: nuspec.authors,
        dependencies: nuspec.dependencies,
    };
    if (nuspec.license !== undefined) {
        metadata.license = nuspec.license;
    }
    if (nuspec.licenseUrl !== undefined) {
        metadata.licenseUrl = nuspec.licenseUrl;
    }
    if (nuspec.projectUrl !== undefined) {
        metadata.projectUrl = nuspec.projectUrl;
    }
    if (origin.sourceUrl !== undefined) {
        metadata.sourceUrl = origin.sourceUrl;
    }
    if (origin.offline) {
        metadata.offline = true;
    }
    return metadata;
}
