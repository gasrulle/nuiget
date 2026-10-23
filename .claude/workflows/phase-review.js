export const meta = {
  name: 'phase-review',
  description: 'Reviews a finished phase of the nUIget UX plan: the architecture-advisor review (commits against item rows, frozen paths, tests) and the design-advisor review (rules flipped, goldens, judge dispositions, V rules) run in parallel, then one refuter checks every blocking defect.',
  whenToUse: 'docs/plans/RUN-ux.md phase boundaries, after the phase gate ran. Invoke by name with args { phase, range, gateOutput }.',
  phases: [
    { title: 'Review', detail: 'architecture-advisor and design-advisor PHASE REVIEW in parallel' },
    { title: 'Refute', detail: 'one refuter checks every blocking defect against the diff and the tree' },
  ],
}

/*
 * phase-review: saved workflow of the nUIget UX plan (phase boundary of docs/plans/RUN-ux.md).
 *
 * args (JSON, passed as a value, not a string):
 *   phase       string  phase id, e.g. 'P0'
 *   range       string  the phase's commits: '<previous phase tag>..HEAD', or 'origin/main..HEAD' for P0
 *   gateOutput  string  the pasted output of the phase gate line
 *   model       string  optional model for the refuter; the two advisors run on the model of their agent definitions
 *
 * The two reviews run as the repository's subagents (agentType 'architecture-advisor' and 'design-advisor', defined in
 * .claude/agents/ and .github/agents/), each asked for its PHASE REVIEW answer shape plus a structured copy. Both are
 * read-only.
 *
 * Cost: 2 advisors + 1 refuter.
 *
 * Verdict: INCOMPLETE when an advisor or the refuter did not answer (re-run; never treat it as a pass); otherwise PASS
 * when no blocking defect survives the refuter, FAIL when one survives and an advisor answered FAIL, else PASS WITH
 * FIXES. Defects the refuter could not decide stay blocking.
 *
 * Returns { phase, range, verdict, blocking, nonBlocking, refuted, advisors, judgeDispositionRate, incomplete, counts }.
 * The session pastes advisors.architecture.answer and advisors.design.answer verbatim under ## Phase gates in
 * docs/plans/STATUS-ux.md and turns every entry of blocking into a <phase>.fix-n tracker item.
 */

const PHASE = args && args.phase
const RANGE = args && args.range
const GATE = args && args.gateOutput
const MODEL = args && args.model

if (typeof PHASE !== 'string' || PHASE === '') throw new Error('phase-review: args.phase is required')
if (typeof RANGE !== 'string' || RANGE === '') throw new Error('phase-review: args.range is required')
if (typeof GATE !== 'string' || GATE.trim() === '') throw new Error('phase-review: args.gateOutput (pasted gate output) is required')

const DEFECT = {
  type: 'object',
  properties: {
    defect: { type: 'string' },
    where: { type: 'string' },
    rule: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['defect', 'where', 'rule', 'fix'],
}

const OBSERVATION = {
  type: 'object',
  properties: {
    observation: { type: 'string' },
    where: { type: 'string' },
    item: { type: 'string' },
  },
  required: ['observation', 'where', 'item'],
}

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'PASS WITH FIXES', 'FAIL'] },
    blocking: { type: 'array', items: DEFECT },
    nonBlocking: { type: 'array', items: OBSERVATION },
    checked: { type: 'array', items: { type: 'string' } },
    answer: { type: 'string' },
  },
  required: ['verdict', 'blocking', 'nonBlocking', 'checked', 'answer'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'PASS WITH FIXES', 'FAIL'] },
    blocking: { type: 'array', items: DEFECT },
    nonBlocking: { type: 'array', items: OBSERVATION },
    checked: { type: 'array', items: { type: 'string' } },
    judgeDispositionRate: {
      type: 'object',
      properties: {
        refuted: { type: 'integer' },
        total: { type: 'integer' },
        cumulativeRefuted: { type: 'integer' },
        cumulativeTotal: { type: 'integer' },
        acceptedAsDesign: { type: 'integer' },
        fixed: { type: 'integer' },
        negativeControl: { type: 'string', enum: ['passed', 'not passed', 'not run'] },
        hardnessRule: { type: 'string', enum: ['met', 'not met'] },
      },
      required: ['refuted', 'total', 'cumulativeRefuted', 'cumulativeTotal', 'acceptedAsDesign', 'fixed', 'negativeControl', 'hardnessRule'],
    },
    answer: { type: 'string' },
  },
  required: ['verdict', 'blocking', 'nonBlocking', 'checked', 'judgeDispositionRate', 'answer'],
}

