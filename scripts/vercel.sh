#!/usr/bin/env bash
# Run the Vercel CLI pinned to the account that actually owns this project.
#
#   npm run vercel -- ls
#   npm run vercel -- env ls
#   npm run vercel -- inspect <url>
#
# WHY THIS EXISTS
#
# This repo's Vercel project lives under sonicot-7530s-projects. A second
# Vercel account (biohubnet) is also signed in on this machine, and the CLI
# keeps its selected team GLOBALLY in
# ~/Library/Application Support/com.vercel.cli/config.json — not per-repo.
# So `vercel` in this directory follows whichever team was last selected
# anywhere, regardless of .vercel/project.json.
#
# The failure that matters is not a confusing error. It is `vercel deploy`
# run while the wrong team is selected: rather than refusing, the CLI offers
# to create a NEW project under that team, and a stray copy of the platform
# ends up on the wrong account.
#
# This wrapper makes that impossible: every command is forced to --scope the
# owning team, and it refuses to run at all if the local link has drifted.
set -euo pipefail

# The team that owns bhn-training-platform. Both are checked: the slug is
# what --scope needs, the id is what .vercel/project.json stores.
EXPECTED_SLUG="sonicot-7530s-projects"
EXPECTED_ORG_ID="team_FfT9KsknY7Ciko3wi1xgxPhB"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK="$REPO_ROOT/.vercel/project.json"

if [[ ! -f "$LINK" ]]; then
  cat >&2 <<EOF
✗ .vercel/project.json is missing.

  Do NOT run 'vercel link' or 'vercel deploy' to recreate it — with the wrong
  team selected that creates a new project on the wrong account. Restore the
  file, or re-link explicitly:

      vercel link --scope $EXPECTED_SLUG --project bhn-training-platform
EOF
  exit 1
fi

ACTUAL_ORG_ID="$(node -e "process.stdout.write(require('$LINK').orgId ?? '')")"
if [[ "$ACTUAL_ORG_ID" != "$EXPECTED_ORG_ID" ]]; then
  cat >&2 <<EOF
✗ This checkout is linked to the wrong Vercel team.

    expected  $EXPECTED_ORG_ID  ($EXPECTED_SLUG)
    found     $ACTUAL_ORG_ID

  Refusing to run. Fix .vercel/project.json before continuing.
EOF
  exit 1
fi

# --scope overrides the CLI's globally-selected team for this invocation, so
# the command runs against the owning account even when biohubnet is current.
# Not exec'd: a scope failure is the *safe* outcome and deserves an
# explanation rather than a bare "scope does not exist".
set +e
npx vercel --scope "$EXPECTED_SLUG" "$@"
code=$?
set -e

if [[ $code -ne 0 ]]; then
  cat >&2 <<EOF

──────────────────────────────────────────────────────────────────────
If that failed with "scope does not exist" or "Not authorized", the CLI
is not signed in as the account that owns this project. It is NOT a
problem with this repo — .vercel/project.json is correct.

    vercel login sonicot@hotmail.com
    npm run vercel -- whoami

The other Vercel account on this machine (biohubnet) does not own
$EXPECTED_SLUG, so scoping to it fails rather than silently deploying
somewhere unintended. That is the guard working.
──────────────────────────────────────────────────────────────────────
EOF
fi
exit $code
