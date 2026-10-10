---
description: 'TypeScript conventions for the nUIget extension and webviews'
applyTo: 'src/**/*.ts,src/**/*.tsx'
---

# TypeScript

- Read `package.json`, `tsconfig.json`, and the relevant `ARCHITECTURE.md`
  sections rather than assuming a language version or output format.
- Write TypeScript imports/exports using existing patterns. Preserve the
  extension's CommonJS bundle and the browser webviews' IIFE bundles configured
  in `esbuild.mjs`; do not convert the build to ESM without an explicit request.
- Preserve strict type checking, PascalCase component/service filenames, and
  existing formatting. Do not rename files to satisfy a generic convention.
- Reuse canonical contracts in `NuGetTypes.ts`, validators in `NuGetUtils.ts`,
  and the existing service composition and logging helpers.
- Use discriminated unions and narrowing for message handlers. Avoid new `any`
  types and unsafe assertions; respect the existing lint exceptions in tests.
- Keep asynchronous results scoped to the request that produced them. Dispose
  resources and surface errors through the repository's logging/notification
  paths.
- Validate external input at the extension boundary, not just in the webview.
- Use existing tests, fixtures, and mocks. Follow the validation requirements in
  `.github/copilot-instructions.md`, including VSIX packaging for TypeScript changes.

These repo-specific rules replace the generic TypeScript instructions removed in
[Awesome Copilot's content review](https://github.com/github/awesome-copilot/commit/b1f3346ef2d05f445b19a46bfeaeb887010b323d).