const REFUTE_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
          reason: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['id', 'verdict', 'reason', 'evidence'],
      },
    },
  },
  required: ['verdicts'],
}

const CONTEXT = [
  `PHASE REVIEW ${PHASE}`,
  '',
  'This is the nUIget UX plan. Read docs/plans/RUN-ux.md for the plan file name; the tracker is docs/plans/STATUS-ux.md. ' +
    'Where your instructions name the 2.0 plan, docs/plans/RUN.md or docs/plans/STATUS.md, read the UX files instead.',
  `COMMITS: run \`git log --oneline ${RANGE}\` and review the diff of those commits (\`git show <sha>\`, ` +
    `\`git diff ${RANGE} --stat\`), not their messages.`,
  'PHASE GATE OUTPUT (pasted by the session):',
  '```text',
  GATE,
  '```',
].join('\n')

const ARCH_PROMPT = [
  CONTEXT,
  '',
  'Review as your PHASE REVIEW section says: each closed item of the phase against its plan row (outputs present, gate ' +
    'result plausible, named tests present by title); frozen paths (src/protocol/**, src/core/contracts.ts, docs/adr/**) ' +
    'changed only in items that name them, behind the sentinel; owner-only paths (.claude/settings.json, ' +
    '.claude/settings.local.json, .claude/launch.json, .mcp.json) changed only by the owner\'s patch; no test deleted, ' +
    'skipped or weakened unless its item names it, and .claude/.test-retire never committed; the import boundaries ' +
    'and the Node 18.15 host rule; the docs duties of every item (CHANGELOG, ARCHITECTURE.md, gotchas, .claude/ mirrors).',
  'Return your answer in the PHASE REVIEW text shape of your instructions as `answer`, verbatim, and the same content as ' +
    'structured fields: verdict, blocking (defect, where = path:line, rule = plan section or ADR, fix), nonBlocking ' +
    '(observation, where, item that should pick it up), checked.',
].join('\n')

const DESIGN_PROMPT = [
  CONTEXT,
  '',
  'Review as your PHASE REVIEW section says: pending rules flipped to hard only by the items that own them and green in ' +
    'the gate output; every changed golden with a reason and a GOLDEN approval, none from a local run; every finding in ' +
    "docs/plans/judge-log/*.json of the phase's items with a disposition and a ruling; the rules that map V1-V5 and the " +
    "V6+ findings in the phase's scope hard and green where the phase owns them; the lint baseline only shrank; " +
    'tokens.css, docs/design/tokens.json and docs/design/design-system.md agree; axe 0, keyboard paths and reduced-motion ' +
    'captures present. Open the PNGs you rely on with Read.',
  'Compute the judge disposition rate as your instructions say (refuted-by-measurement over all dispositions, for the ' +
    "phase's items and cumulatively) and say whether the negative control passed and the hardness rule is met.",
  'Return your answer in the PHASE REVIEW text shape of your instructions as `answer`, verbatim (including the JUDGE ' +
    'DISPOSITION RATE line), and the same content as structured fields: verdict, blocking (defect, where = path:line or ' +
    'PNG and box, rule = DS-* id or plan section, fix), nonBlocking (observation, where, item), checked, ' +
    'judgeDispositionRate.',
].join('\n')

phase('Review')
log(`phase-review: ${PHASE}, ${RANGE}`)

const [arch, design] = await parallel([
  () => agent(ARCH_PROMPT, { label: `architecture-advisor ${PHASE}`, phase: 'Review', agentType: 'architecture-advisor', schema: ARCH_SCHEMA }),
  () => agent(DESIGN_PROMPT, { label: `design-advisor ${PHASE}`, phase: 'Review', agentType: 'design-advisor', schema: DESIGN_SCHEMA }),
])

