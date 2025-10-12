#!/bin/bash
set -e

# Inicia a aplicação principal em foreground
exec uvicorn main:app --host 0.0.0.0 --port 5000 --workers 1