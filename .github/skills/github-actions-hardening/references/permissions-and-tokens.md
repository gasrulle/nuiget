<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/references/permissions-and-tokens.md -->

# Permissions and Tokens

Every workflow run receives a `GITHUB_TOKEN`. Its effective scopes determine the impact if a step
is compromised.

## Determine Effective Permissions

Do not infer effective token scopes from the trigger name or from the absence of a local
`permissions:` block alone. Workflow and job `permissions`, repository/organization defaults, and
GitHub event policies all affect the token. Inspect the available configuration and settings. If
settings cannot be inspected, report the uncertainty and describe possible impact conditionally.

`issue_comment`, `issues`, and `workflow_run` events may run in a base-repository context and may
be able to access secrets, but they do not by themselves prove that a particular run has
write-all token access. Check the actual workflow and effective settings before making that claim.

## Least-Privilege Recipe

Set a restrictive workflow default, then grant only the scopes each job needs:

```yaml
permissions: {}

jobs:
  build:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps: [...]

  comment:
    permissions:
      contents: read
      pull-requests: write
    runs-on: ubuntu-latest
    steps: [...]
```

Common scopes include `contents`, `pull-requests`, `issues`, `actions`, `packages`, `id-token`,
`deployments`, `checks`, and `statuses`. Each can be `read`, `write`, or `none` where supported.

## Findings to Flag

- No explicit `permissions:` block: inspect repository/organization defaults. Report a possible
  broad-default risk if the effective default is unknown; do not state that it is definitely
  read/write.
- `permissions: write-all`: HIGH.
- An unused write scope: recommend removing it and explain what it exposes.
- Top-level write access that is needed by only one job: recommend moving it to that job.

## OIDC Instead of Long-Lived Cloud Secrets

Static cloud keys stored as repository secrets can remain useful to an attacker until rotated.
When cloud authentication is in scope, consider OIDC for short-lived credentials, scoped on both
GitHub and the cloud-provider side.

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@<sha>
        with:
          role-to-assume: arn:aws:iam::123456789012:role/my-ci-role
          aws-region: us-east-1
```

Do not change cloud trust policies or organization settings without explicit authorization.

## Secret Hygiene

- Reference secrets only in jobs that need them.
- Never echo a secret or enable shell tracing in a step that handles it.
- Do not pass secrets into untrusted code or unreviewed third-party actions.
- Fork `pull_request` protections generally withhold secrets; verify the repository's actual
  settings and event context rather than switching to a privileged trigger to work around that
  boundary.
