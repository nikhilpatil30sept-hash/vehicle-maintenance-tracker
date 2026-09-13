# Visual regression baselines

`e2e/visual.spec.js` compares screenshots against baseline PNGs committed
under `e2e/visual.spec.js-snapshots/`. Those baselines don't exist yet -
this file is the one-time setup to create them.

## Why they aren't already committed

Playwright's screenshot comparison is sensitive to the exact browser build
(down to the patch revision) and to the host OS's font rendering. The
sandboxed environment this project's CI setup was built in cannot download
a Chromium build matching what CI's `npx playwright install --with-deps
chromium` fetches, and generating baselines on a developer's own Mac/
Windows machine directly (rather than the same Linux environment CI uses)
is a well-known source of false failures from font-substitution
differences alone. Committing guessed or mismatched baselines would just
make this CI job permanently and confusingly red, which is worse than not
having it yet.

## Generating them (one-time, do this locally with Docker)

Run this from `frontend/`, matching the exact `@playwright/test` version
pinned in `package.json`:

```
docker run --rm --network host \
  -v "$(pwd)":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test e2e/visual.spec.js --update-snapshots
```

This runs the real Linux/Chromium build CI uses (Microsoft's official
Playwright image, pinned to the same version as `package.json`), and
writes the baseline PNGs into `e2e/visual.spec.js-snapshots/`. Review them
(open the PNGs - they should look like the real app), then commit that
directory.

## Keeping them in sync

Whenever a change to the sign-in screen or the garage dashboard is
intentional, the CI failure will show a pixel diff. Re-run the same
command above to regenerate and commit the updated baselines - don't hand-
edit or regenerate them by eye on a different OS.
