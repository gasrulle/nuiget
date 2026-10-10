<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/references/supply-chain.md -->

# Supply Chain

A workflow runs other people's code each time it uses an action. The action's effective
permissions and the secrets available to its job determine the impact of compromise.

## Pin Third-Party Actions to a Commit SHA

Tags and branches are mutable. A full 40-character commit SHA pins the exact action revision:

```yaml
# Mutable reference
- uses: some-org/some-action@v3

# SHA-pinned reference
- uses: some-org/some-action@3f1e0a9c8b7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f # v3.2.1
```

Guidance:

- Recommend SHA pinning for third-party actions; report mutable references with impact grounded in
  the job's actual token permissions and secret exposure.
- Flag `@main` or `@master` as mutable, regardless of publisher.
- SHA-pinning first-party `actions/*` is also a hardening recommendation.
- Keep a trailing version comment so humans and Dependabot can identify the intended release.

## Let Dependabot Update Pins

SHA pins need maintenance. If repository policy permits, configure Dependabot for the
`github-actions` ecosystem:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Do not create or edit repository automation files unless requested.

## Artifact and Cache Poisoning

- An artifact uploaded by an untrusted `pull_request` build is untrusted data. A later workflow
  must not execute it; validate paths when extracting.
- Caches may be populated by less-privileged runs. Do not trust cached build outputs as
  untampered in an elevated-permission context.

## Self-Hosted Runners on Public Repositories

Self-hosted runners may persist state between jobs. Untrusted code can leave tools or backdoors,
read other checkouts or credentials, or access internal networks. Do not run public-fork code on a
persistent self-hosted runner. If required, use isolated single-use runners without secrets.

## `checkout` Credential Persistence

`actions/checkout` persists credentials by default so later Git operations can authenticate. Set
`persist-credentials: false` when a job does not need authenticated Git operations, especially
before running untrusted code.
