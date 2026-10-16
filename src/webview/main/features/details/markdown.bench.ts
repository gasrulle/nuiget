// @vitest-environment jsdom
/**
 * Benchmarks for the README renderer of the 2.0 details pane (`renderMarkdownToHtml`: marked, highlighting, DOMPurify
 * and the https upgrade) over a small, a medium and a large README, the inputs of the 1.x `markdown` benchmark it
 * replaces (P8.2a, D8; the P8.2 ruling names this subject).
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../../../test/benchmarks/benchmark';
import * as markdown from './markdown';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { renderMarkdownToHtml } = markdown;

const SMALL_README = `# My Package

A simple utility library.

## Installation

\`\`\`bash
dotnet add package MyPackage
\`\`\`

## Usage

\`\`\`csharp
var result = MyPackage.DoThing();
\`\`\`
`;

const MEDIUM_README = `# Newtonsoft.Json

## Overview

Json.NET is a popular high-performance JSON framework for .NET.

## Features

- Flexible JSON serializer for converting between .NET objects and JSON
- LINQ to JSON for manually reading and writing JSON
- High performance: faster than .NET's built-in JSON serializers

## Installation

\`\`\`bash
dotnet add package Newtonsoft.Json --version 13.0.3
\`\`\`

## Quick Start

### Serialize

\`\`\`csharp
Product product = new Product();
product.Name = "Apple";
product.ExpiryDate = new DateTime(2008, 12, 28);
product.Price = 3.99M;

string output = JsonConvert.SerializeObject(product);
// {"Name":"Apple","ExpiryDate":"2008-12-28T00:00:00","Price":3.99}
\`\`\`

### Deserialize

\`\`\`csharp
string json = @"{'Name':'Bad Boys','ReleaseDate':'1995-4-7T00:00:00','Genres':['Action','Comedy']}";
Movie m = JsonConvert.DeserializeObject<Movie>(json);
string name = m.Name; // Bad Boys
\`\`\`

## Supported Frameworks

| Framework | Version |
|-----------|---------|
| .NET Standard | 2.0+ |
| .NET | 6.0+ |
| .NET Framework | 4.5+ |

## License

MIT License
`;

const LARGE_README = MEDIUM_README.repeat(5);

describe('webview details — renderMarkdownToHtml', () => {
    test('small README (~150 chars)', async (context) => {
        await runBenchmark(context, 'small README (~150 chars)', () => {
            renderMarkdownToHtml(SMALL_README);
        });
    });

    test('medium README (~1KB)', async (context) => {
        await runBenchmark(context, 'medium README (~1KB)', () => {
            renderMarkdownToHtml(MEDIUM_README);
        });
    });

    test('large README (~5KB)', async (context) => {
        await runBenchmark(context, 'large README (~5KB)', () => {
            renderMarkdownToHtml(LARGE_README);
        });
    });
});
