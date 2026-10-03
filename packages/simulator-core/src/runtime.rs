//! One owner for commands, physics and durable transitions. Subscribers never drive the clock.
use crate::{
    physical::Physical,
    protocol::{parse_and_verify, ChallengeStore, PublicJwk},
    state::{Event, Inputs, Phase, Simulator, SimulatorConfig},
};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    fs::{File, OpenOptions},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, oneshot, watch};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Lid {
        angle: f64,
    },
    Button {
        pressed: bool,
    },
    Pause {
        paused: bool,
    },
    Step,
    Advance {
        ms: u64,
    },
    Time {
        utc: Option<i64>,
    },
    Faults {
        jammed: bool,
        automatic: bool,
        lid: Option<bool>,
        retracted: Option<bool>,
        extended: Option<bool>,
    },
    Inputs {
        inputs: Inputs,
    },
    Reset {
        confirmation: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: u32,
    pub session_id: String,
    pub sequence: u64,
    pub simulation_ms: u64,
    pub paused: bool,
    pub state: Value,
    pub physical: Value,
    pub mqtt: String,
    pub log_revision: u64,
}
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub id: u64,
    pub simulation_ms: u64,
    pub message: String,
}

pub struct Device {
    pub sim: Simulator,
    pub physical: Physical,
    pub paused: bool,
    pub session: String,
    pub sequence: u64,
    pub mqtt: String,
    pub logs: VecDeque<LogEntry>,
    log_revision: u64,
    checkpoint: u64,
    utc_base_ms: i128,
    utc_origin: u64,
    _lock: Option<File>,
}
impl Device {
    pub fn new(config: SimulatorConfig) -> Result<Self> {
        if config.serial.is_empty()
            || config.serial.len() > 64
            || !config
                .serial
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            bail!("invalid_serial");
        }
        let lock = if let Some(dir) = &config.state_dir {
            std::fs::create_dir_all(dir)?;
            let file = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(dir.join("runtime.lock"))?;
            file.try_lock()
                .context("this data directory is already in use")?;
            Some(file)
        } else {
            None
        };
        let mut sim = Simulator::new(config)?;
        let mut physical = sim.persisted.physical.clone().unwrap_or_default();
        physical.lid_target = physical.lid_angle;
        sim.inputs = physical.inputs();
        // Never trust forced endpoints to complete a recovered automatic motion.
        if physical.automatic && matches!(sim.persisted.phase, Phase::Locking | Phase::Unlocking) {
            sim.inputs.retracted &=
                physical.bolt_position == 0. && physical.retracted_override.is_none();
            sim.inputs.extended &=
                physical.bolt_position == 14. && physical.extended_override.is_none();
        }
        sim.persisted.physical = Some(physical.clone());
        let events = sim.boot();
        let mut device = Self {
            sim,
            physical,
            paused: false,
            session: uuid::Uuid::new_v4().to_string(),
            sequence: 0,
            mqtt: "disconnected".into(),
            logs: VecDeque::new(),
            log_revision: 0,
            checkpoint: 0,
            utc_base_ms: 0,
            utc_origin: 0,
            _lock: lock,
        };
        device.observe(&events);
        match device.sim.persisted.phase {
            Phase::IdleRetracted => {
                device.physical.screen_text = "已退栓".into();
                device.physical.screen_progress = 0;
            }
            Phase::TimedLocked => {
                device.physical.screen_text = "定时锁定".into();
                device.physical.screen_progress = 100;
            }
            Phase::ConstantLocked => {
                device.physical.screen_text = "常锁已锁定".into();
                device.physical.screen_progress = 100;
            }
            Phase::WaitingForTime => {
                device.physical.screen_text = "等待校时".into();
                device.physical.screen_progress = 0;
            }
            _ => {}
        }
        Ok(device)
    }
    fn sync_physical(&mut self) {
        self.sim.persisted.physical = Some(self.physical.clone());
    }
    pub fn observe(&mut self, events: &[Event]) {
        for event in events {
            match event {
                Event::Ui { text, progress, .. } => {
                    self.physical.screen_text = text.clone();
                    self.physical.screen_progress = *progress;
                }
                Event::Motor { target } => {
                    self.physical.motion_origin_position =
                        (target != "stop").then_some(self.physical.bolt_position);
                    if target == "extend" {
                        self.physical.screen_text = "正在伸栓".into();
                        self.physical.screen_progress = 0;
                    }
                    if target == "retract" {
                        self.physical.screen_text = "正在退栓".into();
                        self.physical.screen_progress = 0;
                    }
                    self.log(format!("motor {target}"));
                }
                Event::Result(result) => self.log(serde_json::to_string(result).unwrap()),
                Event::State => {}
            }
        }
        if let Some(code) = &self.sim.persisted.fault_code {
            self.physical.screen_text = code.clone();
            self.physical.screen_progress = 0;
            if code.starts_with("storage_error:") {
                self.physical.lid_target = self.physical.lid_angle;
            }
        }
    }
    pub fn log(&mut self, message: String) {
        self.log_revision += 1;
        self.logs.push_back(LogEntry {
            id: self.log_revision,
            simulation_ms: self.sim.monotonic_ms,
            message,
        });
        if self.logs.len() > 1000 {
            self.logs.pop_front();
        }
    }
    pub fn advance(&mut self, ms: u64) -> Vec<Event> {
        let mut events = Vec::new();
        let mut remaining = ms;
        while remaining > 0 {
            let until_checkpoint = 250u64
                .saturating_sub(self.sim.monotonic_ms.saturating_sub(self.checkpoint))
                .max(1);
            let moving = self.sim.motor_target.is_some()
                || self.physical.lid_angle != self.physical.lid_target;
            let step = remaining
                .min(20)
                .min(if moving { until_checkpoint } else { 20 });
            remaining -= step;
            let lid_was_moving = self.physical.lid_angle != self.physical.lid_target;
            self.physical
                .advance(step, self.sim.motor_target.as_deref());
            let lid_arrived = lid_was_moving && self.physical.lid_angle == self.physical.lid_target;
            self.sync_physical();
            self.sim.now_utc = ((self.utc_base_ms
                + (self.sim.monotonic_ms + step - self.utc_origin) as i128)
                / 1000) as i64;
            // Arrivals must be detected at this simulated time, before evaluating timeout.
            self.sim.monotonic_ms += step;
            let input = self.physical.inputs();
            if input.lid_closed != self.sim.inputs.lid_closed
                || input.retracted != self.sim.inputs.retracted
                || input.extended != self.sim.inputs.extended
            {
                let changes = self.sim.set_inputs(input);
                self.observe(&changes);
                events.extend(changes);
            }
            let changes = self.sim.advance(0);
            self.observe(&changes);
            events.extend(
                changes
                    .into_iter()
                    .filter(|e| !matches!(e, Event::State | Event::Ui { .. })),
            );
            if lid_arrived
                || (self.sim.monotonic_ms - self.checkpoint >= 250
                    && (self.sim.motor_target.is_some()
                        || self.physical.lid_angle != self.physical.lid_target))
            {
                self.sync_physical();
                let changes = self.sim.save_state();
                self.observe(&changes);
                events.extend(changes);
                self.checkpoint = self.sim.monotonic_ms;
            }
        }
        events
    }
    pub fn action(&mut self, action: Action) -> Result<Vec<Event>> {
        let observed = matches!(action, Action::Step | Action::Advance { .. });
        self.sync_physical();
        let events = match action {
            Action::Lid { angle } => {
                if !angle.is_finite() || !(0. ..=105.).contains(&angle) {
                    bail!("lid angle must be 0..105");
                }
                if angle > 0.
                    && (self.physical.bolt_position > 0.
                        || self.sim.persisted.task.is_some()
                        || self.sim.motor_target.is_some())
                {
                    bail!("lid_blocked_by_bolt_or_task");
                }
                self.physical.lid_target = angle;
                self.sync_physical();
                self.sim.save_state()
            }
            Action::Button { pressed } => self.sim.button(pressed),
            Action::Pause { paused } => {
                self.paused = paused;
                vec![]
            }
            Action::Step => {
                if !self.paused {
                    bail!("pause_before_step");
                }
                self.advance(100)
            }
            Action::Advance { ms } => {
                if ms > 3_600_000 {
                    bail!("advance_limit_one_hour");
                }
                self.advance(ms)
            }
            Action::Time { utc } => {
                if let Some(value) = utc {
                    self.utc_base_ms = value as i128 * 1000;
                    self.utc_origin = self.sim.monotonic_ms;
                }
                self.sim
                    .set_time(utc.is_some(), utc.unwrap_or(self.sim.now_utc))
            }
            Action::Faults {
                jammed,
                automatic,
                lid,
                retracted,
                extended,
            } => {
                self.physical.jammed = jammed;
                self.physical.automatic = automatic;
                self.physical.lid_override = lid;
                self.physical.retracted_override = retracted;
                self.physical.extended_override = extended;
                self.sync_physical();
                let mut events = self.sim.set_inputs(self.physical.inputs());
                events.extend(self.sim.save_state());
                events
            }
            Action::Inputs { inputs } => {
                if self.physical.automatic {
                    bail!("manual_input_mode_required");
                }
                self.physical.manual_inputs = inputs;
                self.sync_physical();
                let mut events = self.sim.set_inputs(self.physical.inputs());
                events.extend(self.sim.save_state());
                events
            }
            Action::Reset { confirmation } => {
                if confirmation != self.sim.config.serial {
                    bail!("reset_requires_serial_confirmation");
                }
                let config = self.sim.config.clone();
                let mut fresh = Simulator::new(SimulatorConfig {
                    state_dir: None,
                    ..config.clone()
                })?;
                fresh.config = config;
                self.physical = Physical::default();
                fresh.persisted.physical = Some(self.physical.clone());
                // Keep the directory lock and atomically supersede the existing snapshots.
                fresh.persisted.revision = self.sim.persisted.revision + 2;
                let events = fresh.save_state();
                if fresh.persisted.phase == Phase::Fault {
                    bail!("reset_snapshot_failed");
                }
                self.sim = fresh;
                self.sim.inputs = self.physical.inputs();
                self.utc_origin = 0;
                self.utc_base_ms = 0;
                events
            }
        };
        if !observed {
            self.observe(&events);
        }
        if self
            .sim
            .persisted
            .fault_code
            .as_deref()
            .is_some_and(|s| s.starts_with("storage_error:"))
        {
            self.physical.lid_target = self.physical.lid_angle;
            bail!("{}", self.sim.persisted.fault_code.as_deref().unwrap());
        }
        Ok(events)
    }
    pub fn accept(&mut self, command: &crate::protocol::CommandPayload) -> Vec<Event> {
        self.sync_physical();
        let events = self.sim.accept(command);
        self.observe(&events);
        events
    }
    pub fn snapshot(&mut self) -> Snapshot {
        self.sequence += 1;
        let mut physical = serde_json::to_value(&self.physical).unwrap();
        physical["inputs"] = serde_json::to_value(&self.sim.inputs).unwrap();
        physical["button_pressed"] = json!(self.sim.button_pressed);
        physical["motor_target"] = json!(self.sim.motor_target);
        physical["motion_started_ms"] = json!(self.sim.motion_started_ms);
        Snapshot {
            version: 2,
            session_id: self.session.clone(),
            sequence: self.sequence,
            simulation_ms: self.sim.monotonic_ms,
            paused: self.paused,
            state: self.sim.state_json(),
            physical,
            mqtt: self.mqtt.clone(),
            log_revision: self.log_revision,
        }
    }
}

