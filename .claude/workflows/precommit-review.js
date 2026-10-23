export const meta = {
  name: 'precommit-review',
  description: "Reviews an item's change before its commit: correctness against the item row and the rules, test integrity, and documentation duties; every blocking finding gets its own refuter. Pass args.item, or the item is derived from the tracker's in-progress row or the range's commit subjects.",
  whenToUse: 'docs/plans/RUN-ux.md §4, after the gates are green and before git commit. Invoke by name with args { range, item? }.',
  phases: [
    { title: 'Review', detail: 'three read-only reviewers: correctness, test integrity, documentation duties' },
    { title: 'Refute', detail: 'one refuter per blocking finding checks it against the diff and the item row' },
  ],
}

/*
 * precommit-review: saved workflow of the nUIget UX plan (pre-commit review of docs/plans/RUN-ux.md §4).
 *
 * args (JSON, passed as a value, not a string):
 *   range  string  what `git diff` compares, passed verbatim: '--cached' (the staged change, the usual case before a
 *                  commit), 'HEAD' (staged and unstaged), or '<a>..<b>' (commits already made)
 *   item   string  optional plan item id; when absent the reviewers take the in-progress row of
 *                  docs/plans/STATUS-ux.md, or the item id cited in `git log --format=%s <range>` for a commit range
 *   model  string  optional model for every agent; omitted, agents run on the session model
 *
 * Reviewers and refuters are read-only: git diff, git log, git show, git status, ls, grep, wc, and the read-only
 * checks npm run docs:check and npm run check:matrix. They never edit, stage, commit or push.
 *
 * Cost: 3 reviewers + 1 refuter per distinct blocking finding.
 *
 * Returns { range, item, blocking, nonBlocking, refuted, incomplete, counts }. Blocking findings that the refuter
 * confirmed or could not decide stay blocking; the session fixes them before the commit or stops and asks. A reviewer
 * that did not answer makes the review incomplete: re-run it, never commit on an incomplete review.
 */

const RANGE = args && args.range
const ITEM = args && args.item
const MODEL = args && args.model

if (typeof RANGE !== 'string' || RANGE.trim() === '') {
  throw new Error("precommit-review: args.range is required ('--cached', 'HEAD' or '<a>..<b>')")
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    item: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocking', 'non-blocking'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          rule: { type: 'string' },
          finding: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'line', 'rule', 'finding', 'fix'],
      },
    },
  },
  required: ['item', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    reason: { type: 'string' },
    evidence: { type: 'string' },
  },
  required: ['verdict', 'reason', 'evidence'],
}

function options(extra) {
  return MODEL ? Object.assign({}, extra, { model: MODEL }) : extra
}

const ITEM_LINE = ITEM
  ? `The item is ${ITEM}.`
  : 'Identify the item first: the row marked in-progress in docs/plans/STATUS-ux.md; for a commit range, the item id ' +
    `cited in \`git log --format=%s ${RANGE}\`. If the two disagree or neither names one, report that as one blocking ` +
    'finding with file "docs/plans/STATUS-ux.md" and stop there.'

const COMMON = [
  `You review a change of the nUIget UX plan before it is committed. The change is \`git diff ${RANGE}\`; also use ` +
    `\`git diff --name-status ${RANGE}\` and \`git diff --stat ${RANGE}\`.`,
  ITEM_LINE,
  'Read docs/plans/RUN-ux.md to find the plan file, then the plan: §2.1 ("the item\'s files"), the universal and design ' +
    "stop-and-ask triggers, and the item's row (inputs, outputs, gate, the tests and files it names).",
  'You are read-only: use git diff, git log, git show, git status, ls, grep, wc, and if useful the read-only checks ' +
    '`npm run docs:check` and `npm run check:matrix`. Never edit, stage, commit or push.',
  'Report findings in your dimension only. blocking = the commit would be wrong, red, or against a rule the plan or ' +
    'CLAUDE.md makes mandatory; non-blocking = worth fixing but safe to commit. Give file (repository-relative), line ' +
    '(0 when the finding concerns the whole file or no file), rule (the plan section, CLAUDE.md duty, ADR, DS-* rule ' +
    'id or gotcha row it rests on), finding (one sentence with the evidence) and fix (one sentence). Return the item id ' +
    'you reviewed against. Return an empty list when the dimension is clean; do not pad.',
].join('\n')

