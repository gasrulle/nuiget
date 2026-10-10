---
description: 'Keep existing nUIget documentation aligned with directly related changes'
applyTo: 'src/**/*.ts,src/**/*.tsx,src/**/*.css,*.mjs,package.json,README.md,ARCHITECTURE.md,CHANGELOG.md,.github/**/*.md'
---

# Documentation Updates

Update the documentation directly affected by a change. Do not create a new
documentation system, API reference, hook, schedule, or dependency merely to
satisfy a generic documentation template.

| File | Responsibility |
| --- | --- |
| `README.md` | User-facing behavior, settings, commands, prerequisites |
| `ARCHITECTURE.md` | Components, protocols, data flows, state, caching, technical decisions |
| `.github/copilot-instructions.md` | Agent workflow, validation requirements, verified pitfalls |
| `CHANGELOG.md` | Unreleased features, fixes, and behavior changes |

- Keep architecture descriptive and agent instructions prescriptive; link rather
  than duplicate detailed explanations.
- Add changelog entries only under `## [Unreleased]`. Added entries have a bold
  headline and brief description; Fixed and Changed entries have a bold headline
  only. Never rewrite previously released sections.
- Check method names, configuration keys, and examples against the current code.
  Avoid brittle source line numbers and hard-coded test counts.
- Preserve the existing Markdown style and relative links.
- Use only documentation validation tooling already present. Do not assume
  `docs:build`, `docs:lint`, or similar scripts exist.
- Documentation-only changes need structural/link/diff checks, not application
  builds, benchmarks, or VSIX packaging. Application code changes must follow the
  mandatory validation in `.github/copilot-instructions.md`.
- A documentation update does not authorize committing, pushing, publishing,
  or writing memory.
