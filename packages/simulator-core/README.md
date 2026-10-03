# TetherLock Rust library / CLI

`src/lib.rs` exports the existing canonical JSON, P-256 signature validation,
challenge store and controller, plus physics, runtime and MQTT modules. The
Tauri application and CLI use the same in-process Tokio actor. MQTT polling and
reconnection run separately from the clock; subscriber failure cannot stop the
controller. Physics uses real `Instant` elapsed time and steps at most 20 ms.

```sh
cargo test --manifest-path packages/simulator-core/Cargo.toml
cargo run --manifest-path packages/simulator-core/Cargo.toml -- \
  --serial SIM-001 --public-jwk /path/to/public.json --broker-host 127.0.0.1
```

Only public EC P-256 JWKs are accepted. The simulator no longer creates or
writes private keys. Configure the matching identity in the Flutter APP.
`--tls`, `--username`, `--password`, `--namespace`, `--broker-port`,
`--initial-cards`, `--state-dir` and `--paused` are available. Prefer the GUI's
Secret Service credentials for ordinary desktop use. `--scenario` displays a
local snapshot without connecting to MQTT.

The default CLI data directory is
`${XDG_DATA_HOME:-~/.local/share}/tetherlock-rust-v2/<serial>/`.
The new `rust-v2.*.json` schema is independent of the previous
`./.tetherlock-simulator/state.*.json` and Dart snapshot directories. Old files
are neither loaded nor overwritten. Two checksummed snapshots, file locking,
atomic replacement and fsync protect transitions and 250 ms motion checkpoints.
Corrupt pairs enter fault with zero emergency cards. Restart stops motion and
clears confirmation/challenges, preserving tasks, card reservations and physics.

Stdin commands:

```text
lid 0                    # close in 0.6 seconds; lid 105 opens
button down
button up
pause on                 # pause off resumes
step                     # 100 ms, requires paused runtime
advance 10000            # at most one hour; resolves intermediate transitions
time 1700000000          # time off removes calibration
jam on                   # jam off does not retry the faulted operation
automatic off
inputs 1 1 0             # manual lid/retracted/extended inputs
show                     # one complete display snapshot JSON line
logs
reset SIM-001            # explicitly confirm the serial
quit
```

MQTT v1 topics and signed messages remain compatible with the APP: QoS 1,
retained state and availability, offline last will, P-256 low-S signatures,
4 KiB control limit, single-use 60-second challenges (capacity eight). Reconnect
backoff is 1/2/4/8/16/30 seconds. Offline timers and local physics continue;
paused heartbeats do not change durable revisions. Control changes publish
immediately, countdowns every second and static state every five seconds.

Emergency cards are reserved by task and operation, then consumed only after
successful physical retraction and a durable completion. Snapshot failure stops
motion, rolls back the durable transaction and suppresses accepted/success
results. UTC corrections preserve established monotonic task deadlines.

`tests/migration_sequence.json` and `migration_expected.json` capture a shared
26-step Dart/Rust reference trace, excluding session IDs and storage revisions.
`scripts/linux/compare_simulator_cores.py` can rerun both implementations.
