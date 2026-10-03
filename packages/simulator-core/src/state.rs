use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

use crate::protocol::{CommandPayload, Operation};

const STATE_SCHEMA: u32 = 2;
const CONFIRMATION_MS: u64 = 10_000;
const CONFIRMATION_TTL_MS: u64 = 60_000;
const MOTION_TIMEOUT_MS: u64 = 15_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Simulated,
    Bench,
    Real,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    BootRecovery,
    WaitingForTime,
    IdleRetracted,
    AwaitingConfirmation,
    Locking,
    TimedLocked,
    ConstantLocked,
    Unlocking,
    Fault,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Inputs {
    pub lid_closed: bool,
    pub retracted: bool,
    pub extended: bool,
}

impl Inputs {
    pub fn contradictory(&self) -> bool {
        self.retracted && self.extended
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub task_id: String,
    pub operation_id: String,
    pub timed: bool,
    pub deadline_utc: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reservation {
    pub transaction_id: String,
    pub operation_id: String,
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingConfirmation {
    pub operation_id: String,
    pub task_id: String,
    pub timed: bool,
    pub deadline_utc: Option<i64>,
    pub entered_ms: u64,
    pub held_started_ms: Option<u64>,
    pub released: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    pub schema: u32,
    pub revision: u64,
    pub phase: Phase,
    pub task: Option<Task>,
    pub reservation: Option<Reservation>,
    pub pending: Option<PendingConfirmation>,
    pub emergency_total: u8,
    pub emergency_remaining: u8,
    pub fault_code: Option<String>,
    pub last_operation_id: Option<String>,
    pub checksum: String,
    #[serde(default)]
    pub physical: Option<crate::physical::Physical>,
}

#[derive(Debug, Clone)]
pub struct SimulatorConfig {
    pub serial: String,
    pub mode: Mode,
    pub initial_cards: u8,
    pub state_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResultMessage {
    pub operation_id: String,
    pub device_serial: String,
    pub phase: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum Event {
    Result(ResultMessage),
    Ui {
        mode: String,
        text: String,
        progress: u8,
    },
    Motor {
        target: String,
    },
    State,
}

pub struct Simulator {
    pub config: SimulatorConfig,
    pub session_id: String,
    pub persisted: PersistedState,
    pub inputs: Inputs,
    pub time_calibrated: bool,
    pub now_utc: i64,
    pub monotonic_ms: u64,
    /// Established after a calibrated UTC reading. It is intentionally
    /// transient: after a process restart the saved absolute deadline is
    /// mapped again only after NTP/time calibration succeeds.
    pub deadline_monotonic_ms: Option<u64>,
    pub motion_started_ms: Option<u64>,
    pub motor_target: Option<String>,
    pub button_pressed: bool,
    /// Set only for the current event when a snapshot cannot be committed.
    /// Callers use it to suppress motion/accepted/succeeded results.
    storage_error: Option<String>,
    durable: PersistedState,
}

impl Simulator {
    pub fn new(config: SimulatorConfig) -> Result<Self> {
        let persisted = if let Some(dir) = &config.state_dir {
            match StateStore::new(dir.clone()).load() {
                Ok(Some(state)) => state,
                Ok(None) => initial_state(config.initial_cards),
                Err(error) => corrupted_state(format!("state_corrupt:{error}")),
            }
        } else {
            initial_state(config.initial_cards)
        };
        Ok(Self {
            config,
            session_id: uuid::Uuid::new_v4().to_string(),
            durable: persisted.clone(),
            persisted,
            inputs: Inputs {
                retracted: true,
                ..Inputs::default()
            },
            time_calibrated: false,
            now_utc: 0,
            monotonic_ms: 0,
            deadline_monotonic_ms: None,
            motion_started_ms: None,
            motor_target: None,
            button_pressed: false,
            storage_error: None,
        })
    }

    pub fn boot(&mut self) -> Vec<Event> {
        let mut events = vec![Event::Motor {
            target: "stop".into(),
        }];
        let recovered_phase = self.persisted.phase;
        self.persisted.pending = None;
        self.button_pressed = false;
        if self.inputs.contradictory() {
            events.extend(self.fault("input_contradiction", None));
        } else if matches!(recovered_phase, Phase::Locking) && self.inputs.extended {
            events.extend(self.complete_lock());
        } else if matches!(recovered_phase, Phase::Unlocking) && self.inputs.retracted {
            events.extend(self.complete_unlock());
        } else if matches!(recovered_phase, Phase::Locking | Phase::Unlocking) {
            events.extend(self.fault("position_unknown_after_restart", None));
        } else if self.persisted.task.as_ref().is_some_and(|task| task.timed)
            && !self.time_calibrated
        {
            self.persisted.phase = Phase::WaitingForTime;
            events.extend(self.save_state());
        } else {
            self.persisted.phase = match recovered_phase {
                // A process restart cannot safely resume a long-press window,
                // because the monotonic origin is new. Drop that pending
                // confirmation and leave the box idle.
                Phase::AwaitingConfirmation => {
                    self.persisted.pending = None;
                    Phase::IdleRetracted
                }
                Phase::BootRecovery => Phase::IdleRetracted,
                phase => phase,
            };
            events.extend(self.save_state());
        }
        events
    }

    pub fn set_time(&mut self, calibrated: bool, utc: i64) -> Vec<Event> {
        self.time_calibrated = calibrated;
        self.now_utc = utc;
        let mut events = Vec::new();
        if calibrated
            && self.deadline_monotonic_ms.is_none()
            && self.persisted.task.as_ref().is_some_and(|task| task.timed)
        {
            self.establish_deadline_mapping();
        }
        if calibrated && self.persisted.phase == Phase::WaitingForTime {
            if self.deadline_reached() {
                events.extend(self.start_unlock(false, "deadline-recovery", None));
            } else if self.persisted.task.is_some() {
                self.persisted.phase =
                    if self.persisted.task.as_ref().is_some_and(|task| task.timed) {
                        Phase::TimedLocked
                    } else {
                        Phase::ConstantLocked
                    };
                events.extend(self.save_state());
            }
        }
        if calibrated && self.persisted.phase == Phase::TimedLocked && self.deadline_reached() {
            events.extend(self.start_unlock(false, "deadline-set-time", None));
        }
        events.push(Event::State);
        events
    }

    pub fn set_inputs(&mut self, inputs: Inputs) -> Vec<Event> {
        self.inputs = inputs;
        let mut events = Vec::new();
        if self.inputs.contradictory() {
            if self.persisted.phase == Phase::AwaitingConfirmation {
                events.extend(self.cancel_confirmation("input_contradiction"));
            } else {
                events.extend(self.fault(
                    "input_contradiction",
                    self.persisted.last_operation_id.clone(),
                ));
            }
        } else if self.persisted.phase == Phase::AwaitingConfirmation && !self.inputs.lid_closed {
            events.extend(self.cancel_confirmation("lid_open"));
        } else if self.persisted.phase == Phase::Locking && !self.inputs.lid_closed {
            events.extend(self.fault("lid_open", self.persisted.last_operation_id.clone()));
        } else if self.persisted.phase == Phase::Locking && self.inputs.extended {
            events.extend(self.complete_lock());
        } else if self.persisted.phase == Phase::Unlocking && self.inputs.retracted {
            events.extend(self.complete_unlock());
        }
        events.push(Event::State);
        events
    }

    pub fn button(&mut self, pressed: bool) -> Vec<Event> {
        self.button_pressed = pressed;
        let mut events = Vec::new();
        let Some(pending) = self.persisted.pending.as_mut() else {
            return events;
        };
        if !pressed {
            pending.released = true;
            pending.held_started_ms = None;
            events.push(Event::Ui {
                mode: "confirmation".into(),
                text: "请长按 10 秒确认".into(),
                progress: 0,
            });
        } else if !pending.released {
            events.push(Event::Ui {
                mode: "confirmation".into(),
                text: "请先松开按钮，再重新长按".into(),
                progress: 0,
            });
        } else {
            pending.held_started_ms.get_or_insert(self.monotonic_ms);
        }
        events.extend(self.save_state());
        events
    }

    pub fn advance(&mut self, elapsed_ms: u64) -> Vec<Event> {
        self.monotonic_ms = self.monotonic_ms.saturating_add(elapsed_ms);
        let mut events = Vec::new();
        let pending_action = self.persisted.pending.as_ref().and_then(|pending| {
            if pending.timed
                && self.time_calibrated
                && pending
                    .deadline_utc
                    .is_some_and(|deadline| self.now_utc >= deadline)
            {
                Some((2u8, 0u8))
            } else if self.monotonic_ms.saturating_sub(pending.entered_ms) >= CONFIRMATION_TTL_MS {
                Some((0u8, 0u8))
            } else if let Some(started) = pending.held_started_ms {
                let elapsed = self.monotonic_ms.saturating_sub(started);
                Some((1u8, ((elapsed * 100) / CONFIRMATION_MS).min(100) as u8))
            } else {
                None
            }
        });
        if let Some((kind, progress)) = pending_action {
            if kind == 2 {
                events.extend(self.cancel_confirmation("deadline_expired"));
            } else if kind == 0 {
                events.extend(self.cancel_confirmation("confirmation_expired"));
            } else {
                events.push(Event::Ui {
                    mode: "confirmation".into(),
                    text: "请长按 10 秒确认".into(),
                    progress,
                });
                if progress >= 100 {
                    events.extend(self.confirm_pending());
                }
            }
        }
        if self.persisted.phase == Phase::Locking && self.deadline_reached() {
            let operation_id = self
                .persisted
                .task
                .as_ref()
                .map(|task| task.operation_id.clone())
                .unwrap_or_else(|| "deadline-locking".into());
            events.extend(self.start_unlock(false, &operation_id, None));
        }
        if matches!(self.persisted.phase, Phase::Locking | Phase::Unlocking)
            && self.motion_started_ms.is_some_and(|started| {
                self.monotonic_ms.saturating_sub(started) >= MOTION_TIMEOUT_MS
            })
        {
            events.extend(self.fault("motion_timeout", self.persisted.last_operation_id.clone()));
        }
        if self.persisted.phase == Phase::TimedLocked && self.deadline_reached() {
            events.extend(self.start_unlock(false, "deadline-expiry", None));
        }
        if self.persisted.phase == Phase::Fault
            && self.persisted.reservation.is_some()
            && self.deadline_reached()
        {
            // A naturally expired task releases the emergency reservation and
            // takes the ordinary expiry path without consuming a card.
            self.persisted.reservation = None;
            events.extend(self.start_unlock(false, "deadline-after-fault", None));
        }
        events.push(Event::State);
        events
    }

    pub fn accept(&mut self, command: &CommandPayload) -> Vec<Event> {
        let mut events = Vec::new();
        let id = command.command_id.clone();
        if command.device_serial != self.config.serial {
            return self.reject(&id, "wrong_device");
        }
        if self.persisted.last_operation_id.as_deref() == Some(id.as_str()) {
            return self.result(&id, "duplicate", true, None);
        }
        if self.persisted.phase == Phase::AwaitingConfirmation {
            return self.reject(&id, "confirmation_pending");
        }
        match command.operation {
            Operation::StartTimedLock | Operation::StartConstantLock => {
                if self.persisted.phase != Phase::IdleRetracted
                    || self.persisted.task.is_some()
                    || self.persisted.reservation.is_some()
                {
                    return self.reject(&id, "busy");
                }
                if !self.inputs.lid_closed || !self.inputs.retracted || self.inputs.contradictory()
                {
                    return self.reject(&id, "lock_conditions_unsatisfied");
                }
                let timed = command.operation == Operation::StartTimedLock;
                let deadline = command
                    .arguments
                    .get("deadline_utc")
                    .and_then(Value::as_i64);
                if timed
                    && (!self.time_calibrated
                        || deadline.is_none()
                        || deadline.is_some_and(|value| value <= self.now_utc))
                {
                    return self.reject(&id, "time_not_ready_or_expired");
                }
                let remaining = deadline.unwrap_or(0).saturating_sub(self.now_utc);
                let needs_confirmation = !timed || remaining > 24 * 60 * 60;
                let task_id = command
                    .arguments
                    .get("task_id")
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
                    .to_owned();
                if needs_confirmation {
                    self.persisted.pending = Some(PendingConfirmation {
                        operation_id: id.clone(),
                        task_id,
                        timed,
                        deadline_utc: deadline,
                        entered_ms: self.monotonic_ms,
                        held_started_ms: None,
                        released: !self.button_pressed,
                    });
                    self.persisted.last_operation_id = Some(id.clone());
                    self.persisted.phase = Phase::AwaitingConfirmation;
                    events.extend(self.save_state());
                    if self.append_storage_failure(&mut events, &id) {
                        return events;
                    }
                    events.push(Event::Ui {
                        mode: "confirmation".into(),
                        text: "请先松开按钮，再长按 10 秒确认".into(),
                        progress: 0,
                    });
                    events.extend(self.result(&id, "waiting_confirmation", true, None));
                    return events;
                }
                events.extend(self.start_lock(&id, &task_id, timed, deadline));
            }
            Operation::UnlockConstant => {
                if self.persisted.phase != Phase::ConstantLocked {
                    return self.reject(&id, "not_constant_locked");
                }
                events.extend(self.start_unlock(false, &id, Some(command)));
            }
            Operation::EmergencyUnlock => {
                if !matches!(
                    self.persisted.phase,
                    Phase::TimedLocked | Phase::Unlocking | Phase::Fault
                ) {
                    return self.reject(&id, "not_timed_locked");
                }
                // A new emergency request cannot restart an already-running
                // unlock.  The original command id remains idempotent through
                // the duplicate check above; a different id must use the
                // explicit retry path after a fault.
                if self.persisted.phase == Phase::Unlocking {
                    return self.reject(&id, "unlock_in_progress");
                }
                if self.persisted.phase == Phase::Fault && self.persisted.reservation.is_none() {
                    return self.reject(&id, "no_retryable_emergency_transaction");
                }
                events.extend(self.start_unlock(true, &id, Some(command)));
            }
            Operation::RetryOperation => {
                if self.persisted.phase != Phase::Fault || self.persisted.task.is_none() {
                    return self.reject(&id, "no_retryable_operation");
                }
                let Some(task_id) = command.arguments.get("task_id").and_then(Value::as_str) else {
                    return self.reject(&id, "task_id_required");
                };
                if self
                    .persisted
                    .task
                    .as_ref()
                    .is_some_and(|task| task.task_id != task_id)
                {
                    return self.reject(&id, "task_mismatch");
                }
                let expected_operation_id = self
                    .persisted
                    .reservation
                    .as_ref()
                    .map(|reservation| reservation.operation_id.as_str())
                    .or(self.persisted.last_operation_id.as_deref())
                    .or_else(|| {
                        self.persisted
                            .task
                            .as_ref()
                            .map(|task| task.operation_id.as_str())
                    });
                let Some(operation_id) = command
                    .arguments
                    .get("operation_id")
                    .and_then(Value::as_str)
                else {
                    return self.reject(&id, "operation_id_required");
                };
                if expected_operation_id != Some(operation_id) {
                    return self.reject(&id, "operation_mismatch");
                }
                if self.persisted.reservation.is_some() {
                    events.extend(self.start_unlock(true, &id, Some(command)));
                } else if self.inputs.extended {
                    self.persisted.phase =
                        if self.persisted.task.as_ref().is_some_and(|task| task.timed) {
                            Phase::TimedLocked
                        } else {
                            Phase::ConstantLocked
                        };
                    events.extend(self.save_state());
                    if self.append_storage_failure(&mut events, &id) {
                        return events;
                    }
                    events.extend(self.result(&id, "recovered", true, None));
                } else if self.inputs.retracted {
                    self.persisted.last_operation_id = Some(id.clone());
                    self.persisted.phase = Phase::Unlocking;
                    events.extend(self.complete_unlock());
                } else {
                    events.extend(self.reject(&id, "position_unknown"));
                }
            }
        }
        events
    }

    pub fn state_json(&self) -> Value {
        json!({
            "serial": self.config.serial,
            "session_id": self.session_id,
            "firmware_version": "tetherlock-simulator/0.2.0",
            "revision": self.persisted.revision,
            "mode": self.config.mode,
            "control_state": self.persisted.phase,
            "time_calibrated": self.time_calibrated,
            "updated_at_utc": self.now_utc,
            "inputs": self.inputs,
            "emergency": {
                "total": self.persisted.emergency_total,
                "remaining": self.persisted.emergency_remaining,
                "reserved": self.persisted.reservation.is_some(),
            },
            "task": self.persisted.task,
            "pending_operation_id": self
                .persisted
                .pending
                .as_ref()
                .map(|pending| pending.operation_id.clone()),
            "pending_task_id": self
                .persisted
                .pending
                .as_ref()
                .map(|pending| pending.task_id.clone()),
            "confirmation_remaining_seconds": self
                .persisted
                .pending
                .as_ref()
                .map(|pending| {
                    CONFIRMATION_TTL_MS
                        .saturating_sub(self.monotonic_ms.saturating_sub(pending.entered_ms))
                        / 1000
                }),
            "remaining_seconds": self
                .persisted
                .task
                .as_ref()
                .and_then(|task| task.deadline_utc)
                .and_then(|deadline| self.remaining_seconds(deadline)),
            "fault_code": self.persisted.fault_code,
            "current_operation_id": self.persisted.last_operation_id,
            "battery": { "known": false },
        })
    }

    pub fn state_store(&self) -> Option<StateStore> {
        self.config.state_dir.clone().map(StateStore::new)
    }

    fn start_lock(
        &mut self,
        operation_id: &str,
        task_id: &str,
        timed: bool,
        deadline: Option<i64>,
    ) -> Vec<Event> {
        self.persisted.pending = None;
        self.persisted.task = Some(Task {
            task_id: task_id.to_owned(),
            operation_id: operation_id.to_owned(),
            timed,
            deadline_utc: deadline,
        });
        self.persisted.last_operation_id = Some(operation_id.to_owned());
        self.persisted.fault_code = None;
        self.persisted.phase = Phase::Locking;
        if timed {
            self.establish_deadline_mapping();
        }
        self.motion_started_ms = Some(self.monotonic_ms);
        let mut events = self.save_state();
        if self.append_storage_failure(&mut events, operation_id) {
            return events;
        }
        self.motor_target = Some("extend".into());
        events.push(Event::Motor {
            target: "extend".into(),
        });
        events.extend(self.result(operation_id, "accepted", true, None));
        events
    }

    fn start_unlock(
        &mut self,
        emergency: bool,
        operation_id: &str,
        command: Option<&CommandPayload>,
    ) -> Vec<Event> {
        let Some(task) = self.persisted.task.clone() else {
            return self.reject(operation_id, "no_active_task");
        };
        if let Some(command) = command {
            let Some(task_id) = command.arguments.get("task_id").and_then(Value::as_str) else {
                return self.reject(operation_id, "task_id_required");
            };
            if task_id != task.task_id {
                return self.reject(operation_id, "task_mismatch");
            }
        }
        let is_emergency_command =
            command.is_some_and(|command| command.operation == Operation::EmergencyUnlock);
        if emergency && self.persisted.reservation.is_none() {
            if self.persisted.emergency_remaining == 0 {
                return self.reject(operation_id, "emergency_cards_exhausted");
            }
            let Some(transaction) = command.and_then(|command| {
                command
                    .arguments
                    .get("transaction_id")
                    .and_then(Value::as_str)
            }) else {
                return self.reject(operation_id, "transaction_id_required");
            };
            self.persisted.reservation = Some(Reservation {
                transaction_id: transaction.to_owned(),
                operation_id: operation_id.to_owned(),
                task_id: task.task_id.clone(),
            });
        } else if emergency && is_emergency_command {
            let Some(command) = command else {
                return self.reject(operation_id, "transaction_id_required");
            };
            let Some(transaction_id) = command
                .arguments
                .get("transaction_id")
                .and_then(Value::as_str)
            else {
                return self.reject(operation_id, "transaction_id_required");
            };
            if self
                .persisted
                .reservation
                .as_ref()
                .is_some_and(|reservation| reservation.transaction_id != transaction_id)
            {
                return self.reject(operation_id, "transaction_mismatch");
            }
        }
        self.persisted.last_operation_id = Some(operation_id.to_owned());
        if emergency {
            if let Some(reservation) = self.persisted.reservation.as_mut() {
                // The retry command becomes the current binding. This keeps
                // a second retry aligned with the operation id reported in
                // state while the reservation still owns one card.
                reservation.operation_id = operation_id.to_owned();
            }
        }
        self.persisted.phase = Phase::Unlocking;
        self.motion_started_ms = Some(self.monotonic_ms);
        let mut events = self.save_state();
        if self.append_storage_failure(&mut events, operation_id) {
            return events;
        }
        self.motor_target = Some("retract".into());
        events.push(Event::Motor {
            target: "retract".into(),
        });
        events.extend(self.result(operation_id, "accepted", true, None));
        if self.inputs.retracted {
            events.extend(self.complete_unlock());
        }
        events
    }

    fn complete_lock(&mut self) -> Vec<Event> {
        if self.persisted.phase != Phase::Locking {
            return vec![];
        }
        self.motor_target = None;
        let Some(task) = self.persisted.task.clone() else {
            return self.fault("missing_task", None);
        };
        if task.timed && self.deadline_reached() {
            return self.start_unlock(false, &task.operation_id, None);
        }
        self.persisted.phase = if task.timed {
            Phase::TimedLocked
        } else {
            Phase::ConstantLocked
        };
        let mut events = vec![Event::Motor {
            target: "stop".into(),
        }];
        events.extend(self.save_state());
        if self.append_storage_failure(&mut events, &task.operation_id) {
            return events;
        }
        events.push(Event::Ui {
            mode: "locked".into(),
            text: if task.timed {
                "定时锁定".into()
            } else {
                "常锁已锁定".into()
            },
            progress: 100,
        });
        events.extend(self.result(&task.operation_id, "succeeded", true, None));
        events
    }

    fn complete_unlock(&mut self) -> Vec<Event> {
        if self.persisted.phase != Phase::Unlocking {
            return vec![];
        }
        self.motor_target = None;
        let operation_id = self.persisted.last_operation_id.clone().or_else(|| {
            self.persisted
                .task
                .as_ref()
                .map(|task| task.operation_id.clone())
        });
        if self.persisted.reservation.is_some() {
            self.persisted.emergency_remaining =
                self.persisted.emergency_remaining.saturating_sub(1);
            self.persisted.reservation = None;
        }
        self.persisted.task = None;
        self.deadline_monotonic_ms = None;
        self.persisted.phase = Phase::IdleRetracted;
        self.persisted.fault_code = None;
        let mut events = vec![Event::Motor {
            target: "stop".into(),
        }];
        events.extend(self.save_state());
        if let Some(id) = operation_id.as_deref() {
            if self.append_storage_failure(&mut events, id) {
                return events;
            }
        }
        events.push(Event::Ui {
            mode: "unlocked".into(),
            text: "已退栓".into(),
            progress: 100,
        });
        if let Some(id) = operation_id {
            events.extend(self.result(&id, "succeeded", true, None));
        }
        events
    }

    fn confirm_pending(&mut self) -> Vec<Event> {
        let Some(pending) = self.persisted.pending.as_ref() else {
            return vec![];
        };
        if pending.timed
            && (!self.time_calibrated || self.deadline_reached_for(pending.deadline_utc))
        {
            return self.cancel_confirmation("deadline_expired");
        }
        let pending = self.persisted.pending.take().expect("pending exists");
        self.persisted.phase = Phase::IdleRetracted;
        self.start_lock(
            &pending.operation_id,
            &pending.task_id,
            pending.timed,
            pending.deadline_utc,
        )
    }

    fn cancel_confirmation(&mut self, code: &str) -> Vec<Event> {
        let id = self
            .persisted
            .pending
            .as_ref()
            .map(|pending| pending.operation_id.clone())
            .or_else(|| self.persisted.last_operation_id.clone());
        self.persisted.pending = None;
        self.persisted.phase = Phase::IdleRetracted;
        let mut events = self.save_state();
        if let Some(id) = id.as_deref() {
            if self.append_storage_failure(&mut events, id) {
                return events;
            }
        }
        events.push(Event::Ui {
            mode: "idle".into(),
            text: "已取消".into(),
            progress: 0,
        });
        if let Some(id) = id {
            events.extend(self.result(&id, "rejected", false, Some(code)));
        }
        events
    }

    pub fn fault(&mut self, code: &str, operation_id: Option<String>) -> Vec<Event> {
        self.motor_target = None;
        self.persisted.phase = Phase::Fault;
        self.persisted.fault_code = Some(code.to_owned());
        if operation_id.is_some() {
            self.persisted.last_operation_id = operation_id.clone();
        }
        let mut events = vec![Event::Motor {
            target: "stop".into(),
        }];
        events.extend(self.save_state());
        events.push(Event::Ui {
            mode: "fault".into(),
            text: code.into(),
            progress: 0,
        });
        if let Some(id) = operation_id {
            events.extend(self.result(&id, "failed", false, Some(code)));
        }
        events
    }

    fn reject(&self, operation_id: &str, code: &str) -> Vec<Event> {
        self.result(operation_id, "rejected", false, Some(code))
    }

    fn result(&self, operation_id: &str, phase: &str, ok: bool, code: Option<&str>) -> Vec<Event> {
        vec![Event::Result(ResultMessage {
            operation_id: operation_id.to_owned(),
            device_serial: self.config.serial.clone(),
            phase: phase.to_owned(),
            ok,
            code: code.map(str::to_owned),
            task_id: self
                .persisted
                .task
                .as_ref()
                .map(|task| task.task_id.clone()),
        })]
    }

    fn append_storage_failure(&self, events: &mut Vec<Event>, operation_id: &str) -> bool {
        let Some(code) = self.storage_error.as_deref() else {
            return false;
        };
        events.extend(self.result(operation_id, "failed", false, Some(code)));
        true
    }

    pub fn save_state(&mut self) -> Vec<Event> {
        self.storage_error = None;
        self.persisted.schema = STATE_SCHEMA;
        self.persisted.revision = self.persisted.revision.saturating_add(1);
        self.persisted.checksum = checksum(&self.persisted);
        let mut events = Vec::new();
        if let Some(store) = self.state_store() {
            if let Err(error) = store.save(&self.persisted) {
                let code = format!("storage_error:{error}");
                self.persisted = self.durable.clone();
                self.storage_error = Some(code.clone());
                self.motor_target = None;
                self.motion_started_ms = None;
                self.persisted.phase = Phase::Fault;
                self.persisted.fault_code = Some(code);
                self.persisted.checksum = checksum(&self.persisted);
                events.push(Event::Motor {
                    target: "stop".into(),
                });
            }
        }
        if self.storage_error.is_none() {
            self.durable = self.persisted.clone();
        }
        events.push(Event::State);
        events
    }

    fn establish_deadline_mapping(&mut self) {
        let Some(deadline) = self
            .persisted
            .task
            .as_ref()
            .and_then(|task| task.deadline_utc)
        else {
            self.deadline_monotonic_ms = None;
            return;
        };
        if !self.time_calibrated {
            self.deadline_monotonic_ms = None;
            return;
        }
        let remaining_seconds = deadline.saturating_sub(self.now_utc).max(0) as u64;
        self.deadline_monotonic_ms = Some(
            self.monotonic_ms
                .saturating_add(remaining_seconds.saturating_mul(1_000)),
        );
    }

    fn deadline_reached(&self) -> bool {
        self.persisted
            .task
            .as_ref()
            .and_then(|task| task.deadline_utc)
            .is_some_and(|deadline| self.deadline_reached_for(Some(deadline)))
    }

    fn deadline_reached_for(&self, deadline: Option<i64>) -> bool {
        let Some(deadline) = deadline else {
            return false;
        };
        if let Some(monotonic_deadline) = self.deadline_monotonic_ms {
            return self.monotonic_ms >= monotonic_deadline;
        }
        self.time_calibrated && self.now_utc >= deadline
    }

    fn remaining_seconds(&self, deadline: i64) -> Option<i64> {
        if let Some(monotonic_deadline) = self.deadline_monotonic_ms {
            let remaining_ms = monotonic_deadline as i128 - self.monotonic_ms as i128;
            return Some(if remaining_ms <= 0 {
                0
            } else {
                (remaining_ms / 1_000) as i64
            });
        }
        self.time_calibrated
            .then_some(deadline.saturating_sub(self.now_utc))
    }
}

fn initial_state(cards: u8) -> PersistedState {
    let mut state = PersistedState {
        schema: STATE_SCHEMA,
        revision: 0,
        phase: Phase::IdleRetracted,
        task: None,
        reservation: None,
        pending: None,
        emergency_total: cards,
        emergency_remaining: cards,
        fault_code: None,
        last_operation_id: None,
        checksum: String::new(),
        physical: None,
    };
    state.checksum = checksum(&state);
    state
}

fn corrupted_state(fault_code: String) -> PersistedState {
    let mut state = PersistedState {
        schema: STATE_SCHEMA,
        revision: 0,
        phase: Phase::Fault,
        task: None,
        reservation: None,
        pending: None,
        // Never recreate emergency cards when persisted state is unusable.
        emergency_total: 0,
        emergency_remaining: 0,
        fault_code: Some(fault_code),
        last_operation_id: None,
        checksum: String::new(),
        physical: None,
    };
    state.checksum = checksum(&state);
    state
}

fn checksum(state: &PersistedState) -> String {
    let mut value = serde_json::to_value(state).expect("state serializable");
    value["checksum"] = Value::String(String::new());
    let bytes = serde_json::to_vec(&value).expect("state JSON serializable");
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Debug, Clone)]
pub struct StateStore {
    directory: PathBuf,
}

impl StateStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn load(&self) -> Result<Option<PersistedState>> {
        fs::create_dir_all(&self.directory)
            .with_context(|| format!("create state directory {}", self.directory.display()))?;
        let mut valid = Vec::new();
        let mut found_snapshot = false;
        for slot in [0u8, 1u8] {
            let path = self.path(slot);
            if !path.exists() {
                continue;
            }
            found_snapshot = true;
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let Ok(state) = serde_json::from_slice::<PersistedState>(&bytes) else {
                continue;
            };
            if state.schema == STATE_SCHEMA && state.checksum == checksum(&state) {
                valid.push(state);
            }
        }
        if let Some(state) = valid.into_iter().max_by_key(|state| state.revision) {
            return Ok(Some(state));
        }
        if found_snapshot {
            bail!("no valid state snapshot")
        }
        Ok(None)
    }

    pub fn save(&self, state: &PersistedState) -> Result<()> {
        fs::create_dir_all(&self.directory)?;
        let slot = (state.revision % 2) as u8;
        let path = self.path(slot);
        let temp = path.with_extension("tmp");
        use std::io::Write;
        let mut file = fs::File::create(&temp)?;
        file.write_all(&serde_json::to_vec_pretty(state)?)?;
        file.sync_all()?;
        fs::rename(temp, path)?;
        fs::File::open(&self.directory)?.sync_all()?;
        Ok(())
    }

    pub fn clear(&self) -> Result<()> {
        for slot in [0u8, 1u8] {
            let path = self.path(slot);
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        Ok(())
    }

    fn path(&self, slot: u8) -> PathBuf {
        self.directory.join(format!("rust-v2.{slot}.json"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{CommandPayload, Operation};
    use serde_json::json;
    use tempfile::tempdir;

    fn simulator() -> Simulator {
        Simulator::new(SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(tempdir().unwrap().keep()),
        })
        .unwrap()
    }

    fn command(id: &str, operation: Operation, arguments: Value) -> CommandPayload {
        CommandPayload {
            arguments,
            challenge: "challenge".into(),
            command_id: id.into(),
            device_serial: "SIM-001".into(),
            operation,
            protocol_version: 1,
        }
    }

    #[test]
    fn short_timed_lock_skips_confirmation_but_long_lock_requires_release_and_hold() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        let short = command(
            "op-short",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100}),
        );
        sim.accept(&short);
        assert_eq!(sim.persisted.phase, Phase::Locking);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        assert_eq!(sim.persisted.phase, Phase::TimedLocked);

        sim.persisted = initial_state(3);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        let long = command(
            "op-long",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_100_000}),
        );
        sim.accept(&long);
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.button(false);
        sim.button(true);
        sim.advance(9_999);
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.advance(1);
        assert_eq!(sim.persisted.phase, Phase::Locking);
    }

    #[test]
    fn exactly_24_hours_skips_confirmation_but_one_second_more_requires_it() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "boundary",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_086_400, "task_id": "boundary-task"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::Locking);

