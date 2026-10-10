<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-efficiency/references/patterns.md -->

# Canonical Patterns

Load this reference only when concrete examples are useful during implementation.

## Dependency Cache

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

Adapt the cache path and invalidation file to the repository's ecosystem. For nUIget, preserve its
`npm install --no-audit --no-fund` CI policy; a cache does not require switching to `npm ci`.

## Cancel Stale Runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Scope Triggers

```yaml
on:
  push:
    paths:
      - "src/**"
      - "tests/**"
      - "package.json"
```

Use `paths-ignore` when exclusions are easier to maintain than inclusions. Ensure required
validation is not skipped.

## Job-Level Changed-File Gating

Use a small change-detection step that emits explicit outputs such as:

- `docs_relevant`
- `runtime_relevant`
- `compat_relevant`
- `run_tests`

Gate downstream jobs on those outputs only when the resulting policy preserves required checks.

## Matrix Reduction

Use the minimum matrix that matches the decision:

- Full matrix on release
- Reduced compatibility matrix on sensitive runtime surfaces
- Single representative leg for ordinary code changes only when documented compatibility
  requirements allow it

## Optional Write-Back Job

Use label-driven or manual triggers for jobs that mutate the PR branch, such as formatting bots.
Do not trigger a test push or perform a branch mutation without explicit user authorization.
