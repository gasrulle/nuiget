<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-efficiency/references/actions.md -->

# GitHub Actions Efficiency Audit

Load this reference only when the task involves GitHub Actions or CI workflow efficiency.

If the repository is onboarding GitHub Actions for the first time, define a minimal baseline
workflow first, then optimize using the rest of this guide.

## Audit Order

Inspect in this order:

1. If `.github/workflows/` is missing or empty, gather baseline requirements first: triggering
   events, required checks, runtime versions, and repository-specific validation policy.
2. `.github/workflows/*.yml` and `.github/workflows/*.yaml`
3. Documentation describing CI expectations
4. Existing reports or run history when the user wants measured impact

For new setups, start with a small workflow that proves core checks, then add matrix breadth or
additional jobs only when needed.

Start with common, low-risk waste:

1. Missing dependency caches
2. Missing `concurrency` cancellation
3. Over-broad workflow triggers
4. Duplicate workflow coverage across files or jobs
5. Expensive jobs that run on every change regardless of scope

## Actions-Specific Guidance

### Trigger scoping

- Use `paths` or `paths-ignore` only when the whole workflow truly need not run for those file
  classes.
- Use job-level gating when event-level filters are too coarse.
- Prefer explicit changed-file detection when reliability matters more than clever filter
  expressions.
- Check that path filters cannot skip required nUIget checks such as `npm test`, `npm run bench`,
  and `npm run test:ui`.

### Job shaping

- Do not merge jobs blindly. If separate jobs preserve parallelism and shorten the critical path,
  keep them separate.
- Keep lightweight coordination or change-detection jobs separate from heavy execution jobs when
  that makes skip behavior obvious.
- If a workflow-only change still runs the full suite, treat that as evidence the gating model may
  be too broad, not permission to remove required coverage.

### Matrix reduction

Match matrix breadth to the decision being made:

- Full matrix for releases or explicit compatibility validation
- Reduced compatibility matrix for runtime, plugin, packaging, or framework-integration changes
- A representative latest-version leg for ordinary changes only when repository policy permits it
- No heavy test job for clearly non-runtime changes only when lighter protection is documented and
  still preserves required checks

### Dependency installation

Follow repository CI policy rather than imposing a generic clean-install convention. nUIget CI
uses `npm install --no-audit --no-fund`, not `npm ci`, because transitive optional dependency
resolution can differ across npm patch versions and `npm ci` may fail on that drift. Preserve this
exception when suggesting caching or job changes.

### Optional maintenance jobs

Formatting or autofix jobs that write back to a branch are often better as opt-in jobs.

Good triggers:

- PR label such as `ci:format`
- Manual dispatch
- Explicit comment-command flow if the repository already supports it

If using a label trigger, listen for PR `labeled` and usually `unlabeled` events or the label
change will not reevaluate the job.

## Safe-Change Rules

- Do not hide required release, migration, shared-library, or nUIget test validation.
- Do not widen changed-file scope accidentally when replacing a wrapper action.
- Treat severity drift as a regression risk.
- Match the real check surface before replacing a broad action with native tools.
- Do not push test commits, commit, or mutate branch refs without explicit user authorization.
- Separate repository-editable YAML from organization/account settings.

## Validation

Prefer read-only inspection of existing GitHub runs and local workflow structure:

- Inspect existing `workflow_dispatch` runs rather than triggering new runs by default.
- Compare existing run durations when estimating savings.
- Review path filters and concurrency conditions against the declared workflow policy.
- Confirm heavy jobs are not gated out of required validation.

Do not use test pushes or branch mutations for validation unless the user explicitly authorizes
them. Do not initiate remote workflow runs that could incur cost or mutate remote state without
authorization.
