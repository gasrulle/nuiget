# STATUS — src/core/queries   commit 32642aa (parent of the P1.8 commit)   2026-10-12T14:15:31Z

git status --short src/core/queries src/core/contracts.ts: `?? src/core/queries/QueryCoordinator.ts`,
`?? src/core/queries/QueryCoordinator.test.ts`, `?? src/core/queries/index.ts`, `?? ` this note,
` M src/core/contracts.ts` (all belong to the P1.8 commit, together with ` M CHANGELOG.md`, ` M ARCHITECTURE.md`,
` M docs/plans/STATUS.md` and ` M docs/plans/findings-ledger.md`)

Item: **P1.8 `QueryCoordinator.ts` and its test**. First note for this directory; `scopes.ts` and its test
arrived with P1.7 and are described in `src/core/session/STATUS.md`.

The quarry's note for the area (`src/core/queries/STATUS.md`, "state core") says the coordinator is fully
written, has uncommitted edits, was not type-checked or linted after them, and has no test. All four claims
hold against its working tree: `QueryCoordinator.ts` is modified against `f837f34` (70 insertions, 68
deletions), `index.ts` is untracked, and no test file exists. The working tree is what was copied (D3; the
item's "apply uncommitted refactor" means the same).

## Verified by running

```text
The gates ran with DOTNET_ROOT set to the SDK directory and NUIGET_SDK_TESTS=1 (N48).
baseline npm run check-types → exit 0
baseline npx eslint src      → exit 0, no output
baseline npx vitest run      → Test Files 60 passed (60) · Tests 1986 passed (1986)
copy from the quarry tree    → cmp: QueryCoordinator.ts and index.ts identical to the quarry working tree
unmodified copy, after the contract edit → npm run check-types exit 2: QueryCoordinator.ts(392,13) error
                               TS2322, Type 'ResourceKey[]' is not assignable to type
                               '{ key: ResourceKey; generation: number; }[]' · npx eslint src/core/queries exit 0
npm run check-types          → exit 0                                                             (item gate)
npx eslint src               → exit 0, no output                                                  (item gate)
npm run lint                 → exit 0
npx vitest run --project backend src/core/queries → Test Files 2 passed (2) · Tests 49 passed (49):
                               17 in QueryCoordinator.test.ts, 32 in scopes.test.ts                (item gate)
negative control             → the same QueryCoordinator.test.ts against the quarry's unfixed file:
                               3 failed | 14 passed: "invalidate coalesces into one event",
                               "carry-over: a joining subscriber replaces the carried keep-alives",
                               "carry-over: a recompute kept alive only by carried handles is not carried
                               again"; the fixed file was restored (cmp) and all 49 pass again
npm test                     → Test Files 61 passed (61) · Tests 2003 passed (2003)
npx vitest run --coverage    → exit 0 · All files 75.36 % statements, 64.9 % branches, 70.46 % functions,
                               76.93 % lines · QueryCoordinator.ts 98.33 % lines, 92.13 % branches ·
                               src/core/** 1270 of 1288 lines, 98.60 % (floor 85 %)
npm run docs:protocol:check  → exit 0; docs/protocol.md unchanged (the protocol was not touched)
npm run bench                → Test Files 16 passed (16) · Tests 101 passed | 1 skipped (102)
npm run package:vsix         → exit 0 · Tests 2002 passed | 1 skipped (that script ran without
                               NUIGET_SDK_TESTS) · DONE  Packaged: nuiget-v1.18.9.vsix (17 files, 528.62 KB)
npm run check:vsix           → check:vsix: OK
git diff --stat 32642aa -- src/core/contracts.ts src/protocol docs/adr docs/protocol.md → only
                               src/core/contracts.ts, 3 insertions, 2 deletions (one hunk)
grep -c carried src/core/queries/QueryCoordinator.ts → 13 · "keys: Map<ResourceKey, number>" → 1 hit
grep child_process in code files outside src/core/cli → none · Thenable in src/core → none
ls .claude/.contract-change  → No such file or directory (removed right after the one contract edit)
npm run test:ui              → SKIPPED: no UI change; the CI job UI runs it
CI                           → see the tracker row of P1.8
```

## Done (tested)

- `QueryCoordinator.ts`: `DefaultQueryCoordinator` and `QueryCoordinatorOptions`, from the quarry working tree,
  with two changes.
  - **Per-key generations.** `invalidate` records for every bumped key its generation after the bump
    (`PendingInvalidation.keys` is a `Map`), and the event lists `{ key, generation }`. The event's own
    `generation` is still the count of `invalidate()` calls.
  - **The `carryOver` leak.** A stale computation's unreleased handles are moved into `carried` of the
    recompute, not into `active`. They keep the recompute alive until a consumer joins it, it settles, the
    next invalidation, or their own `release()`, and are never carried a second time. In the quarry they
    stayed in `active` until the consumer released a handle that had already failed.
- `index.ts`: the quarry's five exports.
- `QueryCoordinator.test.ts`, new, 17 tests, no timers.
  - The seven titles the item names, literally: `one computation per key/generation`,
    `stale mid-computation is never cached and rejects StaleQueryError`, `old completion cannot repopulate`,
    `release does not cancel other subscriber`, `subscribers converge`,
    `invalidate coalesces into one event`, `dispose rejects pending`. They cover the five invariants of
    ADR-002 in that order, then the event and disposal.
  - The two the ruling names: `carry-over: a joining subscriber replaces the carried keep-alives` and
    `carry-over: a recompute kept alive only by carried handles is not carried again`.
  - Eight more: `carry-over: the recompute runs for a subscriber that has not asked again yet, until it
    settles`, `carry-over: releasing the stale handle without asking again aborts the recompute`,
    `streams chunks to every unreleased subscriber, also after the value resolved`,
    `reports a chunk listener that throws and still serves the others`,
    `rejects every subscriber when the computation fails, caches nothing and computes again on the next
    query`, `treats a compute function that throws synchronously as a failed computation`,
    `keeps at most maxCachedValues values, dropping the least recently used, and keeps their generations`,
    `bumps only the keys a scope reaches and reports none when it reaches nothing`.

## Done (untested)

- `src/core/contracts.ts:138-145`: `InvalidationEvent`. A type; the coordinator and its tests are its check.
- Three lines of `QueryCoordinator.ts` have no test (98.33 % lines): branches of the eviction loop and of the
  deferred abort that need a state the public interface does not produce on demand.
- Nothing constructs the coordinator yet: `Catalog` (P2.8) and the composition root (P2.10) are the first
  users.

## Not started

- The wire event: `resources/invalidated` in `src/protocol/messages.ts` still carries one `generation` and
  no keys, and ADR-002 and ADR-008 describe it that way. The ruling defers that contract change to the item
  that first emits the event; the tracker rows of P2.9, P2.10 and P3.3 carry the notes.
- No bench for the coordinator: the item names none (P2.12 names queue and scopes benches).

## Deviations from contract/ADR (file:line each)

- `src/core/contracts.ts:138-145` changed under the advisor approval below (decision D6): pasted into
  `docs/plans/STATUS.md` first, sentinel with the content `P1.8` created after it and removed as soon as
  that one edit was made. No other line of the file changed, and no other frozen path.
- Step 3 of the ruling: `run()` of the quarry already returns without calling `compute` when its computation
  is no longer current (`QueryCoordinator.ts:291-293`). No guard was added. It returns silently; it does not
  reject or mark anything, and nothing needs it to: a computation that never ran has no attached handle that
  was not rejected by the invalidation that superseded it.
- Generations in the ruling's test sketches are one lower than in the code. The ruling says a consumer that
  asks again after one invalidation "gets a handle for generation 1", and that a fresh query after two
  invalidations "computes generation 2". The first computation of a key is generation 1
  (`QueryCoordinator.ts:271-273`, and `generationOf` is 0 only before that), so the tests assert 2 and 3.
  The behaviour the ruling describes is what the tests check.
- `query()` calls `dropCarried` for a new computation as well as for a joined one (`:172-173`). A new
  computation has no carried handles, so the call does nothing there; one unconditional call avoids a branch.
- The interface the ruling calls `Pending` keeps the quarry's name `PendingInvalidation`.
- `dispose()` rejects pending handles with a plain `Error('QueryCoordinator is disposed')`, not with
  `StaleQueryError`; `dispose rejects pending` pins that, as the ruling asks.
- Not changed, the quarry's behaviour: when several invalidations are merged into one event, the event
  carries the reason of the first (`:215-223`); `invalidate coalesces into one event` records it.
- `CHANGELOG.md`: one entry under `### Added` and one headline under `### Changed`, as the ruling says.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-12, P1.8, the ⚑ consultation before any code (recorded first in `docs/plans/STATUS.md`, N42).
Question: the shape of `InvalidationEvent.keys` with per-key generations, the fix for the `carryOver` leak,
whether the seven test titles are literal, and whether the quarry's working tree is the base. The answer
contains code fences of its own and is kept in a four-backtick fence. Answer, verbatim:

````text
Correction to the brief first: `InvalidationEvent` is at `src/core/contracts.ts:138-144`, not 135-141 (the P1.1b-era notes that say 128-134 and 132-138 are stale too; the file grew in P1.1b and P1.7). Everything else the brief states about the tree checks out: `generationOf` is "0 when never computed" (`contracts.ts:160-161`), `EventMap['resources/invalidated']` is `{ scope; reason; generation: number }` (`src/protocol/messages.ts:186`, `docs/protocol.md:68`), ADR-002:56-59 and ADR-008:20-23 read as quoted, `src/core/queries/` holds only `scopes.ts` and `scopes.test.ts`, no file under `src/host`, `src/webview/{main,sidebar-next,shared}` mentions `generation`, the tree is clean at 32642aa and no sentinel exists.

DECISION: (1) Option 1a, confined to `src/core/contracts.ts`: `InvalidationEvent.keys` becomes `Array<{ key: ResourceKey; generation: number }>`, the event's `generation` stays and is documented as a per-event sequence number that is not comparable with a key's generation; the per-key value is recorded at bump time (last bump in a coalesced tick wins, which equals the flush-time value). The protocol event `resources/invalidated`, ADR-002 and ADR-008 are not touched in P1.8; the protocol side goes to the item that first emits the event (P2.9/P2.10) under its own approval, with tracker notes written now. (2) A `carried: Set<Subscription>` on `Computation` — 2b's data structure with 2a's lifetime: a stale computation's unreleased `active` handles are moved into `next.carried` as a provisional keep-alive that ends when a consumer joins `next`, when `next` settles, at the next invalidation (carried handles never count for a further carry-over) or on an explicit `release()`, whichever comes first; liveness everywhere is `active.size + carried.size`. No ADR edit is needed for it. (3) The seven titles are literal `it()` titles, exactly as written in the row; extra tests are allowed and two are named below. The quarry working tree (with its uncommitted edits) is the base for the copy; "apply uncommitted refactor" and D3 mean the same thing.

WHY: D6 (plan line 50) and the recorded P1.1b rulings (`docs/plans/STATUS.md:33`, `:293`, `:310`, `:366`; `src/core/session/STATUS.md:136`) approve one thing for P1.8: the `InvalidationEvent` member of `src/core/contracts.ts`. The P1.8 row (plan line 215) names `InvalidationEvent.keys` and no protocol or ADR file, its gate is "tests green; eslint 0; tsc 0" with no `docs:protocol:check`, nothing in the tree consumes the event yet (grep above), and the advisor's own tiebreak is the narrowest contract and the least work lost: the first emitter (P2.9 `WebviewHost`, P2.10 "watcher → `resources/invalidated`", plan lines 233-234) and the first consumer (P3.3, line 246) settle the protocol shape with `docs:protocol:check` as their gate. Neither ADR describes the core member, so the contracts edit creates no ADR mismatch; the existing mismatch (ADR-002:56 broadcasts one global `generation`, ADR-008:21 compares per key) predates P1.8 and travels as tracker notes. 1a keeps `generation` because removing it would also change the protocol event and ADR-002:56; 1c leaves `keys` as it is, which is not what the row says ("`keys` carries"). For (2) the brief's reading of the leak is the right one: a carried subscription is already rejected, is never in `next.attached`, and in the quarry stays in `next.active` until the consumer releases a handle that already failed, so a consumer that re-queries without releasing (a) blocks the abort of `next` when its new handle is released, (b) is carried again on every later invalidation and starts a recompute for nobody, and (c) is held for the entry's lifetime. The carried set bounds that interest to one generation and to the first of four definite events, which keeps ADR-002 invariant 2 literally true ("recomputes if any subscriber remains": the carry test stays `current.active.size > 0`) and invariant 4 intact (joining replaces the provisional keep-alives, so "the last subscriber leaves" means the real ones). 2c would delete behaviour ADR-002 and the class comment describe for no gain in safety.

DO:
1. N42 order. Paste this answer verbatim under `## Advisor decisions` in `docs/plans/STATUS.md` as `### P1.8 — ⚑ brief: QueryCoordinator, InvalidationEvent.keys, carryOver (2026-10-12)`, set the P1.8 tracker row to `in-progress`, and add to it: "`src/core/contracts.ts:138-144` (`InvalidationEvent`) edited under the advisor approval of 2026-10-12 (sentinel `P1.8`); protocol event, ADR-002:56 and ADR-008:21 deferred to P2.9/P2.10 and P3.3 by that ruling." Only then create `.claude/.contract-change` with content exactly `P1.8`.
2. The one contract edit — replace `src/core/contracts.ts:138-144` with exactly:
```ts
export interface InvalidationEvent {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Sequence number of this event: the coordinator's count of `invalidate()` calls folded into it. It is not a resource generation and is not comparable with `QueryHandle.generation` or the `generation` of a response envelope. */
    generation: number;
    /** Every key the coordinator has seen that `scope` reached, with its generation after this invalidation (the value a `QueryHandle` and an ok response envelope carry for that key). Keys never queried are absent. */
    keys: Array<{ key: ResourceKey; generation: number }>;
}
```
No other line of `contracts.ts` changes.
3. Copy `src/core/queries/QueryCoordinator.ts` and `src/core/queries/index.ts` from the quarry working tree. Before editing, confirm two facts with `grep -n "private run\|private create\|entry.current" <quarry>/src/core/queries/QueryCoordinator.ts`: `create(entry, key, compute)` sets `entry.current` to the new computation with `generation = entry.generation`, and `run(entry, computation)` either has or lacks a guard for `entry.current !== computation`. If the guard is missing, add it as the first statement of `run`: when `entry.current !== computation`, do not call `compute`; reuse `settle`'s stale branch (reject every `attached` handle with `StaleQueryError(key, computation.generation)`, mark `settled`, cache nothing) and return. This is the item's own file; no approval is needed.
4. Per-key generations in `invalidate()` and `flushInvalidation()`. Change the pending record to
```ts
interface Pending {
    scope: InvalidationScope;
    reason: InvalidationReason;
    /** Keys bumped since the last flush with their generation after the latest bump. */
    keys: Map<ResourceKey, number>;
}
```
In `invalidate()` replace `const affected: ResourceKey[] = []` with `const affected = new Map<ResourceKey, number>();`, replace `affected.push(key)` (immediately after `entry.generation++`) with `affected.set(key, entry.generation);`, and replace the tail with
```ts
if (this.pending) {
    this.pending.scope = mergeScopes(this.pending.scope, scope);
    for (const [key, generation] of affected) {
        this.pending.keys.set(key, generation);
    }
    return;
}
this.pending = { scope, reason, keys: affected };
queueMicrotask(() => this.flushInvalidation());
```
In `flushInvalidation()` replace `keys: [...pending.keys],` with
```ts
keys: [...pending.keys].map(([key, generation]) => ({ key, generation })),
```
Leave `invalidationCount` and the `generation: this.invalidationCount` line as they are; they are the sequence number step 2 documents.
5. The `carryOver` fix. Types:
```ts
interface Subscription {
    released: boolean;
    deferred: Deferred;
    onChunk?: ChunkListener;
    /** Computation this subscription currently keeps alive (re-pointed when carried over). */
    owner: Computation;
}

interface Computation {
    key: ResourceKey;
    generation: number;
    controller: AbortController;
    compute: ComputeFn;
    /** Handles created for this computation; they receive its value and chunks. */
    attached: Set<Subscription>;
    /** Unreleased handles among `attached`. */
    active: Set<Subscription>;
    /**
     * Unreleased handles of the stale predecessor, already rejected with `StaleQueryError`. They keep this
     * recompute alive only until a consumer joins it, it settles or the next invalidation, and are never
     * carried a second time; they do not receive its value.
     */
    carried: Set<Subscription>;
    settled: boolean;
}
```
(keep the quarry's names for `Deferred`, `ChunkListener`, `ComputeFn`). `create()` initialises `carried: new Set()`. Two module-level helpers:
```ts
function isAlive(computation: Computation): boolean {
    return computation.active.size > 0 || computation.carried.size > 0;
}

/** End the provisional keep-alive of carried-over handles; a later `release()` of such a handle is a no-op. */
function dropCarried(computation: Computation): void {
    for (const subscription of computation.carried) {
        subscription.released = true;
    }
    computation.carried.clear();
}
```
`invalidate()`, per matching entry (the carry test stays `current.active.size > 0`; carried handles never count):
```ts
entry.generation++;
affected.set(key, entry.generation);
const current = entry.current;
if (!current) {
    continue;
}
entry.current = undefined;
current.controller.abort();
const stale = new StaleQueryError(key, current.generation);
for (const subscription of current.attached) {
    subscription.deferred.reject(stale);
}
if (!current.settled && current.active.size > 0) {
    this.carryOver(entry, current);
}
dropCarried(current);
```
`carryOver`:
```ts
/**
 * Start the recompute for the new generation right away and let the stale computation's unreleased handles
 * keep it alive provisionally, so a consumer that re-`query()`s on `StaleQueryError` joins work already in
 * flight. Only `active` handles are carried; a recompute kept alive solely by carried handles is not carried
 * again (see `invalidate`). The `compute` call is deferred by one microtask so a synchronous burst of
 * invalidations starts at most one recompute.
 */
private carryOver(entry: Entry, stale: Computation): void {
    const next = this.create(entry, stale.key, stale.compute);
    for (const subscription of stale.active) {
        subscription.owner = next;
        next.carried.add(subscription);
    }
    stale.active.clear();
    queueMicrotask(() => this.run(entry, next));
}
```
`query()`: in the branch that joins `entry.current`, directly after `current.attached.add(subscription); current.active.add(subscription);` add `dropCarried(current);` (a real subscriber replaces the provisional ones). `settle()`: first statement `dropCarried(computation);`, before the `entry.current !== computation` check; the rest of `settle` is unchanged. `release()`:
```ts
private release(entry: Entry, subscription: Subscription): void {
    if (subscription.released) {
        return;
    }
    subscription.released = true;
    const owner = subscription.owner;
    owner.active.delete(subscription);
    owner.carried.delete(subscription);
    if (isAlive(owner)) {
        return;
    }
    queueMicrotask(() => {
        if (isAlive(owner) || this.disposed) {
            return;
        }
        owner.controller.abort();
        if (!owner.settled && entry.current === owner) {
            entry.current = undefined;
        }
    });
}
```
Update the class comment's sentence about carry-over to: "if any of those handles is still subscribed — starts the recompute for the new generation right away, so a consumer that re-`query()`s on `StaleQueryError` joins work already in flight instead of starting over; the old handles keep that recompute alive only until a consumer joins it, it settles or the next invalidation, and are never carried twice."
6. Write `src/core/queries/QueryCoordinator.test.ts` with the seven literal `it()` titles: `one computation per key/generation`, `stale mid-computation is never cached and rejects StaleQueryError`, `old completion cannot repopulate`, `release does not cancel other subscriber`, `subscribers converge`, `invalidate coalesces into one event`, `dispose rejects pending`. Add two for the leak: `carry-over: a joining subscriber replaces the carried keep-alives` (query A; invalidate while A's compute is pending; A's `value` rejects with `StaleQueryError`; A re-queries without releasing the old handle and gets a handle for generation 1; the second `compute` call was made and the new handle joined it, so `compute` was called exactly twice; release the new handle only; after a flush the second call's `ctx.signal.aborted` is `true` — the quarry leaves it `false`) and `carry-over: a recompute kept alive only by carried handles is not carried again` (query A; two synchronous `invalidate` calls while A's compute is pending; after a flush `compute` was called exactly once more at most — exactly once in total with the step-3 guard — and no second call was made for generation 1; then a fresh query computes generation 2 and `generationOf(key)` is 2). `invalidate coalesces into one event` asserts the merged scope, one event, `event.generation === 2`, and `event.keys` equal (as a set) to the bumped keys with their current generations, including a key bumped twice in the same tick reporting its final generation. `dispose rejects pending` pins the error class the quarry's `dispose()` actually uses (read it; do not guess) and asserts no `onDidInvalidate` event fires for an `invalidate` after `dispose`. Use deferred promises and a `flushMicrotasks(rounds = 8)` helper (a loop of `await Promise.resolve()`), never timers. Ordering facts to rely on: a rejected handle's `catch` reaction runs before the carried `run` microtask (the reject is synchronous inside `invalidate`, `queueMicrotask(run)` is enqueued after it), so a re-`query()` inside the handler joins `next` before `compute` runs — that is the test shape for "joins work already in flight"; the abort after a last `release()` lands one microtask after `run`, so when a consumer releases a stale handle without re-querying, assert `signal.aborted` after a flush, not the call count; the event flush and the carried `run` are each one microtask after `invalidate()`.
7. `src/core/queries/index.ts` keeps the quarry's five exports. Gates: `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/queries` green with ≥ 9 coordinator tests; `npm test`; `npm run bench`; `npx vitest run --coverage` green (the `src/core/**` 85 % floor). `grep -rln child_process src/core` must still list only `src/core/cli/*`; `grep -rn Thenable src/core` → only `contracts.ts` (none expected there since P1.1a).
8. Docs duties: CHANGELOG `[Unreleased]` `### Added` `**2.0 query coordinator** — …` in the style of lines 12-18, and one `### Changed` headline `**InvalidationEvent.keys carries per-key generations**`; ARCHITECTURE.md 2.0 section module-map row for `core/queries`; ledger: C-state-core-1 → `closed (P1.8)`, C-state-core-2 → `closed (P1.8)`, N10 → `replacement landed (P1.8); the legacy row is deleted with the legacy code at P8.2`. Tracker notes: P2.9 and P2.10 — "`resources/invalidated` must carry the same `keys: Array<{ key; generation }>` shape as `InvalidationEvent` (P1.8 ruling of 2026-10-12) so the host forwards the core event unchanged; this is a `src/protocol/messages.ts` edit with `docs/protocol.md` regeneration and inline amendments of ADR-002:56-59 and ADR-008:20-23 under its own approval and sentinel, before P3.3 starts"; P3.3 — "compare the ok response's `generation` with the generation listed for the same key in the latest `resources/invalidated` event, never with the event's own `generation` (a sequence number); `keys` lists only keys the coordinator has seen".
9. Write `src/core/queries/STATUS.md` per plan §2.5 (first note for this directory; list under "Deviations" the step-3 guard if added and the two extra test titles). Then `rm .claude/.contract-change`, commit with the `git-commit` skill citing P1.8, D3, D6, ADR-002, C-state-core-1, C-state-core-2, N10, N42; push to `labs/2.0`; wait for green CI (the P1.7 run must be green first).

DO NOT:
- Do not edit `src/protocol/messages.ts`, any `docs/adr/**` file or `docs/protocol.md` in P1.8; the sentinel permits it technically, this ruling does not.
- Do not remove, rename or redefine `InvalidationEvent.generation`, and do not add a `generations` record beside `keys` (option 1c).
- Do not add a named `InvalidatedKey` type to `protocol/domain.ts` or `contracts.ts`; the inline shape is the whole change.
- Do not look up `entry.generation` at flush time from `this.entries`; the `Map` written at bump time is the record.
- Do not count carried handles in `invalidate()`'s carry test or move `stale.carried` into `next` (no chaining).
- Do not delete carry-over (option 2c) or change ADR-002 invariant 2's wording.
- Do not add a `reconcile` call or any `SessionStore` reference to `QueryCoordinator.ts` (P1.7 ruling).
- Do not assert `compute` call counts where the abort lands one microtask after `run`; assert `signal.aborted`.
- Do not use `setTimeout`/`setImmediate`/fake timers in the coordinator tests.
- Do not touch `scopes.ts` or `scopes.test.ts`, and do not widen `QueryHandle`, `QueryContext` or `QueryCoordinator` in `contracts.ts` to make a type error go away.

CONTRACT CHANGE: `src/core/contracts.ts:138-144` (`InvalidationEvent` only, text in step 2), item P1.8, sentinel `.claude/.contract-change` with content `P1.8`, created after step 1 and deleted before the commit. No other frozen path changes in P1.8; `src/protocol/messages.ts`, `docs/protocol.md`, `docs/adr/002-query-coordinator.md:56-59` and `docs/adr/008-webview-architecture.md:20-23` change in the P2.9/P2.10 contract item named in step 8.

VERIFY: `git diff --stat 32642aa -- src/core/contracts.ts src/protocol docs/adr docs/protocol.md` lists only `src/core/contracts.ts` with one hunk; `git diff 32642aa -- src/core/contracts.ts | grep -c '^+.*keys: Array<{ key: ResourceKey; generation: number }>'` → 1; `grep -c "it('one computation per key/generation'\|it('stale mid-computation is never cached and rejects StaleQueryError'\|it('old completion cannot repopulate'\|it('release does not cancel other subscriber'\|it('subscribers converge'\|it('invalidate coalesces into one event'\|it('dispose rejects pending'" src/core/queries/QueryCoordinator.test.ts` → 7; `grep -c "carried" src/core/queries/QueryCoordinator.ts` ≥ 8 and `grep -n "keys: Map<ResourceKey, number>" src/core/queries/QueryCoordinator.ts` → 1 hit; `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/queries` → all passed with ≥ 9 tests in `QueryCoordinator.test.ts`; `npm run docs:protocol:check` → 0 (unchanged, proving the protocol was not touched); `ls .claude/.contract-change` → no such file before `git commit`; CI on `labs/2.0` green.

Files checked: `/Users/mattias/github/nuiget/.github/agents/architecture-advisor.agent.md`; `/Users/mattias/github/nuiget/docs/plans/2026-10-11-nuiget-2.0-execution-plan.md` lines 41-159 (D1-D13, §2, §3), 203-219 (P1 rows), 233-234, 246, 395-440 (Appendix B); `/Users/mattias/github/nuiget/src/core/contracts.ts` (whole file; `:116-164`); `/Users/mattias/github/nuiget/docs/adr/002-query-coordinator.md`; `/Users/mattias/github/nuiget/docs/adr/008-webview-architecture.md`; `/Users/mattias/github/nuiget/docs/adr/007-protocol.md:25-35`; `/Users/mattias/github/nuiget/src/protocol/envelope.ts`; `/Users/mattias/github/nuiget/src/protocol/messages.ts:10-30,170-200`; `/Users/mattias/github/nuiget/src/protocol/domain.ts:236-262`; `/Users/mattias/github/nuiget/src/protocol/protocol.test.ts:80-100`; `/Users/mattias/github/nuiget/docs/protocol.md:1-12,24-29,66-74`; `/Users/mattias/github/nuiget/scripts/gen-protocol-docs.mjs:70-120`; `/Users/mattias/github/nuiget/scripts/hooks/guard.mjs:1-40`; `/Users/mattias/github/nuiget/src/core/queries/scopes.ts`; `/Users/mattias/github/nuiget/src/core/util/events.ts`; `/Users/mattias/github/nuiget/docs/plans/STATUS.md` rows 21-50 and lines 148-438 (P1.1b and P1.7 advisor decisions); `/Users/mattias/github/nuiget/docs/plans/findings-ledger.md:112,322,376-386`; `/Users/mattias/github/nuiget/src/core/session/STATUS.md:133-165`; `/Users/mattias/github/nuiget/src/protocol/STATUS.md:322-324`; `/Users/mattias/github/nuiget/vitest.config.mts:29,48-64`; `/Users/mattias/github/nuiget/CHANGELOG.md:8-18`. Commands: `git status --short` (clean), `git log --oneline -3` (head 32642aa), greps for `generation`, `resources/invalidated`, `carryOver`, `Deferred` across `src` and `docs`. Not run: any gate (inspection only). The quarry excerpts were taken from the brief, as the subagent cannot read the quarry worktree; step 3 names the two facts about `create()` and `run()` that the brief did not paste and the grep that produces them.
````

Acted on: steps 1 to 9, with the notes above. The item's own Ask trigger, "microtask-ordering doubts", did
not fire: every test is deterministic with deferred promises and microtask flushes, and none needs a timer
or a change of emission order.

## Exact next step (one item ID)

P1.9 (`src/core/http/ssrf.ts` and `ssrf.test.ts`; `http/index.ts` exports ssrf only).