pub enum Message {
    Action(Action, oneshot::Sender<std::result::Result<(), String>>),
    Connect(
        crate::network::Connection,
        oneshot::Sender<std::result::Result<(), String>>,
    ),
    Disconnect(oneshot::Sender<std::result::Result<(), String>>),
    Network {
        generation: u64,
        event: crate::network::Incoming,
    },
    Snapshot(oneshot::Sender<Snapshot>),
    Logs(oneshot::Sender<Vec<LogEntry>>),
    Shutdown(oneshot::Sender<()>),
}
#[derive(Clone)]
pub struct Runtime {
    pub sender: mpsc::Sender<Message>,
    pub snapshots: watch::Receiver<Snapshot>,
}
impl Runtime {
    pub fn start(mut device: Device) -> Self {
        let (sender, receiver) = mpsc::channel(128);
        let (display, snapshots) = watch::channel(device.snapshot());
        tokio::spawn(run(device, receiver, sender.clone(), display));
        Self { sender, snapshots }
    }
    pub async fn action(&self, action: Action) -> std::result::Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Message::Action(action, tx))
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }
    pub async fn connect(
        &self,
        config: crate::network::Connection,
    ) -> std::result::Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Message::Connect(config, tx))
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }
    pub async fn disconnect(&self) -> std::result::Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Message::Disconnect(tx))
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }
    pub async fn snapshot(&self) -> Result<Snapshot> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Message::Snapshot(tx))
            .await
            .map_err(|e| anyhow::anyhow!(e.to_string()))?;
        Ok(rx.await?)
    }
    pub async fn logs(&self) -> Vec<LogEntry> {
        let (tx, rx) = oneshot::channel();
        if self.sender.send(Message::Logs(tx)).await.is_err() {
            return vec![];
        }
        rx.await.unwrap_or_default()
    }
    pub async fn shutdown(&self) {
        let (tx, rx) = oneshot::channel();
        if self.sender.send(Message::Shutdown(tx)).await.is_ok() {
            let _ = rx.await;
        }
    }
}
async fn run(
    mut device: Device,
    mut queue: mpsc::Receiver<Message>,
    sender: mpsc::Sender<Message>,
    display: watch::Sender<Snapshot>,
) {
    use crate::network::{Incoming, Outgoing};
    let mut clock = tokio::time::interval(std::time::Duration::from_millis(10));
    clock.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last = Instant::now();
    let mut rendered = last;
    let mut published = last;
    let mut challenges = ChallengeStore::default();
    let mut public: Option<PublicJwk> = None;
    let mut network: Option<crate::network::Network> = None;
    let mut generation = 0;
    let mut last_control = control_signature(&device);
    loop {
        let mut events = vec![];
        tokio::select! {
            _ = clock.tick() => {
                let elapsed = last.elapsed().as_millis().min(u64::MAX as u128) as u64;
                last += std::time::Duration::from_millis(elapsed);
                if !device.paused { events = device.advance(elapsed); }
            }
            message = queue.recv() => match message {
                Some(Message::Action(action, reply)) => {
                    // Attribute elapsed time to the mode that was active before this operation.
                    let elapsed = last.elapsed().as_millis() as u64; last += std::time::Duration::from_millis(elapsed);
                    if !device.paused { events.extend(device.advance(elapsed)); }
                    let result = device.action(action).map(|e| events.extend(e)).map_err(|e|e.to_string());
                    let _ = reply.send(result);
                }
                Some(Message::Connect(config, reply)) => {
                    if config.serial != device.sim.config.serial { let _=reply.send(Err("serial_requires_restart".into())); continue; }
                    if let Err(error) = config.validate() { let _=reply.send(Err(error.to_string())); continue; }
                    if let Some(old) = network.take() { tokio::spawn(old.stop()); }
                    generation += 1; public = Some(config.public_jwk.clone()); challenges = ChallengeStore::default();
                    network = Some(crate::network::start(config, generation, sender.clone())); device.mqtt="connecting".into();
                    let _=reply.send(Ok(()));
                }
                Some(Message::Disconnect(reply)) => {
                    if let Some(old)=network.take() { tokio::spawn(old.stop()); } generation+=1; device.mqtt="disconnected".into();
                    let _=reply.send(Ok(()));
                }
                Some(Message::Network { generation: epoch, event }) if epoch==generation => match event {
                    Incoming::Status(status) => { device.log(format!("MQTT {status}")); device.mqtt=status; published=Instant::now()-std::time::Duration::from_secs(5); }
                    Incoming::Challenge(payload) => {
                        let request=serde_json::from_slice::<Value>(&payload).ok().and_then(|v|v["request_id"].as_str().map(str::to_owned));
                        let response=challenges.issue_for(request, device.sim.monotonic_ms);
                        if let Some(n)=&network { n.send(Outgoing::Challenge(serde_json::to_vec(&response).unwrap())); }
                    }
                    Incoming::Command(payload) => {
                        if let Some(key)=&public {
                            match parse_and_verify(&payload, &device.sim.config.serial, key, &mut challenges, device.sim.monotonic_ms) {
                                Ok(command) => events=device.accept(&command),
                                Err(error) => if let Some(n)=&network { n.send(Outgoing::Result(serde_json::to_vec(&json!({"device_serial":device.sim.config.serial,"phase":"rejected","ok":false,"code":error.to_string()})).unwrap())); }
                            }
                        }
                    }
                },
                Some(Message::Network { .. }) => {},
                Some(Message::Snapshot(reply)) => { let _=reply.send(device.snapshot()); },
                Some(Message::Logs(reply)) => { let _=reply.send(device.logs.iter().cloned().collect()); },
                Some(Message::Shutdown(reply)) => {
                    let _=device.action(Action::Button { pressed:false });
                    if let Some(old)=network.take() { old.stop().await; }
                    let _=reply.send(()); break;
                }
                None => break,
            }
        }
        let next_control = control_signature(&device);
        let state_changed = next_control != last_control;
        let control_changed = events
            .iter()
            .any(|e| matches!(e, Event::Result(_) | Event::Motor { .. }));
        if let Some(n) = &network {
            for event in &events {
                if let Event::Result(result) = event {
                    n.send(Outgoing::Result(serde_json::to_vec(result).unwrap()));
                }
            }
            let countdown =
                device.sim.persisted.task.is_some() || device.sim.persisted.pending.is_some();
            if control_changed
                || state_changed
                || published.elapsed()
                    >= std::time::Duration::from_secs(if countdown { 1 } else { 5 })
            {
                n.state
                    .send_replace(serde_json::to_vec(&device.sim.state_json()).unwrap());
                published = Instant::now();
            }
        }
        last_control = next_control;
        if rendered.elapsed() >= std::time::Duration::from_millis(34) {
            display.send_replace(device.snapshot());
            rendered = Instant::now();
        }
    }
}
pub fn utc_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn control_signature(device: &Device) -> Value {
    let state = &device.sim.persisted;
    json!({"phase":state.phase,"inputs":device.sim.inputs,"task":state.task,
           "reservation":state.reservation,"remaining_cards":state.emergency_remaining,
           "pending_operation":state.pending.as_ref().map(|p|&p.operation_id),
           "operation":state.last_operation_id,"fault":state.fault_code,
           "calibrated":device.sim.time_calibrated})
}
