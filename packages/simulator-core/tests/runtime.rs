use serde_json::json;
use tetherlock_simulator::{
    protocol::{CommandPayload, Operation},
    runtime::{Action, Device, Runtime},
    state::{Mode, Phase, SimulatorConfig},
};
fn device(dir: Option<std::path::PathBuf>) -> Device {
    Device::new(SimulatorConfig {
        serial: "TEST".into(),
        mode: Mode::Simulated,
        initial_cards: 3,
        state_dir: dir,
    })
    .unwrap()
}
fn close(d: &mut Device) {
    d.action(Action::Time {
        utc: Some(1700000000),
    })
    .unwrap();
    d.action(Action::Lid { angle: 0. }).unwrap();
    d.advance(600);
}
fn command(id: &str, operation: Operation, args: serde_json::Value) -> CommandPayload {
    CommandPayload {
        command_id: id.into(),
        device_serial: "TEST".into(),
        protocol_version: 1,
        challenge: "test".into(),
        operation,
        arguments: args,
    }
}
fn timed(d: &mut Device) {
    let utc = d.sim.now_utc;
    d.accept(&command(
        "lock",
        Operation::StartTimedLock,
        json!({"task_id":"task","deadline_utc":utc+100}),
    ));
}
#[test]
fn automatic_motion_and_expiry_during_fast_forward() {
    let mut d = device(None);
    close(&mut d);
    timed(&mut d);
    d.advance(2000);
    assert_eq!(d.physical.bolt_position, 14.);
    assert_eq!(d.sim.persisted.phase, Phase::TimedLocked);
    d.advance(100000);
    assert_eq!(d.physical.bolt_position, 0.);
    assert_eq!(d.sim.persisted.phase, Phase::IdleRetracted);
}
#[test]
fn full_lid_and_bolt_travel_have_exact_duration() {
    let mut d = device(None);
    d.action(Action::Lid { angle: 0. }).unwrap();
    d.advance(300);
    assert_eq!(d.physical.lid_angle, 52.5);
    d.advance(300);
    assert_eq!(d.physical.lid_angle, 0.);
    d.action(Action::Time {
        utc: Some(1700000000),
    })
    .unwrap();
    timed(&mut d);
    d.advance(1000);
    assert!((d.physical.bolt_position - 7.).abs() < 1e-8);
    assert_eq!(d.sim.persisted.phase, Phase::Locking);
    d.advance(1000);
    assert_eq!(d.sim.persisted.phase, Phase::TimedLocked);
}
#[test]
fn emergency_jam_retry_spends_only_after_physical_retraction() {
    let mut d = device(None);
    close(&mut d);
    timed(&mut d);
    d.advance(2000);
    d.accept(&command(
        "emergency",
        Operation::EmergencyUnlock,
        json!({"task_id":"task","transaction_id":"tx"}),
    ));
    d.advance(500);
    d.physical.jammed = true;
    d.advance(15000);
    assert_eq!(d.sim.persisted.phase, Phase::Fault);
    assert_eq!(d.sim.persisted.emergency_remaining, 3);
    assert!(d.sim.persisted.reservation.is_some());
    d.physical.jammed = false;
    d.accept(&command(
        "retry",
        Operation::RetryOperation,
        json!({"task_id":"task","operation_id":"emergency"}),
    ));
    d.advance(2000);
    assert_eq!(d.sim.persisted.emergency_remaining, 2);
    d.accept(&command(
        "retry",
        Operation::RetryOperation,
        json!({"task_id":"task","operation_id":"emergency"}),
    ));
    assert_eq!(d.sim.persisted.emergency_remaining, 2);
}
#[test]
fn restart_preserves_physics_and_stops_unknown_motion() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut d = device(Some(dir.path().into()));
        close(&mut d);
        timed(&mut d);
        d.advance(500);
    }
    let d = device(Some(dir.path().into()));
    assert_eq!(d.sim.persisted.phase, Phase::Fault);
    assert_eq!(
        d.sim.persisted.fault_code.as_deref(),
        Some("position_unknown_after_restart")
    );
    assert!(d.sim.motor_target.is_none());
    assert!((1.75..=3.5 + 1e-8).contains(&d.physical.bolt_position));
    assert_eq!(d.sim.persisted.emergency_remaining, 3);
}
#[test]
fn directory_lock_and_independent_instances() {
    let dir = tempfile::tempdir().unwrap();
    let d = device(Some(dir.path().into()));
    assert!(Device::new(d.sim.config.clone()).is_err());
    let other = tempfile::tempdir().unwrap();
    let _independent = device(Some(other.path().into()));
    drop(d);
    let _restart = device(Some(dir.path().into()));
}
#[test]
fn corrupted_pair_never_refills_cards_and_reset_requires_serial() {
    let dir = tempfile::tempdir().unwrap();
    for slot in 0..2 {
        std::fs::write(dir.path().join(format!("rust-v2.{slot}.json")), b"bad").unwrap();
    }
    let mut d = device(Some(dir.path().into()));
    assert_eq!(d.sim.persisted.emergency_remaining, 0);
    assert_eq!(d.sim.persisted.phase, Phase::Fault);
    assert!(d
        .action(Action::Reset {
            confirmation: "yes".into()
        })
        .is_err());
    d.action(Action::Reset {
        confirmation: "TEST".into(),
    })
    .unwrap();
    assert_eq!(d.sim.persisted.emergency_remaining, 3);
}
#[test]
fn legacy_snapshots_are_not_read() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("state.0.json"), b"legacy").unwrap();
    let d = device(Some(dir.path().into()));
    assert_eq!(d.sim.persisted.emergency_remaining, 3);
    assert_eq!(
        std::fs::read(dir.path().join("state.0.json")).unwrap(),
        b"legacy"
    );
}
#[test]
fn failed_final_commit_retains_reservation_and_no_success() {
    let dir = tempfile::tempdir().unwrap();
    let mut d = device(Some(dir.path().into()));
    close(&mut d);
    timed(&mut d);
    d.advance(2000);
    d.accept(&command(
        "emergency",
        Operation::EmergencyUnlock,
        json!({"task_id":"task","transaction_id":"tx"}),
    ));
    d.advance(1980);
    let revision = d.sim.persisted.revision;
    let next = dir
        .path()
        .join(format!("rust-v2.{}.tmp", (revision + 1) % 2));
    std::fs::create_dir(&next).unwrap();
    let events = d.advance(20);
    assert_eq!(d.sim.persisted.emergency_remaining, 3);
    assert!(d.sim.persisted.reservation.is_some());
    assert!(d.sim.motor_target.is_none());
    assert_eq!(d.sim.persisted.phase, Phase::Fault);
    assert!(!events.iter().any(
        |e| matches!(e,tetherlock_simulator::state::Event::Result(r) if r.phase=="succeeded")
    ));
}
#[test]
fn repeated_button_press_does_not_restart_hold_and_release_clears() {
    let mut d = device(None);
    close(&mut d);
    d.accept(&command(
        "constant",
        Operation::StartConstantLock,
        json!({"task_id":"task"}),
    ));
    d.action(Action::Button { pressed: true }).unwrap();
    d.advance(5000);
    d.action(Action::Button { pressed: true }).unwrap();
    d.advance(5000);
    assert_eq!(d.sim.persisted.phase, Phase::Locking);
}
#[tokio::test]
async fn pause_freezes_time_even_without_subscriber_and_step_moves_100ms() {
    let mut d = device(None);
    d.paused = true;
    let r = Runtime::start(d);
    let initial = r.snapshot().await.unwrap().simulation_ms;
    tokio::time::sleep(std::time::Duration::from_millis(130)).await;
    assert_eq!(r.snapshot().await.unwrap().simulation_ms, initial);
    r.action(Action::Step).await.unwrap();
    assert_eq!(r.snapshot().await.unwrap().simulation_ms, initial + 100);
    r.shutdown().await;
}

