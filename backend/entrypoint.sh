#!/bin/sh
set -e

echo "▶ Starting HRHub API..."
exec node dist/index.js
