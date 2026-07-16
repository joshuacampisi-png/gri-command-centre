#!/usr/bin/env bash
# Point a GoDaddy-managed domain at the Novagen static site.
#
# GoDaddy has NO credentials in this repo/environment by design. Supply an API
# key + secret from https://developer.godaddy.com/keys (Production key), then run.
#
# Usage:
#   export GODADDY_API_KEY=xxxx
#   export GODADDY_API_SECRET=yyyy
#   scripts/set-godaddy-dns.sh novagenaustralia.com.au [pages|railway] [target]
#
#   pages   (default) -> GitHub Pages A/AAAA on apex + www CNAME to <user>.github.io
#   railway <target>  -> apex + www CNAME to the Railway-provided hostname
#
set -euo pipefail

DOMAIN="${1:?domain required, e.g. novagenaustralia.com.au}"
MODE="${2:-pages}"
TARGET="${3:-joshuacampisi-png.github.io}"   # GitHub Pages CNAME target for this repo owner
API="https://api.godaddy.com/v1/domains/${DOMAIN}/records"
: "${GODADDY_API_KEY:?set GODADDY_API_KEY}"
: "${GODADDY_API_SECRET:?set GODADDY_API_SECRET}"
AUTH="Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}"

put() { # type name json-array
  echo "→ PUT ${1}/${2}: ${3}"
  curl -fsS -X PUT "${API}/${1}/${2}" \
    -H "${AUTH}" -H "Content-Type: application/json" \
    -d "${3}" && echo "  ok"
}

if [ "${MODE}" = "pages" ]; then
  # GitHub Pages apex A + AAAA records
  put A "@" '[{"data":"185.199.108.153","ttl":600},{"data":"185.199.109.153","ttl":600},{"data":"185.199.110.153","ttl":600},{"data":"185.199.111.153","ttl":600}]'
  put AAAA "@" '[{"data":"2606:50c0:8000::153","ttl":600},{"data":"2606:50c0:8001::153","ttl":600},{"data":"2606:50c0:8002::153","ttl":600},{"data":"2606:50c0:8003::153","ttl":600}]'
  put CNAME "www" "[{\"data\":\"${TARGET}.\",\"ttl\":600}]"
else
  # Railway (or any single-host CNAME target)
  put CNAME "www" "[{\"data\":\"${TARGET}.\",\"ttl\":600}]"
  put CNAME "@"   "[{\"data\":\"${TARGET}.\",\"ttl\":600}]"   # GoDaddy supports CNAME flattening on apex
fi

echo "Done. Verify: dig ${DOMAIN} +short"
