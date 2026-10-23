# Owner patches

Changes to the files that hold a session's own permissions and launch configuration (`.claude/settings.json`,
`.claude/settings.local.json`, `.claude/launch.json`, `.mcp.json`) are never made by a session. They are written here
as a unified diff and applied by the owner with one command. Once P0's hook item lands, `scripts/hooks/guard.mjs`
denies a session any edit of those four files and any `git apply` of a patch that touches them.

## `settings-and-launch.patch` (the bundled patch of the UX plan)

Everything the UX plan's gates, workflows and browser loop need, applied once at plan approval. It adds nineteen allow
rules to `.claude/settings.json` and creates `.claude/launch.json`. The deny rules and the `hooks` block are
unchanged. It applies to `.claude/settings.json` as `main` has it at `e4d6e97` (blob `9a38660`).

Apply it from Terminal, on `labs/ux` after the planning commit and before starting the first implementing session:

```
git -C ~/github/nuiget apply patches/settings-and-launch.patch
```

No output means it applied. To check first without changing anything:

```
git -C ~/github/nuiget apply --check patches/settings-and-launch.patch
```

The first implementing session then lands P0's owner-action row, P0.0, as one commit that contains exactly the two
settings files and the tracker row: `.claude/settings.json`, `.claude/launch.json` and `docs/plans/STATUS-ux.md` with
P0.0 set to `done` and its Notes, nothing else. The guard allows staging and committing the two settings files and
nothing else on them. Until that commit they are uncommitted changes in the working tree, and once P0's hook item lands
the guard denies `git stash`, `git reset --hard`, `git checkout .` or `-- <path>`, `git restore`, `git clean -f` and
`git switch --discard-changes` while `.claude/settings.json`, `.claude/launch.json` or `.mcp.json` shows in
`git status --porcelain` (`.claude/settings.local.json`, the owner's local file, is left out of that check).

### Rules added to `.claude/settings.json`

| Rule | Why |
|---|---|
| `Bash(code-server *)` | Starts, installs into and queries the VS Code server web bundle for the browser loop (`docs/plans/browser-loop.md`) |
| `mcp__Claude_Browser__*` | The browser pane's tools for the browser loop; optional in Auto mode (the 2026-10-17 probe ran pane calls without it), and whether the glob covers the app's built-in pane server is unverified |
| `Bash(npx extest:*)` | The split ExTester commands (`get-vscode`, `get-chromedriver`, `install-vsix`, `run-tests`) of the two-tree negative control |
| `Bash(xvfb-run -a npx extest:*)` | The same commands under a virtual display on Linux |
| `Bash(npm run check:*)` | `npm run check:matrix` and every later `check:*` gate script (`check:vsix` is already allowed) |
| `Bash(gh api:*)` | Read GitHub data the gates need (run artifacts, check runs); read-only only through the guard, see below |
| `Bash(gh workflow run ci.yml:*)` | Dispatch the CI workflow (it has a `workflow_dispatch` trigger) for the Tier B capture matrix, the macOS capture job, the negative-control job and the phase gates; it starts a CI run on GitHub and changes no code |
| `Bash(npm view:*)` | Read-only npm registry lookups (versions, peer ranges) for the dependency-policy item P0.4 |
| `Bash(shasum -a 256:*)` | Hash the CI captures under `captures/<run-id>/`; the judge log and the advisor briefs cite captures by sha256 |
| `Bash(git worktree add:*)` | Check out the pre-fix tree (`80940aa`) under `/tmp` for the two-tree negative control without touching the main checkout |
| `Bash(git worktree list:*)` | List those worktrees (read-only) |
| `Bash(gh --version)` | The toolchain check at the start of every session |
| `Bash(git apply --check:*)` | Check that a patch applies without changing anything (this one included) |
| `Bash(npm ci --no-audit --no-fund)` | The exact install command of CI and of the negative control's old tree (`Bash(npm ci)` covers only the bare form) |
| `Bash(cat:*)`, `Bash(head:*)`, `Bash(tail:*)`, `Bash(sed -n:*)` | Read files and logs, including files under `~/github/Tools/vscode-server/data` that the Read tool would prompt for |
| `Bash(date:*)` | Timestamps for `STATUS.md` notes and the tracker |

### Considered and not added

| Rule | Reason |
|---|---|
| `Bash(node scripts/*)` | Already allowed; it covers every gate the plan adds as `node scripts/<name>.mjs` (`ui-harness.mjs`, `crop-png.mjs`, `contact-sheet.mjs`, `serve-artboards.mjs`, `check-readme.mjs`, `check-changelog.mjs`, `render-hero.mjs`, `browser-loop.mjs`) |
| `Bash(gh run download:*)` | Already covered by `Bash(gh run:*)` |
| `Bash(node --test:*)` | Already allowed; it runs the guard's tests |
| `Bash(for i in:*)` | A shell loop cannot be matched by a prefix rule. The gotcha's flake loop ("run it a few dozen times") goes through `node scripts/repeat.mjs <n> -- <command>`, which P0 adds and `Bash(node scripts/*)` covers |
| `Bash(python3 -m http.server:*)` | Artboards are served by `node scripts/serve-artboards.mjs`, which replaces the Python server the planning session's export proof used; the brief routes every new tool through `scripts/` |
| `curl`, `lsof`, `rm`, `cp` | The browser loop's readiness gate, stop command and fixture copy go through `node scripts/browser-loop.mjs`; until that script exists they go to the Auto-mode classifier |
| `Bash(git worktree remove:*)` | Deletes a directory; left to the classifier |

### Caveats

- `Bash(gh api:*)` cannot be limited to GET by a permission rule: rules match a command prefix, and a method flag can
  come anywhere. P0's hook item makes the guard deny `gh api` with a method other than GET, with `-f`/`-F`/`--field`
  fields unless `-X GET` is given, and with `--input`. Between applying this patch and that item, a session could
  send a write through `gh api`; prefer a `node scripts/` wrapper for any read one exists for.
- `cat`, `head`, `tail` and `sed -n` are allowed as prefixes, so a redirection after them is allowed too. The guard
  denies a redirection into the four settings files, not into other paths (frozen contract paths included): sessions
  write files with the Write and Edit tools, which the guard checks.
- `Bash(code-server *)` matches a command that starts with `code-server`. In a compound command each part is checked
  on its own.
- Claude Code reads the settings when a session starts: apply the patch before starting the session that needs it.
- `patches/` is a new top-level directory: the commit that adds it also adds `patches/**` to `.vscodeignore`,
  or `npm run check:vsix` fails on the two files.

### New file `.claude/launch.json`

One entry, `nuiget-web`: a URL-only configuration that attaches the browser pane (`preview_start` with name
`nuiget-web`) to a VS Code server the session started itself with `code-server … --host 127.0.0.1 --port 8000`. The
URL is an origin only, as the desktop app requires; the fixture folder comes from the server's `--default-folder`.
`autoVerify` is off because the pane shows a server, not a page this repository builds.
