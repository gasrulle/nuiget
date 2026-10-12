#!/usr/bin/env node
// Generates docs/protocol.md from src/protocol/messages.ts using the TypeScript compiler API.
// `--check` regenerates in memory and exits 1 when the committed file has drifted.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_PATH = path.join(repoRoot, 'src/protocol/messages.ts');
const OUTPUT_PATH = path.join(repoRoot, 'docs/protocol.md');
const TYPE_FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias;
const checkOnly = process.argv.includes('--check');

function loadCompilerOptions() {
    const configPath = path.join(repoRoot, 'tsconfig.json');
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
    if (error) {
        throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    }
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, repoRoot);
    return { ...parsed.options, noEmit: true };
}

function findInterface(sourceFile, name) {
    const declaration = sourceFile.statements.find(
        (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
    );
    if (!declaration) {
        throw new Error(`interface ${name} not found in ${path.relative(repoRoot, MESSAGES_PATH)}`);
    }
    return declaration;
}

function memberName(member) {
    const { name } = member;
    if (ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    throw new Error(`unsupported member name kind ${ts.SyntaxKind[name.kind]}`);
}

function stripCommentMarkers(comment) {
    return comment.replace(/^\/\/\s*|^\/\*+\s*|\s*\*\/$/g, '').replace(/\s+/g, ' ').trim();
}

/** JSDoc text plus trailing `// …` comments on the member line. */
function collectNotes(member, sourceFile) {
    const notes = [];
    for (const doc of ts.getJSDocCommentsAndTags(member)) {
        if (ts.isJSDoc(doc) && doc.comment) {
            notes.push(ts.getTextOfJSDocComment(doc.comment) ?? '');
        }
    }
    const text = sourceFile.getFullText();
    for (const range of ts.getTrailingCommentRanges(text, member.end) ?? []) {
        notes.push(stripCommentMarkers(text.slice(range.pos, range.end)));
    }
    return notes.map((note) => note.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
}

/** The last `// Group` line comment directly above the member, without any parenthetical explanation. */
function leadingGroupComment(member, sourceFile) {
    const text = sourceFile.getFullText();
    const ranges = (ts.getLeadingCommentRanges(text, member.getFullStart()) ?? [])
        .filter((range) => range.kind === ts.SyntaxKind.SingleLineCommentTrivia);
    const last = ranges[ranges.length - 1];
    return last ? stripCommentMarkers(text.slice(last.pos, last.end)).replace(/\s*\(.*\)$/, '') : undefined;
}

// `InTypeAlias` expands the outermost alias so payload shapes are visible, which also turns the
// "no payload" idiom into its index-signature form; print it back as the idiom used in the source.
const EMPTY_OBJECT_TEXT = '{ [x: string]: never; }';

function typeText(checker, typeNode, enclosing) {
    const text = checker.typeToString(checker.getTypeAtLocation(typeNode), enclosing, TYPE_FLAGS);
    return text === EMPTY_OBJECT_TEXT ? 'Record<string, never>' : text;
}

function requestRows(checker, sourceFile) {
    let group = '';
    return findInterface(sourceFile, 'RequestMap').members.map((member) => {
        if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type)) {
            throw new Error(`RequestMap member ${memberName(member)} must be a property with an inline type literal`);
        }
        group = leadingGroupComment(member, sourceFile) ?? group;
        const parts = {};
        for (const property of member.type.members) {
            if (!ts.isPropertySignature(property) || !property.type) {
                continue;
            }
            parts[memberName(property)] = typeText(checker, property.type, property);
        }
        if (!parts.payload || !parts.result) {
            throw new Error(`RequestMap member ${memberName(member)} must declare payload and result`);
        }
        return {
            group,
            name: memberName(member),
            payload: parts.payload,
            result: parts.result,
            chunk: parts.chunk ?? '',
            notes: collectNotes(member, sourceFile),
        };
    });
}

function eventRows(checker, sourceFile) {
    return findInterface(sourceFile, 'EventMap').members.map((member) => {
        if (!ts.isPropertySignature(member) || !member.type) {
            throw new Error(`EventMap member ${memberName(member)} must be a typed property`);
        }
        return {
            name: memberName(member),
            payload: typeText(checker, member.type, member),
            notes: collectNotes(member, sourceFile),
        };
    });
}

function code(text) {
    return text ? `\`${text.replace(/\|/g, '\\|')}\`` : '—';
}

function cell(text) {
    return text ? text.replace(/\|/g, '\\|') : '';
}

function table(headers, rows) {
    const lines = [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ];
    return lines.join('\n');
}

function render(requests, events) {
    const source = path.relative(repoRoot, MESSAGES_PATH).split(path.sep).join('/');
    const sections = [
        `<!-- Generated by scripts/gen-protocol-docs.mjs from ${source}. Do not edit by hand: run \`npm run docs:protocol\`. -->`,
        '',
        '# Webview ↔ host protocol',
        '',
        `Generated from [\`${source}\`](../${source}) (\`RequestMap\` and \`EventMap\`). CI runs`,
        '`npm run docs:protocol:check` and fails when this file is out of date; see',
        '[ADR-007](./adr/007-protocol.md) for the envelope rules.',
        '',
        'Every request carries an `id`; the host answers with exactly one terminal response (ok or error)',
        'per id, optionally preceded by stream chunks of the listed chunk type. Events flow host → webview',
        'without correlation. Both webviews share the same maps; surface-specific requests are rejected with',
        '`unsupported` elsewhere.',
        '',
        `## Requests (${requests.length})`,
        '',
        table(
            ['Group', 'Request', 'Payload', 'Result', 'Chunk', 'Notes'],
            requests.map((row) => [cell(row.group), code(row.name), code(row.payload), code(row.result), code(row.chunk), cell(row.notes)]),
        ),
        '',
        `## Events (${events.length})`,
        '',
        table(
            ['Event', 'Payload', 'Notes'],
            events.map((row) => [code(row.name), code(row.payload), cell(row.notes)]),
        ),
        '',
    ];
    return sections.join('\n');
}

async function main() {
    const program = ts.createProgram([MESSAGES_PATH], loadCompilerOptions());
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(MESSAGES_PATH);
    if (!sourceFile) {
        throw new Error(`could not load ${MESSAGES_PATH}`);
    }

    const output = render(requestRows(checker, sourceFile), eventRows(checker, sourceFile));
    const relativeOutput = path.relative(repoRoot, OUTPUT_PATH);

    if (checkOnly) {
        const current = await readFile(OUTPUT_PATH, 'utf8').catch(() => null);
        if (current === null) {
            console.error(`docs:protocol:check — ${relativeOutput} is missing; run \`npm run docs:protocol\`.`);
            process.exit(1);
        }
        if (current.replace(/\r\n/g, '\n') !== output) {
            console.error(`docs:protocol:check — ${relativeOutput} is out of date; run \`npm run docs:protocol\` and commit the result.`);
            process.exit(1);
        }
        console.log(`docs:protocol:check — ${relativeOutput} is up to date.`);
        return;
    }

    await writeFile(OUTPUT_PATH, output, 'utf8');
    console.log(`docs:protocol — wrote ${relativeOutput}`);
}

main().catch((error) => {
    console.error('docs:protocol — failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