        let mut above = simulator();
        above.set_time(true, 1_700_000_000);
        above.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        above.accept(&command(
            "above-boundary",
            Operation::StartTimedLock,
            json!({
                "deadline_utc": 1_700_086_401,
                "task_id": "above-boundary-task"
            }),
        ));
        assert_eq!(above.persisted.phase, Phase::AwaitingConfirmation);
    }

    #[test]
    fn utc_correction_does_not_jump_a_continuous_task_deadline() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        assert_eq!(sim.persisted.phase, Phase::TimedLocked);
        sim.set_time(true, 1_700_100_000);
        assert_eq!(sim.persisted.phase, Phase::TimedLocked);
        assert_eq!(sim.state_json()["remaining_seconds"], 100);
        sim.advance(100_000);
        assert_eq!(sim.persisted.phase, Phase::Unlocking);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
    }

    #[test]
    fn releasing_during_confirmation_clears_progress_and_lid_open_cancels() {
        let mut sim = simulator();
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "hold",
            Operation::StartConstantLock,
            json!({"task_id": "hold-task"}),
        ));
        sim.button(false);
        sim.button(true);
        sim.advance(5_000);
        sim.button(false);
        sim.button(true);
        sim.advance(9_999);
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.advance(1);
        assert_eq!(sim.persisted.phase, Phase::Locking);

        let mut opened = simulator();
        opened.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        opened.accept(&command(
            "open",
            Operation::StartConstantLock,
            json!({"task_id": "open-task"}),
        ));
        let events = opened.set_inputs(Inputs {
            lid_closed: false,
            retracted: true,
            extended: false,
        });
        assert_eq!(opened.persisted.phase, Phase::IdleRetracted);
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                code: Some(code),
                ..
            }) if phase == "rejected" && code == "lid_open"
        )));
    }

    #[test]
    fn normal_constant_unlock_does_not_consume_emergency_card() {
        let mut sim = simulator();
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "constant-lock",
            Operation::StartConstantLock,
            json!({"task_id": "constant-task"}),
        ));
        sim.button(false);
        sim.button(true);
        sim.advance(CONFIRMATION_MS);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        assert_eq!(sim.persisted.phase, Phase::ConstantLocked);
        sim.accept(&command(
            "constant-unlock",
            Operation::UnlockConstant,
            json!({"task_id": "constant-task"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert_eq!(sim.persisted.emergency_remaining, 3);
    }

    #[test]
    fn duplicate_emergency_delivery_consumes_one_card_once() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        let emergency = command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-1", "transaction_id": "tx-1"}),
        );
        sim.accept(&emergency);
        let duplicate = sim.accept(&emergency);
        assert!(duplicate.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage { phase, .. }) if phase == "duplicate"
        )));
        assert_eq!(sim.persisted.emergency_remaining, 3);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        assert_eq!(sim.persisted.emergency_remaining, 2);
    }

    #[test]
    fn emergency_failure_reserves_then_retry_consumes_once() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "lock-task"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        sim.advance(1);
        sim.accept(&command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id":"lock-task","transaction_id":"tx-1"}),
        ));
        assert_eq!(
            sim.persisted
                .reservation
                .as_ref()
                .map(|r| r.transaction_id.as_str()),
            Some("tx-1")
        );
        sim.advance(MOTION_TIMEOUT_MS);
        assert_eq!(sim.persisted.phase, Phase::Fault);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "retry",
            Operation::RetryOperation,
            json!({"task_id":"lock-task", "operation_id":"emergency"}),
        ));
        assert_eq!(sim.persisted.emergency_remaining, 2);
        assert!(sim.persisted.reservation.is_none());
    }

    #[test]
    fn boot_recovers_initial_state_as_idle() {
        let mut sim = simulator();
        sim.boot();
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
    }

    #[test]
    fn confirmation_rechecks_deadline_before_starting_motion() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "long",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_100_000, "task_id": "long-task"}),
        ));
        sim.button(false);
        sim.button(true);
        sim.set_time(true, 1_700_100_000);
        sim.advance(CONFIRMATION_MS);
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert!(sim.persisted.task.is_none());
        assert!(sim.persisted.pending.is_none());
    }

    #[test]
    fn deadline_reached_during_locking_unwinds_without_locking() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "short",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "short-task"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::Locking);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: false,
        });
        sim.set_time(true, 1_700_000_100);
        sim.advance(100_000);
        assert_eq!(sim.persisted.phase, Phase::Unlocking);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert!(sim.persisted.task.is_none());
    }

    #[test]
    fn existing_emergency_transaction_cannot_be_replaced() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "lock-task"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        sim.accept(&command(
            "emergency-1",
            Operation::EmergencyUnlock,
            json!({"task_id": "lock-task", "transaction_id": "tx-1"}),
        ));
        let events = sim.accept(&command(
            "emergency-2",
            Operation::EmergencyUnlock,
            json!({"task_id": "lock-task", "transaction_id": "tx-2"}),
        ));
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                code: Some(code),
                ..
            }) if phase == "rejected" && code == "unlock_in_progress"
        )));
        assert_eq!(
            sim.persisted
                .reservation
                .as_ref()
                .map(|reservation| reservation.transaction_id.as_str()),
            Some("tx-1")
        );
    }

    #[test]
    fn retry_with_retracted_position_finishes_faulted_operation() {
        let mut sim = simulator();
        sim.persisted.phase = Phase::Fault;
        sim.persisted.task = Some(Task {
            task_id: "task-1".into(),
            operation_id: "old-op".into(),
            timed: true,
            deadline_utc: Some(1_700_000_100),
        });
        sim.persisted.last_operation_id = Some("old-op".into());
        sim.inputs = Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        };
        let events = sim.accept(&command(
            "retry-1",
            Operation::RetryOperation,
            json!({"task_id": "task-1", "operation_id": "old-op"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert!(sim.persisted.task.is_none());
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                operation_id,
                phase,
                ..
            }) if operation_id == "retry-1" && phase == "succeeded"
        )));
    }

    #[test]
    fn retry_binds_to_the_faulting_unlock_operation() {
        let mut sim = simulator();
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "constant-lock",
            Operation::StartConstantLock,
            json!({"task_id": "constant-task"}),
        ));
        sim.button(false);
        sim.button(true);
        sim.advance(CONFIRMATION_MS);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        sim.accept(&command(
            "unlock-op",
            Operation::UnlockConstant,
            json!({"task_id": "constant-task"}),
        ));
        sim.advance(MOTION_TIMEOUT_MS);
        assert_eq!(sim.persisted.phase, Phase::Fault);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        let events = sim.accept(&command(
            "retry-unlock",
            Operation::RetryOperation,
            json!({
                "task_id": "constant-task",
                "operation_id": "unlock-op"
            }),
        ));
        assert_eq!(sim.persisted.phase, Phase::ConstantLocked);
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                operation_id,
                phase,
                ..
            }) if operation_id == "retry-unlock" && phase == "recovered"
        )));
    }

    #[test]
    fn repeated_emergency_retries_follow_the_latest_operation_id() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        sim.accept(&command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-1", "transaction_id": "tx-1"}),
        ));
        sim.advance(MOTION_TIMEOUT_MS);
        assert_eq!(sim.persisted.phase, Phase::Fault);

        sim.accept(&command(
            "retry-1",
            Operation::RetryOperation,
            json!({"task_id": "task-1", "operation_id": "emergency"}),
        ));
        assert_eq!(
            sim.persisted
                .reservation
                .as_ref()
                .map(|reservation| reservation.operation_id.as_str()),
            Some("retry-1")
        );
        sim.advance(MOTION_TIMEOUT_MS);
        assert_eq!(sim.persisted.phase, Phase::Fault);

        let events = sim.accept(&command(
            "retry-2",
            Operation::RetryOperation,
            json!({"task_id": "task-1", "operation_id": "retry-1"}),
        ));
        assert!(!events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                code: Some(code),
                ..
            }) if phase == "rejected" && code == "operation_mismatch"
        )));
        assert_eq!(
            sim.persisted
                .reservation
                .as_ref()
                .map(|reservation| reservation.operation_id.as_str()),
            Some("retry-2")
        );
        assert_eq!(sim.persisted.emergency_remaining, 3);
    }

    #[test]
    fn storage_failure_blocks_lock_motion_and_reports_failure() {
        let directory = tempdir().unwrap();
        let config = SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(directory.path().to_path_buf()),
        };
        let mut sim = Simulator::new(config).unwrap();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        std::fs::remove_dir_all(directory.path()).unwrap();
        std::fs::write(directory.path(), b"not a directory").unwrap();

        let events = sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::Fault);
        assert!(sim.motor_target.is_none());
        assert!(!events.iter().any(|event| matches!(
            event,
            Event::Motor { target } if target == "extend"
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                ok: false,
                code: Some(code),
                ..
            }) if phase == "failed" && code.starts_with("storage_error:")
        )));
    }

    #[test]
    fn storage_failure_blocks_unlock_motion_and_reports_failure() {
        let directory = tempdir().unwrap();
        let config = SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(directory.path().to_path_buf()),
        };
        let mut sim = Simulator::new(config).unwrap();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        std::fs::remove_dir_all(directory.path()).unwrap();
        std::fs::write(directory.path(), b"not a directory").unwrap();

        let events = sim.accept(&command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-1", "transaction_id": "tx-1"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::Fault);
        assert!(sim.motor_target.is_none());
        assert!(!events.iter().any(|event| matches!(
            event,
            Event::Motor { target } if target == "retract"
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                ok: false,
                code: Some(code),
                ..
            }) if phase == "failed" && code.starts_with("storage_error:")
        )));
    }

    #[test]
    fn contradictory_inputs_cancel_confirmation() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "confirm-op",
            Operation::StartConstantLock,
            json!({"task_id": "confirm-task"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: true,
        });
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert!(sim.persisted.pending.is_none());
    }

    #[test]
    fn confirmation_expires_and_initial_button_press_cannot_confirm() {
        let mut sim = simulator();
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.button(true);
        sim.accept(&command(
            "constant-1",
            Operation::StartConstantLock,
            json!({"task_id": "constant-task"}),
        ));
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.advance(CONFIRMATION_MS);
        assert_eq!(sim.persisted.phase, Phase::AwaitingConfirmation);
        sim.button(false);
        sim.button(true);
        sim.advance(CONFIRMATION_MS);
        assert_eq!(sim.persisted.phase, Phase::Locking);

        let mut expired = simulator();
        expired.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        expired.accept(&command(
            "constant-expired",
            Operation::StartConstantLock,
            json!({"task_id": "constant-expired-task"}),
        ));
        expired.button(false);
        expired.button(true);
        expired.advance(CONFIRMATION_TTL_MS);
        assert_eq!(expired.persisted.phase, Phase::IdleRetracted);
        assert!(expired.persisted.pending.is_none());
    }

    #[test]
    fn corrupt_snapshots_enter_fault_without_restoring_initial_cards() {
        let directory = tempdir().unwrap();
        std::fs::write(directory.path().join("rust-v2.0.json"), b"not-json").unwrap();
        std::fs::write(directory.path().join("rust-v2.1.json"), b"also-not-json").unwrap();
        let sim = Simulator::new(SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(directory.path().to_path_buf()),
        })
        .unwrap();
        assert_eq!(sim.persisted.phase, Phase::Fault);
        assert_eq!(sim.persisted.emergency_total, 0);
        assert_eq!(sim.persisted.emergency_remaining, 0);
        assert!(sim
            .persisted
            .fault_code
            .as_deref()
            .is_some_and(|code| code.starts_with("state_corrupt:")));
    }

    #[test]
    fn timed_lock_waits_for_time_after_restart_and_expires_without_app() {
        let directory = tempdir().unwrap();
        let config = SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(directory.path().to_path_buf()),
        };
        let mut first = Simulator::new(config.clone()).unwrap();
        first.set_time(true, 1_700_000_000);
        first.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        first.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        first.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        assert_eq!(first.persisted.phase, Phase::TimedLocked);

        let mut recovered = Simulator::new(config).unwrap();
        recovered.boot();
        assert_eq!(recovered.persisted.phase, Phase::WaitingForTime);
        recovered.set_time(true, 1_700_000_100);
        assert_eq!(recovered.persisted.phase, Phase::IdleRetracted);
        assert!(recovered.persisted.task.is_none());
    }

    #[test]
    fn emergency_cards_are_exhausted_only_after_three_successful_unlocks() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        for index in 0..3 {
            let task_id = format!("task-{index}");
            let lock_id = format!("lock-{index}");
            sim.accept(&command(
                &lock_id,
                Operation::StartTimedLock,
                json!({"deadline_utc": 1_700_000_100, "task_id": task_id}),
            ));
            sim.set_inputs(Inputs {
                lid_closed: true,
                retracted: false,
                extended: true,
            });
            sim.accept(&command(
                &format!("emergency-{index}"),
                Operation::EmergencyUnlock,
                json!({
                    "task_id": format!("task-{index}"),
                    "transaction_id": format!("tx-{index}")
                }),
            ));
            sim.set_inputs(Inputs {
                lid_closed: true,
                retracted: true,
                extended: false,
            });
            assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
            assert_eq!(sim.persisted.emergency_remaining, 2u8 - index as u8);
        }

        sim.accept(&command(
            "lock-4",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-4"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        let events = sim.accept(&command(
            "emergency-4",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-4", "transaction_id": "tx-4"}),
        ));
        assert!(events.iter().any(|event| matches!(
            event,
            Event::Result(ResultMessage {
                phase,
                code: Some(code),
                ..
            }) if phase == "rejected" && code == "emergency_cards_exhausted"
        )));
        assert_eq!(sim.persisted.emergency_remaining, 0);
    }

    #[test]
    fn natural_expiry_releases_failed_emergency_reservation_without_a_card() {
        let mut sim = simulator();
        sim.set_time(true, 1_700_000_000);
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        sim.accept(&command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-1", "transaction_id": "tx-1"}),
        ));
        sim.advance(MOTION_TIMEOUT_MS);
        assert_eq!(sim.persisted.phase, Phase::Fault);
        assert!(sim.persisted.reservation.is_some());
        sim.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        sim.set_time(true, 1_700_000_100);
        sim.advance(100_000);
        if sim.persisted.phase == Phase::Unlocking {
            sim.set_inputs(Inputs {
                lid_closed: true,
                retracted: true,
                extended: false,
            });
        }
        assert_eq!(sim.persisted.phase, Phase::IdleRetracted);
        assert_eq!(sim.persisted.emergency_remaining, 3);
        assert!(sim.persisted.reservation.is_none());
    }

    #[test]
    fn restart_after_emergency_motion_consumes_card_once_at_retracted_position() {
        let directory = tempdir().unwrap();
        let config = SimulatorConfig {
            serial: "SIM-001".into(),
            mode: Mode::Simulated,
            initial_cards: 3,
            state_dir: Some(directory.path().to_path_buf()),
        };
        let mut first = Simulator::new(config.clone()).unwrap();
        first.set_time(true, 1_700_000_000);
        first.set_inputs(Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        });
        first.accept(&command(
            "lock",
            Operation::StartTimedLock,
            json!({"deadline_utc": 1_700_000_100, "task_id": "task-1"}),
        ));
        first.set_inputs(Inputs {
            lid_closed: true,
            retracted: false,
            extended: true,
        });
        first.accept(&command(
            "emergency",
            Operation::EmergencyUnlock,
            json!({"task_id": "task-1", "transaction_id": "tx-1"}),
        ));
        assert_eq!(first.persisted.emergency_remaining, 3);

        let mut recovered = Simulator::new(config).unwrap();
        recovered.inputs = Inputs {
            lid_closed: true,
            retracted: true,
            extended: false,
        };
        recovered.boot();
        assert_eq!(recovered.persisted.phase, Phase::IdleRetracted);
        assert_eq!(recovered.persisted.emergency_remaining, 2);
        assert!(recovered.persisted.reservation.is_none());
    }
}
