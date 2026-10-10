---
name: github-actions-hardening
description: 'Review GitHub Actions workflows for injection, trigger trust boundaries, permissions, secrets, and supply-chain risks.'
---

<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/SKILL.md -->

# GitHub Actions Hardening

A focused security reviewer for GitHub Actions workflows. Reason about Actions-specific trust
boundaries in triggers, permissions, and expression interpolation rather than application-code
vulnerabilities.

## When to Use This Skill

- Reviewing, auditing, hardening, or authoring `.github/workflows/` files
- Questions about `pull_request_target`, `workflow_run`, `issue_comment`, permissions, or
  `GITHUB_TOKEN`
- Pinning actions, handling untrusted input, secrets, OIDC, or self-hosted runners

## Core Insight

GitHub expands `${{ <expr> }}` into a script before the shell executes. If an expression resolves
to data an outside contributor can control, interpolation into `run:` can become command
injection. Pass untrusted values through `env:` and quote shell variables.

## Execution Workflow

### 1. Map triggers and trust boundaries

Read every `on:` trigger. Distinguish who can initiate the event, which workflow definition and
repository context are used, whether untrusted code is checked out or executed, which secrets may
be available, and the effective `GITHUB_TOKEN` permissions.

Do not assume every issue-related or privileged trigger receives a full write token. Token scope
depends on workflow-level and job-level `permissions`, repository and organization defaults, and
GitHub event policies. Inspect the actual workflow and applicable settings; when they are
unavailable, describe the exposure conditionally and state the uncertainty.

Read [`references/triggers-and-privilege.md`](./references/triggers-and-privilege.md) for the
trust-boundary guide.

### 2. Hunt for script injection

For every `run:` block, `script:` in `actions/github-script`, and input to a custom action, inspect
`${{ }}` expressions for attacker-controlled data. Common examples include issue and PR titles or
bodies, branch names, comments, review text, commit messages, and wiki page names.

Read [`references/injection.md`](./references/injection.md) for sinks and safer patterns.

### 3. Check privileged contexts do not execute untrusted code

If a workflow with access to elevated token permissions or secrets checks out PR/fork code and
executes it (for example, build scripts, tests, or dependency lifecycle scripts), report the
specific code-execution path and its actual effective privileges. Do not infer those privileges
from the trigger name alone.

### 4. Audit `permissions:`

Inspect workflow and job `permissions` blocks and determine the effective token scopes. Recommend
least privilege, such as top-level `permissions: {}` and only the minimum per-job grants. If
defaults are not visible, report that as an uncertainty rather than asserting the token is
read/write.

Read [`references/permissions-and-tokens.md`](./references/permissions-and-tokens.md) for scope
guidance and OIDC.

### 5. Audit action references

For each `uses:` reference, identify mutable tags or branches and recommend full-SHA pinning where
appropriate. Keep human-readable version comments and update automation in view.

Read [`references/supply-chain.md`](./references/supply-chain.md) for pinning, artifact/cache
risks, and runner exposure.

### 6. Check secret and output handling

- Do not log secrets or enable shell tracing in steps that handle them.
- Do not pass secrets to untrusted code or unreviewed actions.
- Treat untrusted multiline values written to `$GITHUB_ENV` or `$GITHUB_OUTPUT` as injection risks.
- Consider `persist-credentials: false` when checkout is followed by untrusted code.

### 7. Report findings

Use [`references/report-format.md`](./references/report-format.md). Quote exact workflow lines,
explain attacker impact, and include concrete fixes for serious findings. Do not auto-apply
changes; present them for review.

## Repository and Tooling Boundaries

- Do not silently install scanners, dependencies, or other tooling. If a tool is useful but
  missing, explain the need and ask for authorization before installing it.
- Do not silently change organization, enterprise, or repository settings. Describe the setting
  and its effect; request authorization before changing it.
- Treat external settings and effective token defaults as unknown unless inspected.
- Keep recommendations specific to the repository and its documented validation requirements.

## Severity Guide

| Severity | Meaning | Example |
| --- | --- | --- |
| 🔴 CRITICAL | A concrete path to token/secret theft or RCE reachable by an outside contributor | Untrusted PR code executes in a job with effective write permissions and secrets |
| 🟠 HIGH | Exploitable supply-chain or excessive-scope issue with material impact | Mutable third-party action with access to a write-scoped token |
| 🟡 MEDIUM | Conditional risk or missing hardening with exposure dependent on configuration | Missing `permissions:` block when repository defaults are unknown |
| 🔵 LOW | Hardening gap with low direct impact | First-party action is not SHA-pinned |
| ⚪ INFO | Observation, not a vulnerability | Version comment missing next to a pinned SHA |

## Output Rules

- Start with a findings summary table.
- Group findings by issue type, not by file.
- Quote offending lines and include file and line locations.
- Pair every CRITICAL/HIGH finding with a concrete corrected YAML snippet.
- State uncertainty about effective token permissions or secrets when repository/org settings were
  not inspected.
- Do not claim that an issue trigger automatically has full write access or all secrets.
- If the workflow is already hardened, say what was checked.

## Reference Files

- [`references/triggers-and-privilege.md`](./references/triggers-and-privilege.md)
- [`references/injection.md`](./references/injection.md)
- [`references/permissions-and-tokens.md`](./references/permissions-and-tokens.md)
- [`references/supply-chain.md`](./references/supply-chain.md)
- [`references/report-format.md`](./references/report-format.md)
