//! Emits normalized control/results for the shared Dart migration input fixture.
use serde_json::{json, Value};
use tetherlock_simulator::{
    protocol::CommandPayload,
    runtime::{Action, Device},
    state::{Event, Mode, SimulatorConfig},
};
fn main() -> anyhow::Result<()> {
    let fixture: Vec<Value> = serde_json::from_slice(&std::fs::read(
        std::env::args().nth(1).expect("fixture path"),
    )?)?;
    let mut d = Device::new(SimulatorConfig {
        serial: "SIM-001".into(),
        mode: Mode::Simulated,
        initial_cards: 3,
        state_dir: None,
    })?;
    for (index, entry) in fixture.into_iter().enumerate() {
        let events = if entry["type"] == "command" {
            d.accept(&serde_json::from_value::<CommandPayload>(
                entry["command"].clone(),
            )?)
        } else {
            d.action(serde_json::from_value::<Action>(entry)?)?
        };
        let state = d.sim.state_json();
        let results:Vec<_>=events.iter().filter_map(|e|if let Event::Result(r)=e {Some(json!({"operation_id":r.operation_id,"phase":r.phase,"ok":r.ok,"code":r.code}))}else{None}).collect();
        println!(
            "{}",
            json!({"index":index,"phase":state["control_state"],"cards":state["emergency"],"fault":state["fault_code"],"inputs":state["inputs"],"remaining":state["remaining_seconds"],"results":results})
        );
    }
    Ok(())
}
