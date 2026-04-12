/**
 * Benchmarks for markdown rendering with various README sizes.
 * Uses jsdom environment for DOMPurify.
 */
import { beforeAll, bench, describe } from 'vitest';

// Note: renderMarkdownToHtml requires DOM (DOMPurify).
// These benchmarks only run in jsdom environment.
// If this bench file runs in node env, skip gracefully.

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

describe('renderMarkdownToHtml', () => {
    // Skip if DOM not available
    const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

    if (hasDom) {
        // Dynamic import to avoid node-env errors
        let renderFn: (md: string) => string;

        beforeAll(async () => {
            const mod = await import('../../webview/app/markdownSetup');
            renderFn = mod.renderMarkdownToHtml;
        });

        bench('small README (~150 chars)', () => {
            renderFn(SMALL_README);
        });

        bench('medium README (~1KB)', () => {
            renderFn(MEDIUM_README);
        });

        bench('large README (~5KB)', () => {
            renderFn(LARGE_README);
        });
    } else {
        bench.skip('renderMarkdownToHtml (requires jsdom)', () => { });
    }
});