#[test]
fn same_inputs_match_dart_migration_reference() {
    let input: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("migration_sequence.json")).unwrap();
    let expected: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("migration_expected.json")).unwrap();
    let mut d = Device::new(SimulatorConfig {
        serial: "SIM-001".into(),
        mode: Mode::Simulated,
        initial_cards: 3,
        state_dir: None,
    })
    .unwrap();
    for (index, (entry, reference)) in input.into_iter().zip(expected).enumerate() {
        let events = if entry["type"] == "command" {
            d.accept(&serde_json::from_value::<CommandPayload>(entry["command"].clone()).unwrap())
        } else {
            d.action(serde_json::from_value::<Action>(entry).unwrap())
                .unwrap()
        };
        let state = d.sim.state_json();
        let results:Vec<_>=events.iter().filter_map(|e|if let tetherlock_simulator::state::Event::Result(r)=e {Some(json!({"operation_id":r.operation_id,"phase":r.phase,"ok":r.ok,"code":r.code}))}else{None}).collect();
        assert_eq!(
            json!({"index":index,"phase":state["control_state"],"cards":state["emergency"],"fault":state["fault_code"],"inputs":state["inputs"],"remaining":state["remaining_seconds"],"results":results}),
            reference,
            "step {index}"
        );
    }
}

