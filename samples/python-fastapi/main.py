import os
import sys

# Simulation fallback entry for Python
print(f"[Python Service] Starting FastAPI application on {os.environ.get('HOST', '127.0.0.1')}:{os.environ.get('PORT', '3120')}")
sys.stdout.flush()
