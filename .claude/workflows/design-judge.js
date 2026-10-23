export const meta = {
  name: 'design-judge',
  description: "Scores one UX item's named-state captures against the committed artboards, redlines and docs/design/judge-rubric.md: three lens judges and one refuter per state; a finding stands when two judges and the refuter agree.",
  whenToUse: 'The judge step of every UI item and of the README listing item (docs/plans/RUN-ux.md §4). Invoke by name with args { item, states, rubric, runId }.',
  phases: [
    { title: 'Judge', detail: 'per state: the native-parity, geometry and states-and-copy judges open the PNGs with Read and return boxed findings' },
    { title: 'Refute', detail: 'per state: one refuter re-crops every box, confirms or refutes each finding and groups findings that describe one defect' },
  ],
}

/*
 * design-judge: saved workflow of the nUIget UX plan (judge step of docs/plans/RUN-ux.md §4).
 * The rubric is docs/design/judge-rubric.md; no plan item edits it.
 *
 * args (JSON, passed as a value, not a string):
 *   item          string  plan item id; used in labels and crop file names only, judges never look it up
 *   states        array   [{ name, png, artboardPng, spec, sha256? }], one entry per named state the item touched
 *                   name         named state from src/test/ui/v2/states.ts, e.g. 'main-installed-single'
 *                   png          'captures/<run-id>/<state>.<theme>.<width>.png' (CI capture, webview crop, DPR 1)
 *                   artboardPng  'docs/design/artboards/<state>.<theme>.<width>.png' (null in listing mode)
 *                   spec         'docs/design/artboards/<state>.spec.json' (null in listing mode)
 *                   sha256       optional; the refuter computes it and the result flags a mismatch
 *   rubric        string  'docs/design/judge-rubric.md'
 *   runId         string  the CI run id the captures came from
 *   mode          string  optional: 'screen' (default) or 'listing' (the README page, rubric §8)
 *   measurements  string  optional: path to the measurement output of the same run; read by the refuter only
 *   model         string  optional: model for every agent; omitted, agents run on the session model
 *
 * Cost: 4 agents per state (3 judges + 1 refuter). Keep states.length × 4 under the desktop app's workflow-size
 * guideline; above it, run this workflow once per batch of states and merge the results. Split by state, never by
 * dropping the refuter.
 *
 * Agreement: the refuter gives each finding a verdict and gives the confirmed findings that describe one defect a
 * shared defect key. A defect stands when two or more judges (distinct lenses) report it and each of their boxes
 * overlaps another judge's box (IoU >= 0.3, or the centre of one box inside the other, with 4 px slack). A confirmed
 * defect seen by one judge is returned under singleJudge (informational). A state where a judge or the refuter did not
 * answer, a verdict is missing or the sha256 differs is listed under incomplete: the session re-runs that state, and an
 * incomplete state never counts as clean.
 *
 * Returns { item, runId, mode, standing, refuted, singleJudge, incomplete, perState, counts }. The session writes it
 * into docs/plans/judge-log/<item>.json (format: judge-rubric.md §9).
 *
 * Dependency: scripts/crop-png.mjs (written by P0): node scripts/crop-png.mjs <png> <x> <y> <w> <h> <out>, CSS px at
 * DPR 1, creating the directory of <out>. Without it the refuter reads the whole PNG and records the method full-png.
 */

const ITEM = args && args.item
const STATES = args && args.states
const RUBRIC = (args && args.rubric) || 'docs/design/judge-rubric.md'
const RUN = args && args.runId
const MODE = (args && args.mode) || 'screen'
const MEASUREMENTS = args && args.measurements
const MODEL = args && args.model