#[test]
fn connection_configuration_never_serializes_password_or_accepts_private_key() {
    use tetherlock_simulator::{network::Connection, protocol::KeyPair};
    let connection = Connection {
        serial: "TEST".into(),
        broker_host: "localhost".into(),
        broker_port: 1883,
        namespace: "tetherlock/v1".into(),
        tls: false,
        username: Some("tester".into()),
        password: Some("credential-must-not-reach-config".into()),
        public_jwk: KeyPair::generate().public_jwk(),
    };
    let encoded = serde_json::to_string(&connection).unwrap();
    assert!(!encoded.contains("password"));
    assert!(!encoded.contains("credential-must-not-reach-config"));
    let mut key = serde_json::to_value(&connection.public_jwk).unwrap();
    key["d"] = json!("private");
    assert!(serde_json::from_value::<tetherlock_simulator::protocol::PublicJwk>(key).is_err());
}
#[test]
fn serial_cannot_escape_the_device_directory() {
    let directory = tempfile::tempdir().unwrap();
    let config = SimulatorConfig {
        serial: "..".into(),
        mode: Mode::Simulated,
        initial_cards: 3,
        state_dir: Some(directory.path().join("..")),
    };
    assert!(Device::new(config).is_err());
}

#[test]
fn restart_stops_lid_motion_at_its_checkpoint() {
    let directory = tempfile::tempdir().unwrap();
    {
        let mut d = device(Some(directory.path().into()));
        d.action(Action::Lid { angle: 0. }).unwrap();
        d.advance(300);
    }
    let mut d = device(Some(directory.path().into()));
    let angle = d.physical.lid_angle;
    assert_eq!(d.physical.lid_target, angle);
    d.advance(1000);
    assert_eq!(d.physical.lid_angle, angle);
}

#[test]
fn completed_lid_endpoint_is_durable_without_a_lock_task() {
    let directory = tempfile::tempdir().unwrap();
    {
        let mut d = device(Some(directory.path().into()));
        d.action(Action::Lid { angle: 0. }).unwrap();
        d.advance(600);
    }
    let d = device(Some(directory.path().into()));
    assert_eq!(d.physical.lid_angle, 0.);
    assert!(d.sim.inputs.lid_closed);
}
#[test]
fn screen_matches_recovered_phase_after_unlock() {
    let directory = tempfile::tempdir().unwrap();
    {
        let mut d = device(Some(directory.path().into()));
        close(&mut d);
        timed(&mut d);
        d.advance(102000);
        assert_eq!(d.sim.persisted.phase, Phase::IdleRetracted);
    }
    let d = device(Some(directory.path().into()));
    assert_eq!(d.sim.persisted.phase, Phase::IdleRetracted);
    assert_eq!(d.physical.screen_text, "已退栓");
}
