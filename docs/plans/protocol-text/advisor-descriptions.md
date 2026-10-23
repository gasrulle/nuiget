<!--
Target: the `description:` line of the frontmatter of both files below. Both carry the same text, so the Copilot agent
and the Claude Code subagent describe the same reviewer. Applied by the UX plan's P0 protocol item.
-->

## `.claude/agents/architecture-advisor.md`

```yaml
description: 'Read-only reviewer for the nUIget plans (the 2.0 re-architecture and the UX overhaul): answers stop-and-ask briefs on contracts, ADRs, the guard hook and tests, and reviews finished phases against the ADRs and contracts. Design questions go to design-advisor.'
```

## `.github/agents/architecture-advisor.agent.md`

```yaml
description: 'Read-only reviewer for the nUIget plans (the 2.0 re-architecture and the UX overhaul): answers stop-and-ask briefs on contracts, ADRs, the guard hook and tests, and reviews finished phases against the ADRs and contracts. Design questions go to design-advisor.'
```

## Not covered by the description

The body of `.github/agents/architecture-advisor.agent.md` still speaks of "the nUIget 2.0 execution plan", fixes
"plan decisions D1 to D13" as inputs and lists `docs/plans/STATUS.md` among the files to read (line 38 at
`e4d6e97`). The grep gate of the P0 protocol item covers `.claude/agents` only, so it does not catch these lines; the
same item updates them to name both plans, the UX plan's decision table and `docs/plans/STATUS-ux.md`.
