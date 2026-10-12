import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { XmlParseError } from '../project/xml';

/** One element of a `nuget.config`, with its children in document order. */
export interface ConfigElement {
    name: string;
    attributes: Record<string, string>;
    children: ConfigElement[];
}

const ATTRIBUTES = ':@';
const ATTRIBUTE_PREFIX = '@_';
const TEXT_NODE = '#text';

// Order is kept because `<clear />` only discards what precedes it. Entities are not expanded and
// nothing is converted: every value stays the text that is in the file.
const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    textNodeName: TEXT_NODE,
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    ignoreDeclaration: true,
});

/** Parse a `nuget.config` into its top-level elements. Validates first: the parser itself accepts malformed input. */
export function parseConfigXml(text: string, filePath?: string): ConfigElement[] {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const validation = XMLValidator.validate(source);
    if (validation !== true) {
        throw new XmlParseError(filePath, `${validation.err.msg} (line ${validation.err.line})`);
    }
    try {
        return toElements(parser.parse(source));
    } catch (error) {
        throw new XmlParseError(filePath, error instanceof Error ? error.message : String(error));
    }
}

/** Child elements named `name`, compared without regard to case. */
export function childrenNamed(element: ConfigElement | undefined, name: string): ConfigElement[] {
    return (element?.children ?? []).filter(child => child.name.toLowerCase() === name.toLowerCase());
}

/** Attribute value, with the name compared without regard to case. */
export function attribute(element: ConfigElement, name: string): string | undefined {
    for (const [key, value] of Object.entries(element.attributes)) {
        if (key.toLowerCase() === name.toLowerCase()) {
            return value;
        }
    }
    return undefined;
}

function toElements(nodes: unknown): ConfigElement[] {
    if (!Array.isArray(nodes)) {
        return [];
    }
    const elements: ConfigElement[] = [];
    for (const node of nodes as unknown[]) {
        if (typeof node !== 'object' || node === null) {
            continue;
        }
        const record = node as Record<string, unknown>;
        const name = Object.keys(record).find(key => key !== ATTRIBUTES && key !== TEXT_NODE);
        if (name === undefined) {
            continue;
        }
        const attributes: Record<string, string> = {};
        for (const [key, value] of Object.entries((record[ATTRIBUTES] ?? {}) as Record<string, unknown>)) {
            if (key.startsWith(ATTRIBUTE_PREFIX) && typeof value === 'string') {
                attributes[key.slice(ATTRIBUTE_PREFIX.length)] = value;
            }
        }
        elements.push({ name, attributes, children: toElements(record[name]) });
    }
    return elements;
}