if (typeof ITEM !== 'string' || ITEM === '') throw new Error('design-judge: args.item (plan item id) is required')
if (typeof RUN !== 'string' && typeof RUN !== 'number') throw new Error('design-judge: args.runId (CI run id) is required')
if (!Array.isArray(STATES) || STATES.length === 0) throw new Error('design-judge: args.states must be a non-empty array')
if (MODE !== 'screen' && MODE !== 'listing') throw new Error("design-judge: args.mode must be 'screen' or 'listing'")
for (const s of STATES) {
  if (!s || typeof s.name !== 'string' || typeof s.png !== 'string') {
    throw new Error('design-judge: every state needs a name and a png path')
  }
  if (MODE === 'screen' && (typeof s.artboardPng !== 'string' || typeof s.spec !== 'string')) {
    throw new Error(`design-judge: state ${s.name} needs artboardPng and spec in screen mode`)
  }
}
const names = STATES.map(s => s.name)
if (new Set(names).size !== names.length) throw new Error('design-judge: state names must be unique')

const SEVERITIES = ['blocking', 'major', 'minor']
const RANK = { blocking: 0, major: 1, minor: 2 }

const LENSES = [
  {
    key: 'native',
    title: 'native-parity',
    screen:
      'native parity: would a VS Code user take this for a built-in view that manages NuGet packages? ' +
      'Primary questions (examine closely): Q1 headers, Q2 rows, Q3 controls, Q6 colour roles, Q7 focus and selection, ' +
      'Q10 icons, Q12 dividers and layers. Secondary questions (report what you see at 1:1): Q4 insets, Q5 rhythm as ' +
      '"looks squeezed or loose" against the artboard, Q8 states, Q9 copy, Q13 motion.',
    listing:
      'first screen and value: primary L1 (value proposition, hero and badges within the first screen); ' +
      'secondary L2 (scannable) and L4 (professional).',
  },
  {
    key: 'geometry',
    title: 'geometry',
    screen:
      'geometry: do edges, gaps, insets, heights and overflow match the redline and the rules? Compare positions with ' +
      "the spec's numbers and with the artboard. Primary questions: Q4 insets, Q5 rhythm, Q11 overflow. Secondary: " +
      'the heights and edges of Q1-Q3, Q12 dividers, completeness against the artboard.',
    listing:
      'structure and framing: primary L2 (scannable) and L3 (consistent framing of every image); secondary L5 ' +
      '(requirements placed where a reader finds them).',
  },
  {
    key: 'states',
    title: 'states-and-copy',
    screen:
      'states and copy: is every artboard element present and nothing extra, does the state show what its name ' +
      'promises, is every interaction state drawn, is the copy right? Primary questions: Q8 states, Q9 copy, Q13 ' +
      'motion, completeness. Secondary: Q6 colour roles, Q7 focus and selection, Q10 icons, Q11 overflow.',
    listing:
      'copy and professionalism: primary L4 (no developer content, casing, spelling, badges) and L5 (requirements); ' +
      'secondary L1 (the value proposition is clear) and L3 (captions).',
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          severity: { type: 'string', enum: SEVERITIES },
          box: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
          rule: { type: 'string' },
          state: { type: 'string' },
        },
        required: ['finding', 'severity', 'box', 'rule', 'state'],
      },
    },
  },
  required: ['findings'],
}

const REFUTE_SCHEMA = {
  type: 'object',
  properties: {
    sha256: { type: 'string' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted'] },
          defect: { type: 'string' },
          severity: { type: 'string', enum: SEVERITIES },
          reason: { type: 'string' },
          method: { type: 'string', enum: ['crop', 'full-png'] },
        },
        required: ['id', 'verdict', 'defect', 'severity', 'reason', 'method'],
      },
    },
  },
  required: ['sha256', 'verdicts'],
}

function options(extra) {
  return MODEL ? Object.assign({}, extra, { model: MODEL }) : extra
}

function slug(text) {
  return String(text).replace(/[^A-Za-z0-9._-]+/g, '-')
}

function validBox(box) {
  return (
    Array.isArray(box) &&
    box.length === 4 &&
    box.every(v => typeof v === 'number' && isFinite(v)) &&
    box[0] >= 0 &&
    box[1] >= 0 &&
    box[2] > 0 &&
    box[3] > 0
  )
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[0] + a[2], b[0] + b[2])
  const y2 = Math.min(a[1] + a[3], b[1] + b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a[2] * a[3] + b[2] * b[3] - inter
  return union > 0 ? inter / union : 0
}

