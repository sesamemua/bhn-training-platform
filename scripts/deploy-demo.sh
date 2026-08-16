#!/usr/bin/env bash
# Deploy the DEMO deployment (Vercel project "bhn-demo", personal team) from
# a scratch clone of this repo's HEAD.
#
#   npm run deploy:demo
#
# Why a scratch clone: this checkout's .vercel/ must stay linked to the
# production project, and scripts/vercel.sh guards that link. The demo is a
# separate Vercel project fed by the same code.
#
# Why the cron patch: the demo needs a nightly /api/demo/reset cron, but
# main's vercel.json already carries production's two cron jobs — the Hobby
# plan cap — so a third entry committed to main would fail every production
# deploy. The demo-only cron therefore lives here, applied to the clone
# just before deploying.
#
# Requirements: vercel CLI logged in as the personal account (sonicot-7530),
# which also implies the demo env vars (DATABASE_URL → bhn_demo, CRON_SECRET,
# NEXT_PUBLIC_DEMO_MODE=true, …) are already set on the bhn-demo project.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCOPE="sonicot-7530s-projects"
PROJECT="bhn-demo"
WORK="$(mktemp -d /tmp/bhn-demo-deploy.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

WHO="$(npx vercel whoami 2>/dev/null | tail -1 || true)"
if [ "$WHO" != "sonicot-7530" ]; then
  echo "Refusing: vercel CLI is logged in as '${WHO:-nobody}', expected sonicot-7530." >&2
  echo "The demo must never deploy through the BioHubNet Vercel account." >&2
  exit 1
fi

echo "── cloning HEAD into $WORK"
git clone -q "$REPO_ROOT" "$WORK/app"
cd "$WORK/app"

echo "── linking to $PROJECT ($SCOPE)"
npx vercel link --yes --project "$PROJECT" --scope "$SCOPE" > /dev/null

echo "── patching vercel.json with the demo reset cron"
python3 - <<'PY'
import json
cfg = json.load(open("vercel.json"))
crons = [c for c in cfg.get("crons", []) if c["path"] != "/api/demo/reset"]
crons.append({"path": "/api/demo/reset", "schedule": "0 9 * * *"})
cfg["crons"] = crons
json.dump(cfg, open("vercel.json", "w"), indent=2)
print("   crons:", ", ".join(c["path"] for c in crons))
PY

echo "── deploying"
npx vercel deploy --prod --yes