const REVIEWERS = [
  {
    key: 'correctness',
    prompt: [
      'Dimension: correctness of the diff against the item row and the rules.',
      "- Does the diff produce the row's outputs, and only those? Every changed file must be one of the item's files " +
        '(plan §2.1); anything else is blocking (a stop-and-ask the session skipped).',
      '- Frozen contract paths (src/protocol/**, src/core/contracts.ts, docs/adr/**) change only when the row names them; ' +
        'owner-only paths (.claude/settings.json, .claude/settings.local.json, .claude/launch.json, .mcp.json) never ' +
        'change in a session; .claude/.contract-change and .claude/.test-retire are never staged.',
      '- No layering (ADR-010) in src/webview/**: no !important, no inline style other than cssVars() with --nuiget-* ' +
        'properties, no literal length or colour outside tokens.css, no feature stylesheet overriding a primitive class ' +
        "beyond its placement, no selector above the specificity ceiling, no v2 or legacy copy of a primitive.",
      '- The DS-* rules the row names (docs/design/design-system.md) are what the CSS and components now implement; a ' +
        'token change in src/webview/shared/tokens.css comes with docs/design/tokens.json.',
      '- The rows of the gotcha table in .github/copilot-instructions.md that cover the touched paths hold (import ' +
        'boundaries, the Node 18.15 extension host, the Chromium 114 CSS baseline, an ops/install always naming its ' +
        'version, and the rest).',
      '- Logic errors, missed callers of a changed export, and type holes the gates would not catch.',
    ].join('\n'),
  },
  {
    key: 'tests',
    prompt: [
      'Dimension: test integrity.',
      "- Deleted or renamed test files (`git diff --name-status` D or R on *.test.ts(x), *.bench.ts, src/test/**) are " +
        'blocking unless the item row names them; a retired test must also be named in the row.',
      '- Weakened tests are blocking unless the row names them by title: removed or loosened assertions (an exact ' +
        'expectation replaced by toBeTruthy, a count by a range), added .only, .skip or .todo, a skipIf with a predicate ' +
        'that is not a platform or environment check, a lengthened timeout used to hide a race, an axe rule disabled.',
      '- In src/test/ui/v2/measure.ts: a widened tolerance is blocking; a rule flipped from pending to hard or back is ' +
        "blocking unless the row owns that rule; the pending list in docs/plans/STATUS-ux.md matches the helper.",
      '- A changed golden under src/test/ui/v2/golden/ needs a reason in the directory STATUS.md and a pasted design-' +
        'advisor GOLDEN approval; a golden from a local run (not the harness crop width, DPR 2) is blocking.',
      '- The lint baseline src/test/lint/__fixtures__/css-audit-baseline.json only shrinks; any added entry needs a pasted ' +
        "design-advisor ruling; an entry left for a file this item rebuilds is blocking.",
      '- Accessibility snapshots changed without a reason; regression-matrix rows (docs/plans/regression-matrix.md) ' +
        'removed or renumbered.',
      '- New functions, handlers, components, hooks or helpers without tests (CLAUDE.md: tests are mandatory).',
    ].join('\n'),
  },
  {
    key: 'docs',
    prompt: [
      'Dimension: documentation duties (CLAUDE.md and the plan).',
      '- CHANGELOG.md: the entry is under ## [Unreleased]; Added entries are "**Headline** — description", Fixed and ' +
        'Changed entries a bold headline only; it describes what a user can now do or what stopped going wrong, in the ' +
        "user's vocabulary, with no item, finding or file ids; no released section changed (the ## [2.0.0] section only " +
        "in the plan's documentation item).",
      '- ARCHITECTURE.md (2.0 section) when a message type, state pattern, service, data flow or capability changed.',
      '- .github/copilot-instructions.md gotcha table for a new footgun; the matching .claude/ mirror when a .github/ ' +
        'agent, instruction, skill or prompt changed.',
      '- docs/ux/interaction-model.md §8 when a data-testid hook was added, removed or is now read by a test outside its ' +
        'component; docs/plans/regression-matrix.md R rows for a new named state or measurement helper.',
      '- README.md when a user-facing setting, command or behaviour changed.',
      "- The directory STATUS.md rewritten from the plan's §2.5 template (commit SHA, pasted gate output, advisor " +
        'decisions verbatim); the tracker row in docs/plans/STATUS-ux.md; a docs/design/DECISIONS.md row for every ' +
        'design-advisor ruling made under the closest-to-the-workbench rule; docs/plans/judge-log/<item>.json when the ' +
        'item ran the design-judge, with a disposition per standing finding.',
      '- npm run docs:check and npm run check:matrix would pass on the change.',
    ].join('\n'),
  },
]