function centreInside(a, b, slack) {
  const cx = a[0] + a[2] / 2
  const cy = a[1] + a[3] / 2
  return cx >= b[0] - slack && cx <= b[0] + b[2] + slack && cy >= b[1] - slack && cy <= b[1] + b[3] + slack
}

function overlaps(a, b) {
  return iou(a, b) >= 0.3 || centreInside(a, b, 4) || centreInside(b, a, 4)
}

function union(boxes) {
  const x1 = Math.min(...boxes.map(b => b[0]))
  const y1 = Math.min(...boxes.map(b => b[1]))
  const x2 = Math.max(...boxes.map(b => b[0] + b[2]))
  const y2 = Math.max(...boxes.map(b => b[1] + b[3]))
  return [x1, y1, x2 - x1, y2 - y1]
}

function judgePrompt(lens, s) {
  const listing = MODE === 'listing'
  const lines = [
    `You are the ${lens.title} judge of the nUIget design-judge panel. State: "${s.name}". CI run: ${RUN}.`,
    '',
    'Open these with the Read tool, in this order:',
    `1. The rubric ${RUBRIC}: §2 (boxes), §3 (severity), §4 (questions), §5 (lenses), §6 (what is not a finding)` +
      (listing ? ' and §8 (listing rubric).' : '.'),
    `2. The capture ${s.png}.`,
  ]
  if (s.artboardPng) lines.push(`3. The approved artboard ${s.artboardPng}: same viewport and origin as the capture.`)
  if (s.spec) lines.push(`4. The redline ${s.spec}, and docs/design/design-system.md for the text of every rule id you cite.`)
  lines.push(
    '',
    'Never open docs/plans/** (the plan, STATUS-ux.md, judge logs), any STATUS.md, commit messages or git history. You ' +
      'judge the pixels against the artboard, the redline and the rules, not what anyone says was done.',
    '',
    `Your lens is ${listing ? lens.listing : lens.screen}`,
    '',
    'Report every defect you can see through this lens. For each finding give:',
    '- finding: one sentence saying what is wrong, where, and compared with which artboard element, spec value or exemplar;',
    '- severity: blocking, major or minor, by the definitions of rubric §3;',
    '- box: [x, y, w, h], integers, CSS px of the capture, origin at the top-left corner of the PNG, tight as rubric §2 ' +
      'says (the union of both elements for a gap or alignment defect; halve every position if the PNG is DPR 2);',
    `- rule: a DS-* id from docs/design/design-system.md${listing ? ', an L-id from rubric §8,' : ''} or "judge-only" when no rule states it;`,
    `- state: "${s.name}".`,
    '',
    'Return an empty list when you see nothing. Do not pad the list, and do not report anything rubric §6 excludes.',
  )
  return lines.join('\n')
}

