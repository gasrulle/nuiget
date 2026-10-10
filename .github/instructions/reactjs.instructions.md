---
description: 'React webview conventions for nUIget'
applyTo: 'src/webview/app/**/*.ts,src/webview/app/**/*.tsx,src/webview/app/**/*.css,src/webview/sidebar/**/*.ts,src/webview/sidebar/**/*.tsx,src/webview/sidebar/**/*.css'
---

# React Webviews

Read the relevant sections of `ARCHITECTURE.md` before editing. Use the React
version declared in `package.json`; this project renders client-only VS Code
webviews bundled with esbuild, not an SSR application.

## Preserve the existing architecture

- Keep state in its documented owner and use the existing message protocol,
  hooks, caches, and cross-panel synchronization.
- Request backend data through the VS Code messaging bridge. Do not introduce
  React Router, Server Components, Server Actions, or a separate fetching/state
  library merely to follow generic web-app patterns.
- Keep state updater functions pure. Do not send messages or assign variables
  inside an updater for use immediately after the setter; use the established
  synchronous ref-mirror pattern when needed.
- Dispose timers and message listeners and reject stale asynchronous responses.
- Preserve `memo`, `useMemo`, and `useCallback` where they support existing
  rendering boundaries. React Compiler is not configured in `esbuild.mjs`.
- Use the existing TanStack virtualizer for long lists and stable package keys.
- Retain `forwardRef` where used; ref-as-prop migration is not required for
  React 19 compatibility.

## Styling and accessibility

- Use the existing CSS files, `--vscode-*` theme variables, and shared SVG icons.
- Preserve light, dark, high-contrast, narrow-sidebar, and reduced-motion behavior.
- Use semantic controls, accessible names, keyboard interaction, and deliberate
  focus management. Decorative images have empty alt text.
- Render package Markdown only through `renderMarkdownToHtml()`.

## Tests

- Use Vitest and React Testing Library with the existing frontend setup.
- Test observable behavior, asynchronous messaging, failure paths, and keyboard
  interaction. Do not weaken assertions merely to match a failure.
- Development StrictMode still checks effect setup/cleanup and render purity.
  Verify cleanup and the render wrapper before changing call-count assertions.
- Follow the validation requirements in `.github/copilot-instructions.md`.

## Maintenance

These repo-specific rules replace the generic React instructions removed in
[Awesome Copilot's content review](https://github.com/github/awesome-copilot/commit/b1f3346ef2d05f445b19a46bfeaeb887010b323d).
