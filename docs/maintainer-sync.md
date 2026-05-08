# Updating from upstream OpenCode

GitLab has no equivalent of GitHub's "Sync fork" button for cross-host upstreams (iibcode lives on RWTH GitLab; opencode upstream lives on GitHub). Sync via the command line.

## First time per clone (one-off)

```bash
git remote add upstream https://github.com/anomalyco/opencode.git    # link to upstream
git remote set-url --push upstream no_push                           # block accidental pushes to upstream
git config merge.ours.driver true                                    # enable the merge=ours driver for our docs
```

The `merge=ours` driver is what `.gitattributes` references when it marks `README.md`, `docs/*.md`, `docs/upstream-readme/**`, and `docs/images/**` as ours-only. Without that driver registered, those paths fall back to a normal merge and conflict on every upstream pull.

## Each sync

```bash
git fetch upstream
git merge upstream/dev          # or rebase, your call
git push origin dev             # publish to GitLab
```

On conflict, the `merge=ours` driver auto-keeps our version of `README.md`, `docs/*.md`, `docs/upstream-readme/`, and `docs/images/`. Other paths conflict normally — resolve and continue.

## Caveats

- **The `merge=ours` rule only fires for paths that already exist.** If upstream adds a brand-new translation file (e.g. `README.cs.md`) it'll appear at the repo root after merge, not in `docs/upstream-readme/`. Move it manually:
  ```bash
  git mv README.cs.md docs/upstream-readme/
  ```

- **The pre-push hook may fail on the symlink trap** (`packages/{app,enterprise}/src/custom-elements.d.ts`). See [troubleshooting.md](troubleshooting.md#git-push-pre-push-hook-fails-on-packagesappenterprisesrccustom-elementsdts) for the persistent fix or the `--no-verify` bypass.

- **Don't push to `upstream`** — that's `anomalyco/opencode` (read-only for us). Pushes go to `origin` (GitLab) only.
