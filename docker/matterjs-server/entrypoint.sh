#!/bin/bash
set -e

exec node --enable-source-maps /app/node_modules/matter-server/dist/esm/MatterServer.js --log-level "${LOG_LEVEL}" "$@"