function refutePrompt(s, candidates) {
  const lines = [
    `You are the refuter of the nUIget design-judge panel for state "${s.name}" (CI run ${RUN}). Your job is to ` +
      'falsify each candidate finding below. Default to refuted when you cannot see the defect yourself.',
    '',
    `Read the rubric ${RUBRIC}, §2, §3, §6 and §7, then the capture ${s.png}` +
      (s.artboardPng ? `, the artboard ${s.artboardPng}` : '') +
      (s.spec ? ` and the redline ${s.spec}` : '') +
      '.',
  ]
  if (MEASUREMENTS) {
    lines.push(
      `Read the measurement output ${MEASUREMENTS}. A hard measurement that contradicts a finding (for example equal ` +
        'edges within 1 px where the judge saw misalignment) refutes it; quote the measured value in the reason.',
    )
  }
  lines.push(
    'Never open docs/plans/**, any STATUS.md, commit messages or git history.',
    '',
    `First run: shasum -a 256 ${s.png}` + (s.sha256 ? ` (the caller expects ${s.sha256}).` : '.'),
    'Then run: ls scripts/crop-png.mjs',
    'For each candidate, when the script exists, crop the box padded by 16 px on each side (clamp at 0) and open the ' +
      'crop with Read:',
    `  node scripts/crop-png.mjs ${s.png} <x-16> <y-16> <w+32> <h+32> captures/${slug(RUN)}/crops/${slug(ITEM)}-${slug(s.name)}-<id>.png`,
  )
  if (s.artboardPng) {
    lines.push(
      'When the finding compares with the artboard, crop the artboard at the same box as well:',
      `  node scripts/crop-png.mjs ${s.artboardPng} <x-16> <y-16> <w+32> <h+32> captures/${slug(RUN)}/crops/${slug(ITEM)}-${slug(s.name)}-<id>-artboard.png`,
    )
  }
  lines.push(
    'When the script does not exist, open the whole PNG with Read, locate the box by its coordinates and set method ' +
      '"full-png". The Read tool cannot crop.',
    '',
    'For every candidate decide:',
    '- verdict: confirmed only if the box lies inside the PNG, covers what the finding names, and the defect is visible ' +
      'in the crop; refuted if the box is wrong, the redline declares the difference, a measurement contradicts it, ' +
      'rubric §6 excludes it, or you cannot see it;',
    '- defect: for confirmed findings, a short key such as "D1"; give findings that describe the same defect the same ' +
      'key and different defects different keys (the hints list candidates whose boxes overlap); "" when refuted;',
    '- severity: by rubric §3, from what you see in the crop;',
    '- reason: one sentence naming what you saw in the crop and any measured value;',
    '- method: "crop" or "full-png".',
    'Return one verdict per candidate id, and the sha256 you computed.',
    '',
    'Candidates:',
  )
  for (const c of candidates) {
    const hint = c.overlapsWith.length ? `; boxes overlap ${c.overlapsWith.join(', ')}` : ''
    lines.push(
      `- ${c.id} [${c.lens}] ${c.severity} rule ${c.rule} box [${c.box.join(', ')}]${hint}: ${c.finding}`,
    )
  }
  return lines.join('\n')
}

async function judgeState(s) {
  const answers = await parallel(
    LENSES.map(lens => () =>
      agent(judgePrompt(lens, s), options({ label: `judge ${lens.key} ${s.name}`, phase: 'Judge', schema: FINDINGS_SCHEMA })),
    ),
  )
  return { s, answers }
}

async function refuteState(judged) {
  const s = judged.s
  const answered = {}
  const candidates = []
  const invalid = []
  LENSES.forEach((lens, i) => {
    const answer = judged.answers[i]
    answered[lens.key] = answer && Array.isArray(answer.findings) ? answer.findings.length : null
    if (!answer || !Array.isArray(answer.findings)) return
    answer.findings.forEach((f, n) => {
      const id = `${lens.key}-${n + 1}`
      const entry = {
        id,
        lens: lens.key,
        state: s.name,
        finding: f.finding,
        severity: f.severity,
        box: Array.isArray(f.box) ? f.box.map(v => Math.round(v)) : f.box,
        rule: f.rule,
      }
      if (validBox(entry.box)) candidates.push(entry)
      else invalid.push(Object.assign(entry, { verdict: 'refuted', reason: 'invalid box' }))
    })
  })
  for (const c of candidates) {
    c.overlapsWith = candidates.filter(o => o !== c && o.lens !== c.lens && overlaps(c.box, o.box)).map(o => o.id)
  }

  const judgesAnswered = Object.values(answered).filter(v => v !== null).length
  const result = {
    name: s.name,
    png: s.png,
    sha256: s.sha256 || null,
    judges: answered,
    candidates: candidates.length + invalid.length,
    standing: [],
    refuted: invalid.slice(),
    singleJudge: [],
    unverified: [],
    incomplete: [],
  }
  // A missing lens loses the primary coverage of its questions, so the state cannot count as judged.
  if (judgesAnswered < 3) result.incomplete.push(`${3 - judgesAnswered} of 3 judges did not answer`)

  if (candidates.length === 0) return result

  const refuter = await agent(
    refutePrompt(s, candidates),
    options({ label: `refute ${s.name}`, phase: 'Refute', schema: REFUTE_SCHEMA }),
  )
  if (!refuter || !Array.isArray(refuter.verdicts)) {
    result.unverified = candidates
    result.incomplete.push('the refuter did not answer')
    return result
  }
  result.sha256 = refuter.sha256 || result.sha256
  if (s.sha256 && refuter.sha256 && s.sha256.toLowerCase() !== refuter.sha256.toLowerCase()) {
    result.incomplete.push(`sha256 mismatch: expected ${s.sha256}, refuter computed ${refuter.sha256}`)
  }

  const byId = {}
  for (const v of refuter.verdicts) byId[v.id] = v
  const groups = {}
  for (const c of candidates) {
    const v = byId[c.id]
    if (!v) {
      result.unverified.push(c)
      continue
    }
    const judgedEntry = Object.assign({}, c, { verdict: v.verdict, reason: v.reason, method: v.method, refuterSeverity: v.severity })
    delete judgedEntry.overlapsWith
    if (v.verdict === 'refuted') {
      result.refuted.push(judgedEntry)
      continue
    }
    const key = v.defect && v.defect.trim() ? v.defect.trim() : `solo-${c.id}`
    ;(groups[key] = groups[key] || []).push(judgedEntry)
  }
  if (result.unverified.length) result.incomplete.push(`${result.unverified.length} candidate(s) without a verdict`)

  for (const key of Object.keys(groups)) {
    const members = groups[key]
    // A lens counts toward agreement only if its box overlaps a box of another lens in the same defect group.
    const agreeing = members.filter(m => members.some(o => o.lens !== m.lens && overlaps(m.box, o.box)))
    const lenses = Array.from(new Set(agreeing.map(m => m.lens)))
    const severity = members.map(m => m.refuterSeverity).sort((a, b) => RANK[a] - RANK[b])[0]
    const defect = {
      id: `${s.name}#${key}`,
      state: s.name,
      finding: members.map(m => `[${m.lens}] ${m.finding}`).join(' | '),
      severity,
      box: union((agreeing.length ? agreeing : members).map(m => m.box)),
      rule: Array.from(new Set(members.map(m => m.rule))).join(', '),
      lenses: lenses.length ? lenses : Array.from(new Set(members.map(m => m.lens))),
      members,
    }
    if (lenses.length >= 2) result.standing.push(defect)
    else result.singleJudge.push(defect)
  }
  return result
}

