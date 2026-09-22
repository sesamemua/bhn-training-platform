#!/bin/zsh
# Connects the admin Dashboard's biohubnet.ca card to Google Analytics.
#
#   scripts/connect-google-analytics.sh <service-account-key.json> <GA4 property ID>
#
# Stores the key (as a sensitive variable) and the property ID in Vercel
# production for bhn-training-platform, then redeploys production so the
# Dashboard starts reading biohubnet.ca traffic. The key goes from the file
# straight into Vercel and is never printed.
set -euo pipefail
cd "${0:A:h}/.."

key="${1:-}"
property="${2:-}"
if [[ ! -f "$key" ]]; then
  echo "Give the path to the service account's JSON key, e.g. ~/Downloads/bhn-dashboard-123abc.json"
  exit 1
fi
case "$property" in
  ''|*[!0-9]*) echo "The property ID is a number — Google Analytics → Admin → Property details."; exit 1 ;;
esac
email=$(python3 -c 'import json, sys
d = json.load(open(sys.argv[1]))
assert d.get("type") == "service_account" and d.get("private_key")
print(d["client_email"])' "$key" 2>/dev/null) || { echo "That file isn't a Google service account key."; exit 1; }

export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

vercel env add GA4_SERVICE_ACCOUNT_JSON production --sensitive --force < "$key"
vercel env add GA4_PROPERTY_ID production --force --value "$property"
vercel redeploy https://bhn-training-platform.vercel.app --target production

echo
echo "Connected. If you haven't yet, add $email as a Viewer in"
echo "Google Analytics → Admin → Property access management — the Dashboard can't read the site until you do."
