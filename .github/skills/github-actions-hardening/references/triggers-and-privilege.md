<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/references/triggers-and-privilege.md -->

# Triggers and Privilege

For each workflow, determine who can trigger it, which repository context is used, whether
attacker-controlled code or data is processed, and what permissions and secrets are actually
available. A trigger name alone does not establish the effective `GITHUB_TOKEN` scope.

## Trust Boundaries

| Trigger | Potential initiator | Context and review focus |
| --- | --- | --- |
| `push` | A user able to push to the ref | Inspect branch protections, workflow permissions, and secrets available to the run |
| `pull_request` from same-repository branch | Repository contributors | Review contributed code as untrusted unless independently trusted |
| `pull_request` from a fork | Any fork contributor | GitHub fork protections generally restrict token permissions and withhold secrets; verify policy and do not treat execution itself as a vulnerability |
| `pull_request_target` | A fork contributor can open/update a PR | Uses the base-repository workflow context; inspect explicit token permissions, repository defaults, secrets, checkout refs, and any execution of PR code |
| `workflow_run` | Completion of another workflow | Review the downstream workflow's permissions/secrets and treat downloaded artifacts as untrusted data |
| `issue_comment`, `issues` | Potentially outside users | Review who can initiate the event, the actual workflow token scopes/defaults, secrets, and any use of user-controlled text |

Token permissions vary with workflow- and job-level `permissions`, repository/organization
defaults, and event-specific GitHub policies. Secrets also depend on event context and repository
policy. Inspect the effective configuration when possible. If it is inaccessible, explicitly
qualify claims; do not state that every issue-related trigger receives a full write token or all
secrets.

## Why `pull_request_target` Needs Care

`pull_request_target` uses the base repository's workflow definition. A dangerous pattern is to
check out fork code and execute it in a job that also has secrets or elevated token permissions:

```yaml
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: npm install && npm test
```

Dependency installation can execute code from the checked-out repository. Assess the run's actual
available permissions and secrets before describing the impact.

## Safer Separation

Run untrusted builds under the fork-protected `pull_request` event. If a later trusted workflow
consumes its outputs, treat artifacts strictly as data: validate paths and never execute them.

```yaml
name: PR Build
on: pull_request
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - run: npm ci --no-audit --no-fund && npm test
      - uses: actions/upload-artifact@<sha>
        with: { name: pr, path: dist/ }
```

```yaml
name: PR Comment
on:
  workflow_run:
    workflows: ["PR Build"]
    types: [completed]
permissions:
  pull-requests: write
jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@<sha>
      # Consume validated results as data only; do not execute the artifact.
```

Adapt install commands to the repository's documented policy. nUIget uses
`npm ci --no-audit --no-fund`.

## Rules

- Treat `pull_request_target`, `workflow_run`, `issue_comment`, and `issues` as trust-boundary
  events that require inspection; do not label them uniformly privileged without checking scopes.
- Never check out and execute PR/fork code in a run with secrets or elevated token permissions.
- Metadata-only labeling, commenting, or triage can be appropriate when input is safely handled
  and permissions are minimized.
- Prefer `pull_request` for untrusted builds; verify actual repository policy and token
  restrictions.
- Do not change organization/repository settings or add security tooling without explicit
  authorization.
