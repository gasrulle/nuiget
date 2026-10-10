<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/references/report-format.md -->

# Report Format

Use this structure for every workflow hardening review.

## 1. Summary Table

Always begin with a summary table:

```text
GitHub Actions Hardening — <workflow file(s) reviewed>

| Severity   | Count |
| ---------- | ----- |
| 🔴 CRITICAL | 1     |
| 🟠 HIGH     | 2     |
| 🟡 MEDIUM   | 1     |
| 🔵 LOW      | 1     |
| ⚪ INFO     | 0     |
```

If nothing was found, state: `No issues found. Checked: triggers, injection sinks, permissions,
action pinning, and secret handling.`

## 2. Findings

Group by issue type, not by file. For each finding include:

```text
### 🔴 CRITICAL — Script injection via PR title in an elevated-permission workflow

File: .github/workflows/triage.yml (line 14)
Trigger: pull_request_target

Offending code:
    - run: echo "New PR: ${{ github.event.pull_request.title }}"

Risk: An outside contributor controls the PR title, and this value is interpolated into shell
source. If the run has access to secrets or a write-scoped token, the injected command can use
those actual privileges. Verify effective token permissions and secret availability; do not infer
them from the trigger name alone.

Fix:
    - env:
        PR_TITLE: ${{ github.event.pull_request.title }}
      run: echo "New PR: $PR_TITLE"

Confidence: High
```

## 3. Remediation Blocks

Every CRITICAL and HIGH finding includes a concrete before/after. Preserve indentation, step
names, and surrounding structure; change only what fixes the issue. Explain non-obvious changes.

## 4. Closing Note

End with:

> Review each change before committing. Nothing has been modified.

## Style Rules

- Quote the exact offending line and give its location.
- Explain what an attacker could actually do, based on verified or explicitly qualified
  permissions and secrets.
- Include per-finding confidence: High, Medium, or Low.
- Do not inflate severity: untrusted code in a fork `pull_request` is not CRITICAL by itself when
  protections provide a read-only token and no secrets.
- State when repository or organization defaults were not available for inspection.
