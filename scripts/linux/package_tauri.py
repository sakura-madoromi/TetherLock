#!/usr/bin/env python3
"""Build the Linux release and .deb installer."""
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[2]
subprocess.run(['npm', 'run', 'tauri', '--', 'build', '--bundles', 'deb'],
               cwd=root / 'apps/simulator', check=True)