function refutePrompt(f) {
  return [
    'You check one blocking finding of a pre-commit review of the nUIget UX plan. Try to refute it.',
    `The change is \`git diff ${RANGE}\`. ${ITEM_LINE}`,
    "Read docs/plans/RUN-ux.md for the plan file, then the item's row. Read-only: git diff, git log, git show, git " +
      'status, ls, grep, wc.',
    '',
    `Finding (from the ${f.reviewers.join(' and ')} reviewer${f.reviewers.length > 1 ? 's' : ''}):`,
    `  file: ${f.file}${f.line ? `:${f.line}` : ''}`,
    `  rule: ${f.rule}`,
    `  finding: ${f.finding}`,
    `  proposed fix: ${f.fix}`,
    '',
    'Check: does the diff really show this; does the item row allow it (named tests, named frozen files, its outputs); ' +
      'does the cited rule really say this; would it make the commit wrong, red or against a mandatory rule?',
    'Answer confirmed when the evidence holds, refuted when it does not (quote what contradicts it), uncertain when you ' +
      'checked and still cannot decide. Uncertain findings stay blocking. Give the evidence as path:line or the command ' +
      'output you relied on.',
  ].join('\n')
}

phase('Review')
log(`precommit-review: git diff ${RANGE}${ITEM ? ` for ${ITEM}` : ''}`)

const reviews = await parallel(
  REVIEWERS.map(r => () =>
    agent(`${COMMON}\n\n${r.prompt}`, options({ label: `review ${r.key}`, phase: 'Review', schema: FINDINGS_SCHEMA })),
  ),
)

const incomplete = []
const items = new Set()
const all = []
reviews.forEach((review, i) => {
  const key = REVIEWERS[i].key
  if (!review || !Array.isArray(review.findings)) {
    incomplete.push(`the ${key} reviewer did not answer`)
    return
  }
  if (review.item) items.add(review.item)
  for (const f of review.findings) all.push(Object.assign({}, f, { reviewers: [key] }))
})
if (items.size > 1) incomplete.push(`the reviewers reviewed against different items: ${Array.from(items).join(', ')}`)

// Barrier on purpose: a finding two reviewers raised is checked once.
const blockingByKey = new Map()
const nonBlocking = []
for (const f of all) {
  if (f.severity !== 'blocking') {
    nonBlocking.push(f)
    continue
  }
  const key = f.line > 0 ? `${f.file}:${f.line}` : `${f.file}:0:${blockingByKey.size}:${f.reviewers[0]}`
  const seen = blockingByKey.get(key)
  if (seen) {
    seen.reviewers.push(...f.reviewers)
    seen.finding = `${seen.finding} | ${f.finding}`
    seen.rule = seen.rule === f.rule ? seen.rule : `${seen.rule}; ${f.rule}`
  } else {
    blockingByKey.set(key, f)
  }
}
const candidates = Array.from(blockingByKey.values())

phase('Refute')
const verdicts = await parallel(
  candidates.map((f, i) => () =>
    agent(refutePrompt(f), options({ label: `refute ${i + 1}: ${f.file}`, phase: 'Refute', schema: VERDICT_SCHEMA })),
  ),
)

const blocking = []
const refuted = []
candidates.forEach((f, i) => {
  const v = verdicts[i]
  if (!v) {
    blocking.push(Object.assign({}, f, { verdict: 'unverified', reason: 'the refuter did not answer' }))
    log(`precommit-review: no refuter verdict for ${f.file}; it stays blocking`)
    return
  }
  const entry = Object.assign({}, f, { verdict: v.verdict, reason: v.reason, evidence: v.evidence })
  if (v.verdict === 'refuted') refuted.push(entry)
  else blocking.push(entry)
})

const counts = {
  blocking: blocking.length,
  nonBlocking: nonBlocking.length,
  refuted: refuted.length,
  reviewersAnswered: REVIEWERS.length - incomplete.filter(x => x.endsWith('did not answer')).length,
}
log(`precommit-review: ${counts.blocking} blocking, ${counts.nonBlocking} non-blocking, ${counts.refuted} refuted`)
if (incomplete.length) log(`precommit-review: INCOMPLETE (${incomplete.join('; ')}): re-run before committing`)

return {
  range: RANGE,
  item: ITEM || (items.size === 1 ? Array.from(items)[0] : null),
  blocking,
  nonBlocking,
  refuted,
  incomplete,
  counts,
}
