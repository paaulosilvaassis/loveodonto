#!/bin/bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto || exit 2
set -a
# shellcheck disable=SC1091
source .env.local
set +a
node scripts/security/verify038ClinicLogosHttpProbes.mjs > /tmp/security02c_http_stdout.json 2> /tmp/security02c_http_stderr.txt
echo EXIT:$? > /tmp/security02c_http_exit.txt