const incomplete = []
if (!arch) incomplete.push('the architecture-advisor did not answer')
if (!design) incomplete.push('the design-advisor did not answer')

const candidates = []
for (const [source, review] of [['architecture', arch], ['design', design]]) {
  if (!review) continue
  review.blocking.forEach((d, i) => candidates.push(Object.assign({ id: `${source}-${i + 1}`, source }, d)))
}
const nonBlocking = []
for (const [source, review] of [['architecture', arch], ['design', design]]) {
  if (!review) continue
  for (const o of review.nonBlocking) nonBlocking.push(Object.assign({ source }, o))
}

const blocking = []
const refuted = []
if (candidates.length > 0) {
  phase('Refute')
  const listing = candidates
    .map(c => `- ${c.id} (${c.source}-advisor): ${c.defect}\n  where: ${c.where}\n  rule: ${c.rule}\n  fix: ${c.fix}`)
    .join('\n')
  const refuterOptions = { label: `refute ${candidates.length} blocking defect(s)`, phase: 'Refute', schema: REFUTE_SCHEMA }
  if (MODEL) refuterOptions.model = MODEL
  const refuter = await agent(
    [
      `You check the blocking defects that the phase review of ${PHASE} of the nUIget UX plan raised. Try to refute each.`,
      `The phase's commits are \`git log --oneline ${RANGE}\`. Read docs/plans/RUN-ux.md for the plan file, then the rows of ` +
        'the items involved. Read-only: git log, git show, git diff, git status, ls, grep, wc, shasum -a 256; open any ' +
        'PNG a defect cites with Read.',
      'For each defect: does the cited path, line, PNG box or log say this; does a plan row, decision or ADR allow it; ' +
        'would the next phase really build on something wrong? Answer confirmed when the evidence holds, refuted when it ' +
        'does not (quote what contradicts it), uncertain when you checked and still cannot decide. Uncertain defects ' +
        'stay blocking. Give one verdict per id with the evidence (path:line, PNG and box, or command output).',
      '',
      'Defects:',
      listing,
    ].join('\n'),
    refuterOptions,
  )
  const byId = {}
  if (refuter && Array.isArray(refuter.verdicts)) for (const v of refuter.verdicts) byId[v.id] = v
  else incomplete.push('the refuter did not answer')
  for (const c of candidates) {
    const v = byId[c.id]
    if (!v) {
      blocking.push(Object.assign({}, c, { verdict: 'unverified', reason: 'no verdict from the refuter' }))
      continue
    }
    const entry = Object.assign({}, c, { verdict: v.verdict, reason: v.reason, evidence: v.evidence })
    if (v.verdict === 'refuted') refuted.push(entry)
    else blocking.push(entry)
  }
}

let verdict
if (incomplete.length) verdict = 'INCOMPLETE'
else if (blocking.length === 0) verdict = 'PASS'
else if ([arch, design].some(r => r && r.verdict === 'FAIL')) verdict = 'FAIL'
else verdict = 'PASS WITH FIXES'

const advisors = {
  architecture: arch ? { verdict: arch.verdict, answer: arch.answer, checked: arch.checked } : null,
  design: design ? { verdict: design.verdict, answer: design.answer, checked: design.checked } : null,
}
const judgeDispositionRate = design ? design.judgeDispositionRate : null
const counts = { blocking: blocking.length, nonBlocking: nonBlocking.length, refuted: refuted.length }

log(`phase-review ${PHASE}: ${verdict}; ${counts.blocking} blocking, ${counts.refuted} refuted, ${counts.nonBlocking} non-blocking`)
if (judgeDispositionRate) {
  const r = judgeDispositionRate
  log(`phase-review ${PHASE}: judge disposition rate ${r.refuted}/${r.total} (cumulative ${r.cumulativeRefuted}/${r.cumulativeTotal}), hardness rule ${r.hardnessRule}`)
}
if (incomplete.length) log(`phase-review ${PHASE}: INCOMPLETE (${incomplete.join('; ')}): re-run`)

return { phase: PHASE, range: RANGE, verdict, blocking, nonBlocking, refuted, advisors, judgeDispositionRate, incomplete, counts }
