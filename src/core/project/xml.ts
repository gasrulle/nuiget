import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type XmlObject = Record<string, unknown>;

/** Raised when a project/props file is not well-formed XML. */
export class XmlParseError extends Error {
    constructor(public readonly filePath: string | undefined, detail: string) {
        super(filePath ? `${filePath}: ${detail}` : detail);
        this.name = 'XmlParseError';
    }
}

const ATTRIBUTE_PREFIX = '@_';
const TEXT_NODE = '#text';

// MSBuild elements that may legitimately repeat; everything else stays a single value so
// `<Version>8.0.0</Version>` reads as a plain string.
const REPEATABLE = new Set([
    'ItemGroup',
    'PropertyGroup',
    'PackageReference',
    'PackageVersion',
    'ProjectReference',
    'Import',
    'ImportGroup',
    'Sdk',
    'Choose',
    'When',
]);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    textNodeName: TEXT_NODE,
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    isArray: (tagName: string) => REPEATABLE.has(tagName),
});

/**
 * Parse MSBuild XML into a plain object tree. Validates first because `XMLParser` is lenient
 * and silently produces garbage for malformed input.
 */
export function parseMsBuildXml(text: string, filePath?: string): XmlObject {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const validation = XMLValidator.validate(source);
    if (validation !== true) {
        throw new XmlParseError(filePath, `${validation.err.msg} (line ${validation.err.line})`);
    }
    try {
        const parsed: unknown = parser.parse(source);
        return isObject(parsed) ? parsed : {};
    } catch (error) {
        throw new XmlParseError(filePath, error instanceof Error ? error.message : String(error));
    }
}

/** The root `<Project>` element of a parsed document, or `undefined`. */
export function rootProject(doc: XmlObject): XmlObject | undefined {
    const project = doc['Project'];
    if (isObject(project)) {
        return project;
    }
    // The parser reads `<Project></Project>` (no attributes, no children) as an empty string.
    return project === '' ? {} : undefined;
}

/** Coerce a parsed value into an array (`undefined` → `[]`, scalar → `[scalar]`). */
export function asArray<T = unknown>(value: unknown): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? (value as T[]) : [value as T];
}

/** Child elements named `name` (case-sensitive, like MSBuild). Empty elements (`<X/>`) are kept as `{}`. */
export function elements(node: unknown, name: string): XmlObject[] {
    if (!isObject(node)) {
        return [];
    }
    return asArray(node[name]).map(child => (isObject(child) ? child : {}));
}

/**
 * Attribute lookup that tolerates the lower-case spellings (`include`, `version`) found in the
 * wild even though MSBuild itself treats attribute names as case-sensitive.
 */
export function attr(node: unknown, name: string): string | undefined {
    if (!isObject(node)) {
        return undefined;
    }
    const exact = node[ATTRIBUTE_PREFIX + name];
    if (typeof exact === 'string') {
        return exact;
    }
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith(ATTRIBUTE_PREFIX) && key.slice(ATTRIBUTE_PREFIX.length).toLowerCase() === wanted) {
            return typeof value === 'string' ? value : value === true ? '' : undefined;
        }
    }
    return undefined;
}

/** Text content of a child element (`<Version>1.0</Version>` or `<Version Condition="…">1.0</Version>`); the last occurrence wins. */
export function childText(node: unknown, name: string): string | undefined {
    if (!isObject(node)) {
        return undefined;
    }
    let result: string | undefined;
    for (const occurrence of asArray(node[name])) {
        const text = textOf(occurrence);
        if (text !== undefined) {
            result = text;
        }
    }
    return result;
}

/** Text content of a parsed element value (plain string or object with a `#text` node). */
export function textOf(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (isObject(value)) {
        const text = value[TEXT_NODE];
        return typeof text === 'string' ? text : undefined;
    }
    return undefined;
}

/** Last definition wins, mirroring MSBuild property evaluation order within one file. */
export function lastPropertyValue(project: XmlObject, propertyName: string): string | undefined {
    let result: string | undefined;
    for (const group of elements(project, 'PropertyGroup')) {
        const value = childText(group, propertyName);
        if (value !== undefined) {
            result = value;
        }
    }
    return result;
}

export function isObject(value: unknown): value is XmlObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
