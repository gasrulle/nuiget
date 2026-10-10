<!-- Source: https://github.com/github/awesome-copilot/blob/82701c24b99488536ca399ff4789a458b7a05db7/skills/github-actions-hardening/references/injection.md -->

# Script Injection

`${{ <expr> }}` is substituted into a script as text before the shell runs. An expression that
resolves to outside-contributor-controlled data can therefore become a command-injection sink.

## Attacker-Controllable Contexts

These values may be set by someone who can open an issue, PR, or comment:

| Context | Set by |
| --- | --- |
| `github.event.issue.title` / `.body` | Issue author |
| `github.event.pull_request.title` / `.body` | PR author |
| `github.event.pull_request.head.ref` / `.head.label` | PR author (branch name) |
| `github.head_ref` | PR author (branch name) |
| `github.event.comment.body` | Commenter |
| `github.event.review.body` / `.review_comment.body` | Reviewer |
| `github.event.commits.*.message` / `head_commit.message` | Commit author |
| `github.event.commits.*.author.email` / `.name` | Commit author |
| `github.event.pages.*.page_name` | Wiki editor |

A branch named `$(attacker-command)` or an issue title containing shell metacharacters becomes
shell syntax if interpolated into a `run:` step.

## Vulnerable Pattern

```yaml
- run: |
    echo "Reviewing PR: ${{ github.event.pull_request.title }}"
    git checkout ${{ github.head_ref }}
```

## Safer Pattern: Pass Through `env:`

Bind the untrusted value to an environment variable, then reference the quoted shell variable:

```yaml
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
    HEAD_REF: ${{ github.head_ref }}
  run: |
    echo "Reviewing PR: $PR_TITLE"
    git checkout "$HEAD_REF"
```

The expression is assigned as a value rather than pasted into the command. Always quote the shell
variable to prevent word-splitting and globbing.

## `actions/github-script`

Do not interpolate expressions into the script body. Pass the value through the environment:

```yaml
- uses: actions/github-script@<sha>
  env:
    TITLE: ${{ github.event.issue.title }}
  with:
    script: console.log(process.env.TITLE)
```

## Custom Action Inputs

Passing untrusted expressions to a custom action's `with:` inputs may be safe or unsafe depending
on how that action consumes them. Inspect the action implementation. When uncertain, use a
validated environment value or pass it through `env:` if the action supports it.

## Quick Audit Checklist

1. Search every `run:` and `script:` for `${{`.
2. Resolve what each expression points to.
3. If outside contributors can set it, pass it as data and use a quoted shell variable.
4. Validate branch names or other values when the downstream command has additional constraints.

Server-controlled values such as `github.repository`, `github.sha`, and `github.ref` are not
attacker-set in the same way, but still verify context and quoting.
