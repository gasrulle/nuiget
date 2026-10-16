# STATUS — src/core/sources   commit 756dcd1 (P7.5c; parent of the P7.fix-1 commit)   2026-10-16T12:30:00Z

git status --porcelain --untracked-files=all (before the commit): modified `.github/copilot-instructions.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, `docs/plans/{STATUS,findings-ledger}.md`, `src/core/cli/{powershell,powershell.test}.ts`,
`src/core/sources/{NuGetConfigReader,NuGetConfigReader.test}.ts`, `src/core/credentials/DefaultCredentialProvider.test.ts`,
and the STATUS notes of `src/core/sources`, `src/core/cli`, `src/core/credentials`

Item: **P7.fix-1** — DPAPI decryption gets the PowerShell default budget and a timeout is transient (fix-forward of
CI run 38868138060, P7.5c's first red run; N83), by the ruling of 2026-10-16 (verbatim below). This note replaces the
P7.3 note of this directory (in its history at `5717e39`).

## Verified by running

```text
baseline at 756dcd1 (P7.5c; CI run 38868138060 red on `Test (windows-latest)` only, test A of P7.3): local tsc 0 ·
                              check-types 0 · eslint 0 · npm test 3433 passed | 2 skipped
npx tsc --noEmit / npm run check-types / npx eslint src / npm run lint → exit 0 each (check-types first failed on the
                              test recorder's `signal: string`; typed as `NodeJS.Signals`)
npx vitest run --project backend src/core/cli src/core/sources src/core/credentials → 11 files, 222 passed | 4 skipped
                              (the gated Windows tests)
the same with DOTNET_ROOT and NUIGET_SDK_TESTS=1 → 11 files, 224 passed | 2 skipped (the two DPAPI tests: win32 only)
new titles: `dpapi: a timed-out PowerShell rejects instead of answering undefined (N83)` ✓ · `config: a decryption that
                              times out is not remembered and is asked again` ✓
npm test (DOTNET_ROOT set, NUIGET_SDK_TESTS=1) → exit 0 · Test Files 169 passed (169) · Tests 3435 passed | 2 skipped (3437)
npm run bench               → exit 0 · Test Files 20 passed (20) · Tests 119 passed | 1 skipped (120)
grep -rln child_process src/core --include='*.ts' → src/core/cli/* only · grep -c DECRYPT_TIMEOUT_MS → 0
rm -rf dist && node esbuild.mjs --v2 --production --analyze → extension 293183 / 321341 (+112 from P7.5b) · webview
                              524462 / 575626 · sidebar 318876 / 350684
rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix → exit 0, "check:vsix: OK"; npm run docs:check → 0
test -e .claude/.contract-change → false
```

## Done (tested)

- `NuGetConfigReader.ts`: `DECRYPT_TIMEOUT_MS` (5 000 ms) deleted; `decryptPassword` passes `options.timeoutMs`
  through, so `runPowerShellEncoded` applies its default of 10 000 ms; a result with `timedOut` rejects with
  "DPAPI decryption timed out after <ms> ms" (no value, source or user in the message); every other failure still
  answers `undefined`. JSDoc says so.
- `NuGetConfigReader.test.ts`: new `dpapi: a timed-out PowerShell rejects instead of answering undefined (N83)`; `dpapi:
  decrypts through runPowerShellEncoded with an injected execFile on win32` also asserts the 10 000 ms budget (the
  recorder records the options). Test A, test B, `storeEncrypted` and `answers undefined when PowerShell fails or
  prints nothing` unchanged.

## Done (untested)

- Test A on the Windows job with the new budget: the CI run of this commit decides (VERIFY of the ruling).

## Not started

- P7.6 (acceptance cut, ⚑), after this commit's CI is green.

## Deviations from contract/ADR (file:line each)

- None (no frozen file). The P7.3 ruling's DO NOT on raising `DECRYPT_TIMEOUT_MS` is superseded by this ruling.

## Advisor decisions (date, item, question, answer verbatim)

2026-10-16, P7.5c/P7.fix-1 (stop-and-ask: the red Windows job of run 38868138060, N83), verbatim:

`````text
DECISION: Option 2 as a new tracker row `P7.fix-1` (not a P7.5c follow-up, not P7.6), folded together with option 4: `decryptPassword` runs with the PowerShell module default budget (10 000 ms; `DECRYPT_TIMEOUT_MS` deleted) and a timed-out decryption rejects instead of answering `undefined`, so `DefaultCredentialProvider` treats it as transient (not cached, one redacted warning) rather than remembering "no credential" for five minutes. Test A keeps its product defaults. Not option 1 (a re-run hides a product budget that a representative Windows machine just exceeded; the environmental list of the gotcha row is N37/N44/N65, all e2e/UI jobs), not option 3 (a 60 s override destroys what test A exists for: the product path with the product budget). P7.6 waits for it. Nothing here is the owner's.

WHY: The brief is right about the tree: `src/core/sources/NuGetConfigReader.ts:147` sets `DECRYPT_TIMEOUT_MS = 5_000` and `:171` passes it to `runPowerShellEncoded`, whose timeout kill answers `exitCode -1`, empty stdout (`src/core/cli/powershell.ts:76-91`), which `:172` turns into `undefined`; `DefaultCredentialProvider.ts:174-179` then returns `NONE`, and `getAuthHeader` caches a `NONE` header for `FAILURE_TTL_MS` = 5 min (`:106-108`), which breaks the repo's own rule "cache successes and definitive failures only" (gotcha "Transient failure cached as a result"; the class JSDoc at `:51` and `ARCHITECTURE.md:99` already promise that a timeout is not kept). The diagnosis rests on elimination, not on the 5294 ms arithmetic (a 5 000 ms kill leaves ≤ 294 ms for `dotnet nuget add source` plus a config read, which is thin): test B in job of run 38868138060 ran the same one-element entropy statement against a value stored the same way, with `timeoutMs: 60_000` (`NuGetConfigReader.test.ts:198`), and passed at 2765 ms, where its four previous runs took 1558–1761 ms, so the runner was slow and the only material difference between A and B is the budget; the P7.3 ruling (`docs/plans/STATUS.md` "P7.3 — stop-and-ask: the red Windows job of commit 1", DO 10) foresaw exactly this second failure and named the 5 000 ms budget as the one remaining difference. The 5 s figure has no evidence from a path that ever worked: it is 1.x's `timeout: 5000` (`src/services/CredentialService.ts:289`), whose decrypt never succeeded on a CLI-stored value (N54, N80). 10 000 ms is `DEFAULT_POWERSHELL_TIMEOUT_MS` (`powershell.ts:5`) and `PLUGIN_TIMEOUT_MS` (`DefaultCredentialProvider.ts:38`): one budget for the two credential processes, framed as a cap on first-request latency, not on correctness, because once a kill is transient the next `getAuthHeader` retries against a warm PowerShell (test B's two runs after A's cold start took under 1 s each). The rejection reaches `acquire`'s catch (`DefaultCredentialProvider.ts:142-145`), which already logs `Credential lookup (nuget.config) failed for <url>: <message>` through `redact` and returns `TRANSIENT`; the message "PowerShell timed out after N ms" carries no secret, so a missing credential becomes diagnosable without logging stderr (the N80 acceptance stands). ADR-003:40 fixes only `execFile` with `-EncodedCommand`; ADR-005 says nothing about the budget. The P7.3 ruling's DO NOT ("raise `DECRYPT_TIMEOUT_MS` … widen the signature") was conditional on the N80 diagnosis and is superseded by this evidence; its scope rule on `src/core/cli/**` was P7.3's file list, and the new row names the file.

DO:
1. `docs/plans/STATUS.md`: insert row `P7.fix-1` before P7.6 (so it is the first `open` row), phase P7, item "DPAPI decryption: PowerShell default budget; a timeout rejects and is transient (fix-forward of CI run 38868138060 for P7.5c; N83)", status `open` → `done` in the commit. Row P7.5c stays `done`; put `756dcd1` in its Commit column and append to its note "CI run 38868138060 red on `Test (windows-latest)` only: test A of P7.3 timed out at the 5 000 ms decrypt budget (N83); first red run of RUN.md §5 step 3, fixed forward by P7.fix-1 (no P7.5c file involved)". Paste this answer verbatim under `## Advisor decisions` as "P7.5c/P7.fix-1 — stop-and-ask: the red Windows job of run 38868138060 (N83) (2026-10-16)".
2. `src/core/cli/powershell.ts`: `PowerShellResult` gains `timedOut?: boolean` (mirrors `DotnetResult.timedOut?` at `src/core/contracts.ts:180`), set to `true` in `settle` when `error?.killed === true`, absent otherwise (so every existing `toEqual` in `powershell.test.ts` holds); JSDoc of the field: "Set when the process was killed at `timeoutMs`." `DEFAULT_POWERSHELL_TIMEOUT_MS` stays 10 000.
3. `src/core/cli/powershell.test.ts:77-80` ("describes a timeout when the process was killed without output"): expected object gains `timedOut: true`. No other assertion changes.
4. `src/core/sources/NuGetConfigReader.ts:140-173`: delete `DECRYPT_TIMEOUT_MS` (`:147`); `:171` passes `timeoutMs: options.timeoutMs` through (the module default applies); after the call, `if (result.timedOut) { throw new Error(\`DPAPI decryption timed out after ${options.timeoutMs ?? DEFAULT_POWERSHELL_TIMEOUT_MS} ms\`); }` (import the constant from `../cli`; the message names no value, source or user); keep `return result.exitCode === 0 && result.stdout.length > 0 ? result.stdout : undefined`. JSDoc: replace "Never rejects" with "Rejects only when PowerShell did not answer within the budget, so the credential provider treats that as transient; every other failure answers `undefined`." Script, `BASE64`, `DecryptOptions` and the signature unchanged.
5. `src/core/sources/NuGetConfigReader.test.ts`, `describe('decryptPassword')`: one new test `dpapi: a timed-out PowerShell rejects instead of answering undefined (N83)` using `recorder({ error: Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }) })` on `win32`: `await expect(decryptPassword('QUJDRA==', { platform: 'win32', execFile })).rejects.toThrow(/timed out after 10000 ms/)`, and the rejection message does not contain `QUJDRA`. Also in `dpapi: decrypts through runPowerShellEncoded …` assert the recorded `options.timeout` is `10_000` (extend `recorder` to record `_options` as `options`; nothing else of it changes). Test A (`:186-189`), test B, `storeEncrypted`, `notWindowsWithSdk` and `answers undefined when PowerShell fails or prints nothing` (its error has `code: 1`, not `killed`, so it stands) stay byte for byte.
6. `src/core/credentials/DefaultCredentialProvider.ts`: no code change (the catch at `:142-145` is the path). `:30` comment stays. `src/core/credentials/DefaultCredentialProvider.test.ts`: one new test after `:300`'s block, `config: a decryption that times out is not remembered and is asked again`: `decrypt` rejects once with `new Error('PowerShell timed out after 10000 ms')` then resolves `'s3cret'`; first `getAuthHeader(privateUrl)` → `undefined`, `logger.warn` called with `Credential lookup (nuget.config) failed for ${privateUrl}: PowerShell timed out after 10000 ms`, second call → `basic('alice', 's3cret')`, `decrypt` called twice, `logged(logger)` does not contain `s3cret`.
7. `docs/plans/findings-ledger.md`: `grep -c "| N83 " docs/plans/findings-ledger.md` → 0 (it is at this tree), then add N83, Sev Medium, section 1 row and section 4 entry: "`decryptPassword` ran PowerShell with a 5 000 ms budget (`NuGetConfigReader.ts:147`, 1.x's figure from a path that never decrypted a CLI-stored value, N54/N80), below a cold `powershell.exe` start on a slow Windows machine (CI run 38868138060, `Test (windows-latest)`: test A `expected undefined to be 'p73-…'` at 5294 ms; test B with a 60 s budget passed at 2765 ms in the same job, against 1558–1761 ms in its four previous runs), and a timed-out decryption answered `undefined` like a definitive failure, so `DefaultCredentialProvider` cached "no credential" for `FAILURE_TTL_MS` (5 min) against its own JSDoc and `ARCHITECTURE.md:99`. Found by the Windows job of P7.5c's push. Fix: module default budget (10 000 ms), `PowerShellResult.timedOut`, a timeout rejects and is transient. Status: closed (P7.fix-1, test A green on the Windows job of CI run <new id>)".
8. Docs: `CHANGELOG.md` `## [Unreleased]` `### Fixed`, headline only, after the DPAPI line: `- **2.0 DPAPI decryption budget and a timed-out decryption is asked again**`. `ARCHITECTURE.md:99` (credentials row): "when decryption fails the next step runs" → "when decryption fails the next step runs, and a decryption that times out is transient like a plugin timeout". `.github/copilot-instructions.md`: amend the existing 2.0 row "Transient failure cached as a result" with "…, and a DPAPI decryption that times out rejects so the credential provider does not remember it as `none` (N83); the decrypt budget is the PowerShell default, never shorter"; no new row, and do not add this failure to "A red CI run is not always a code failure". `src/core/sources/STATUS.md` rewritten from the §2.5 template at the new commit (this answer verbatim under `## Advisor decisions`; "Exact next step: P7.6"); `src/core/cli/STATUS.md` and `src/core/credentials/STATUS.md` get a header SHA and one "Verified by running"/"Deviations" line naming `timedOut` and the new test.
9. Gates, each read for its exit code: `npx tsc --noEmit` → 0; `npm run check-types` → 0; `npx eslint src` → 0; `npx vitest run --project backend src/core/cli src/core/sources src/core/credentials --reporter=verbose` green, the two gated titles `skipped`, the two new titles passed; `DOTNET_ROOT="$(dirname "$(command -v dotnet)")" NUIGET_SDK_TESTS=1 npx vitest run --project backend src/core/cli src/core/sources src/core/credentials` green; `npm test` → exit 0, `3435 passed | 2 skipped (3437)`; `npm run bench` → exit 0; `grep -rln child_process src/core --include='*.ts'` → `src/core/cli/*` only; `grep -c DECRYPT_TIMEOUT_MS src/core/sources/NuGetConfigReader.ts` → 0; `rm -rf dist && node esbuild.mjs --v2 --production --analyze` → paste the three sizes (`dist/extension.js` ≤ 321 341 and within a few hundred bytes of the P7.5b figure); `rm -rf dist && NUIGET_V2=1 npm run package && npm run check:vsix` → 0; `test -e .claude/.contract-change` → false; `git status --porcelain --untracked-files=all` lists exactly the files of steps 1-8.
10. Commit with the `git-commit` skill: `fix(core/sources,core/cli): DPAPI decryption gets the PowerShell default budget and a timeout is transient, not cached (P7.fix-1, P7.3, ADR-003, ADR-005, N83)`, body naming run 38868138060 as P7.5c's first red run and the elimination (test B); push; `gh run watch <id> --exit-status`.
11. Green → P7.fix-1 `done`, its SHA into its own Commit column in the P7.6 commit (RUN.md §5 step 1), then P7.6 (⚑: brief before any work). Red on `Test (windows-latest)` again with test A failing → mark P7.fix-1 `blocked` and brief with the now-visible rejection message (the fix turns a timeout into `Error: DPAPI decryption timed out after 10000 ms` instead of `expected undefined`) and test A's duration: a second failure with this fix in place is a different cause.

DO NOT:
- `gh run rerun 38868138060 --failed`: the failure is a product budget on a representative machine, and the environmental list (N37, N44, N65) names e2e and UI jobs only.
- Give test A `timeoutMs: 60_000` or any override: it is the product-path evidence; test B is the probe.
- Raise the budget beyond the module default or pick a figure without a measurement; the fix that matters is that a timeout is transient.
- Make `timedOut` a required field of `PowerShellResult` (seven `toEqual` assertions would churn for nothing) or detect the timeout by matching the stderr text.
- Catch the rejection inside `fromConfig` and return `NONE`: that is the defect.
- Log stderr, the encrypted value or the source URL from `decryptPassword`; the provider's redacted warning is the one log line.
- Touch `src/services/CredentialService.ts` (1.x, P8.2), `src/core/contracts.ts`, `src/protocol/**` or `docs/adr/**`.
- Cite P7.5c as the owner of the change or reopen it; start P7.6 before this run is green.

CONTRACT CHANGE: none. `PowerShellResult` (`src/core/cli/powershell.ts`) and `decryptPassword` (`src/core/sources/NuGetConfigReader.ts`) are not frozen; `CredentialProvider` in `src/core/contracts.ts` is unchanged; no sentinel.

VERIFY: `gh run view <new run id> --job <windows job id> --log | grep -E "dpapi \(Windows|Tests  "` shows `✓ dpapi (Windows, SDK 10): a password that dotnet nuget add source encrypted decrypts to the value that was stored` and `✓ dpapi (Windows): … (N54)` with no `failed`; locally `npm test` → exit 0, `3435 passed | 2 skipped (3437)`, and `npx vitest run --project backend src/core/credentials -t "times out is not remembered"` → 1 passed.

FILES CHECKED: `.github/agents/architecture-advisor.agent.md`; `docs/plans/2026-10-11-nuiget-2.0-execution-plan.md:60-100, 302-318` (§2.1-§2.3, P7 and P8 tables); `docs/plans/RUN.md:85-139` (§5-§8); `docs/plans/STATUS.md:105-111, 3469-3500` (P7.3 to P7.6 rows, the P7.3 red-run ruling, `.fix-n` precedent at P1/P2/P4); `docs/plans/findings-ledger.md:157, 177-179, 411, 437-439` (N54, N80-N82; N83 free); `src/core/sources/NuGetConfigReader.ts:120-173`; `src/core/sources/NuGetConfigReader.test.ts:108-213`; `src/core/cli/powershell.ts:1-96`; `src/core/cli/powershell.test.ts:30-106`; `src/core/credentials/DefaultCredentialProvider.ts:1-230`; `src/core/credentials/DefaultCredentialProvider.test.ts:296-335`; `src/core/contracts.ts:176-180`; `src/services/CredentialService.ts:268-289, 366`; `src/core/sources/STATUS.md:1-30, 142`; `ARCHITECTURE.md:98-99`; `CHANGELOG.md:50-70`; `.github/copilot-instructions.md:160-178`; `docs/adr/003-operation-queue-and-dotnet-runner.md:28-40`, `docs/adr/005-execution-context-and-outbound-policy.md:58`; `.github/workflows/ci.yml:19, 88`; `gh run view 38868138060` (jobs; `--log-failed`: test A × 5294 ms, test B ✓ 2765 ms, `Test Files 1 failed | 168 passed`); the `Test (windows-latest)` logs of runs 38831627819, 38863088619, 38864168236, 38866154469 (test A 4251/4138/3418/3293 ms, test B 1712/1761/1757/1558 ms); `git log` of the three DPAPI files (last changed by P7.3, 5717e39; 5 commits since, none touching them).
`````

The two P7.3 rulings of 2026-10-16 are verbatim in `docs/plans/STATUS.md` ("P7.3 — stop-and-ask: …").

## Exact next step (one item ID)

P7.6.