phase('Judge')
log(`design-judge: ${STATES.length} state(s) of ${ITEM}, run ${RUN}, mode ${MODE}: up to ${STATES.length * 4} agents`)

const perStateList = await pipeline(STATES, s => judgeState(s), judged => refuteState(judged))

const perState = {}
const standing = []
const refuted = []
const singleJudge = []
const incomplete = []
perStateList.forEach((r, i) => {
  const name = STATES[i].name
  if (!r) {
    perState[name] = { name, incomplete: ['the state failed in the workflow'] }
    incomplete.push({ state: name, reasons: ['the state failed in the workflow'] })
    return
  }
  standing.push(...r.standing)
  refuted.push(...r.refuted)
  singleJudge.push(...r.singleJudge)
  if (r.incomplete.length) incomplete.push({ state: name, reasons: r.incomplete })
  perState[name] = {
    png: r.png,
    sha256: r.sha256,
    judges: r.judges,
    candidates: r.candidates,
    standing: r.standing.length,
    blocking: r.standing.filter(d => d.severity === 'blocking').length,
    refuted: r.refuted.length,
    singleJudge: r.singleJudge.length,
    unverified: r.unverified.length,
    incomplete: r.incomplete,
  }
})

const counts = {
  states: STATES.length,
  candidates: Object.values(perState).reduce((n, p) => n + (p.candidates || 0), 0),
  standing: standing.length,
  blocking: standing.filter(d => d.severity === 'blocking').length,
  refuted: refuted.length,
  singleJudge: singleJudge.length,
  incomplete: incomplete.length,
}
log(
  `design-judge: ${counts.standing} standing (${counts.blocking} blocking), ${counts.refuted} refuted, ` +
    `${counts.singleJudge} single-judge, ${counts.candidates} candidates over ${counts.states} state(s)`,
)
if (incomplete.length) {
  log(`design-judge: INCOMPLETE, re-run these states: ${incomplete.map(x => `${x.state} (${x.reasons.join('; ')})`).join(', ')}`)
}

return { item: ITEM, runId: RUN, mode: MODE, standing, refuted, singleJudge, incomplete, perState, counts }
