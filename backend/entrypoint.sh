#!/bin/sh
set -e

# Start the app in foreground
exec uvicorn main:app --host 0.0.0.0 --port 5000 --workers 1