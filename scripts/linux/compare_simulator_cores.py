#!/usr/bin/env python3
"""Compare the migration fixture against Rust and the frozen Dart migration reference."""
import json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
fixture=root/'packages/simulator-core/tests/migration_sequence.json'
rust=subprocess.check_output(['cargo','run','--quiet','--manifest-path',str(root/'packages/simulator-core/Cargo.toml'),'--example','sequence','--',str(fixture)],text=True)
a=[json.loads(line) for line in rust.splitlines() if line.startswith('{')]
expected=json.loads((fixture.parent/'migration_expected.json').read_text())
assert a==expected,'Rust behavior differs from the captured Dart migration reference'
print(f'PASS: {len(a)} shared inputs match the verified Dart migration reference (control, cards, sensors, faults, countdown, results)')
