#!/bin/sh
# Starts CitrineOS on the host against the local rig (see README.md). Run from the repo root
# after `npm run build`. Extra environment variables are passed through.
cd "$(dirname "$0")/../.." || exit 1
exec env APP_NAME=all APP_ENV=local \
  BOOTSTRAP_CITRINEOS_DATABASE_PORT="${RIG_DB_PORT:-15433}" \
  BOOTSTRAP_CITRINEOS_CONFIG_FILENAME=config.json \
  BOOTSTRAP_CITRINEOS_CONFIG_DIR=test/scripted-charger/.rig \
  BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE=local \
  BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH=. \
  node ./dist/index.js
