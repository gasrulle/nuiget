---
name: github-actions-efficiency
description: 'Audit GitHub Actions workflow efficiency and recommend evidence-based fixes without hiding required validation or changing branches.'
---

<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-efficiency/SKILL.md -->

# GitHub Actions Efficiency

Use this skill as a lean entrypoint for GitHub Actions efficiency work. Inspect the repository,
identify the waste source, and load only the reference material needed for the task.

If no workflows exist, load [`references/actions.md`](./references/actions.md) and define a
baseline before proceeding.

If shell or `gh` CLI access is unavailable, ask the user to provide `.github/workflows/` contents
and recent `gh run list --limit 10` output. If only partial files are provided, say:
"Audit based on provided files only; some insights may be incomplete." Begin responses based only
on workflow files with: "**Static-only analysis** (not confirmed with live runs)."

## Use This Skill When

- The user wants to reduce GitHub Actions runtime, CI cost, or wasted workflow runs.
- The repository has workflows or the user asks about caching, concurrency, path filters, matrix
  reduction, job optimization, or workflow-specific fixes.
- The user needs help creating a workflow or establishing a CI baseline.

## Load Only What You Need

- [`references/actions.md`](./references/actions.md) — audits, job gating, matrix reduction, and
  repository-specific validation constraints.
- [`references/reporting.md`](./references/reporting.md) — when the user asks for a before/after
  efficiency report.
- [`references/patterns.md`](./references/patterns.md) — YAML examples when needed.
- [`references/review-rubric.md`](./references/review-rubric.md) — when reviewing completed
  efficiency work.

## nUIget Constraints

- CI uses `npm ci --no-audit --no-fund` (ADR-000). Keep it: the committed lockfile is what gets
  built and tested. If `npm ci` reports that the lockfile is out of sync, regenerate it with
  `npm install --package-lock-only` and commit it; do not switch CI to `npm install`.
- Preserve the required `npm test`, `npm run bench`, and `npm run test:ui` validation. The UI suite
  may be unavailable in headless/CI-constrained environments, but do not remove or silently skip
  its required check. TypeScript changes also require the documented VSIX packaging verification.
- Do not recommend workflow gating that hides required validation for documentation-only or
  workflow-only changes unless existing policy explicitly allows it.

## Core Workflow

### 1. Measure first

```bash
rg -n "on:|concurrency:|paths:|paths-ignore:|strategy:|matrix:|cache:" .github/workflows
gh run list --limit 10
```

For relevant existing runs, inspect durations and failed logs with read-only `gh run view`.
Look for missing dependency caches, missing concurrency cancellation, over-broad triggers,
duplicate coverage, and expensive jobs that run regardless of change scope.

### 2. Apply guardrails

1. Do not hide required release, schema, migration, shared-library, or repository-mandated test
   coverage.
2. Do not reduce parallelism without evidence and a clear user preference for cost over latency.
3. Preserve documented matrix legs and compatibility commitments.
4. Flag automatic write-back jobs and recommend opt-in triggers rather than silently removing
   them.
5. Keep repository YAML recommendations separate from organization/account settings.

### 3. Select the highest-value fixes

Recommend only changes supported by audit evidence. Rank by estimated daily runner minutes saved
(per-run savings multiplied by runs per day), and keep the list focused:

1. Add dependency caching with lockfile-based keys.
2. Add or correct concurrency cancellation.
3. Remove duplicate workflow coverage without removing required checks.
4. Narrow workflow or job triggers safely.
5. Reduce matrix breadth only where the compatibility policy permits it.
6. Parallelize independent jobs on the critical path.

### 4. Validate safely

- Prefer read-only inspection of existing GitHub runs and local workflow structure.
- Do not push test commits, commit changes, or create, switch, rename, or otherwise mutate branches
  unless the user explicitly authorizes that action.
- Do not trigger workflows that incur material cost or change remote state without authorization.
- If safe live validation is not available, state what was checked locally and what remains
  unverified. Never claim exact savings without before/after run data.

## Required Output

1. **Waste sources** — evidence for the largest cost or latency drivers.
2. **Proposed fixes** — prioritized changes with supporting evidence and guardrail impact.
3. **Validation** — what was checked locally or read-only against existing runs, plus remaining
   risks.
4. **Impact** — expected savings versus measured savings; distinguish PR wall-clock time from
   total runner time.

## References

- [`references/actions.md`](./references/actions.md)
- [`references/reporting.md`](./references/reporting.md)
- [`references/patterns.md`](./references/patterns.md)
- [`references/review-rubric.md`](./references/review-rubric.md)
