#include "tetherlock/core.hpp"

#include <algorithm>
#include <sstream>

namespace tetherlock {

namespace {

std::uint32_t fnv1a(const std::string& value, std::uint32_t seed = 2166136261u) {
  auto hash = seed;
  for (const auto byte : value) {
    hash ^= static_cast<std::uint8_t>(byte);
    hash *= 16777619u;
  }
  return hash;
}

std::string taskText(const std::optional<Task>& task) {
  if (!task) return "";
  std::ostringstream out;
  out << task->taskId << '|' << task->operationId << '|' << (task->timed ? 1 : 0)
      << '|' << task->deadlineUtc;
  return out.str();
}

std::string reservationText(const std::optional<Reservation>& reservation) {
  if (!reservation) return "";
  return reservation->transactionId + '|' + reservation->operationId + '|' + reservation->taskId;
}

}  // namespace

const char* phaseName(Phase phase) {
  switch (phase) {
    case Phase::boot_recovery: return "boot_recovery";
    case Phase::waiting_for_time: return "waiting_for_time";
    case Phase::idle_retracted: return "idle_retracted";
    case Phase::awaiting_confirmation: return "awaiting_confirmation";
    case Phase::locking: return "locking";
    case Phase::timed_locked: return "timed_locked";
    case Phase::constant_locked: return "constant_locked";
    case Phase::unlocking: return "unlocking";
    case Phase::fault: return "fault";
  }
  return "unknown";
}

const char* operationName(Operation operation) {
  switch (operation) {
    case Operation::start_timed_lock: return "start_timed_lock";
    case Operation::start_constant_lock: return "start_constant_lock";
    case Operation::unlock_constant: return "unlock_constant";
    case Operation::emergency_unlock: return "emergency_unlock";
    case Operation::retry_operation: return "retry_operation";
  }
  return "unknown";
}

std::uint32_t snapshotChecksum(const PersistentSnapshot& snapshot) {
  std::ostringstream value;
  value << snapshot.revision << '|' << phaseName(snapshot.phase) << '|'
        << taskText(snapshot.task) << '|' << reservationText(snapshot.reservation) << '|'
        << snapshot.emergencyTotal << '|' << snapshot.emergencyRemaining << '|'
        << snapshot.faultCode << '|' << snapshot.lastOperationId;
  return fnv1a(value.str());
}

Controller::Controller(Config config, Storage& storage, Motor& motor, Ui& ui, EventSink& sink)
    : config_(std::move(config)), storage_(storage), motor_(motor), ui_(ui), sink_(sink) {
  snapshot_.emergencyTotal = config_.emergencyCards;
  snapshot_.emergencyRemaining = config_.emergencyCards;
}

bool Controller::persist() {
  snapshot_.revision++;
  snapshot_.checksum = snapshotChecksum(snapshot_);
  if (!storage_.commit(snapshot_)) {
    motor_.stop();
    snapshot_.phase = Phase::fault;
    snapshot_.faultCode = "storage_commit_failed";
    ui_.show("fault", snapshot_.faultCode, 0);
    publishState();
    if (!snapshot_.lastOperationId.empty()) {
      result(snapshot_.lastOperationId, "failed", false, snapshot_.faultCode);
    }
    return false;
  }
  publishState();
  return true;
}

void Controller::publishState() {
  sink_.onState(snapshot_, inputs_, timeCalibrated_, nowUtc_, config_.mode);
}

void Controller::result(const std::string& operationId, const std::string& phase, bool ok,
                        const std::string& code) {
  sink_.onResult(Result{operationId, phase, ok, code,
                        snapshot_.task ? snapshot_.task->taskId : ""});
}

void Controller::boot() {
  motor_.stop();
  snapshot_.phase = Phase::boot_recovery;
  publishState();
  const auto loaded = storage_.load();
  if (loaded && loaded->checksum == snapshotChecksum(*loaded)) {
    snapshot_ = *loaded;
  } else if (loaded) {
    snapshot_.phase = Phase::fault;
    snapshot_.faultCode = "corrupt_state";
  }
  if (inputs_.contradictory()) {
    enterFault("input_contradiction", snapshot_.lastOperationId);
    return;
  }
  if (snapshot_.phase == Phase::locking && inputs_.extended) {
    completeLock();
  } else if (snapshot_.phase == Phase::unlocking && inputs_.retracted) {
    completeUnlock();
  } else if (snapshot_.phase == Phase::locking || snapshot_.phase == Phase::unlocking) {
    motor_.stop();
    enterFault("position_unknown_after_restart", snapshot_.lastOperationId);
  } else if (snapshot_.task && snapshot_.task->timed && !timeCalibrated_) {
    snapshot_.phase = Phase::waiting_for_time;
    persist();
  } else {
    publishState();
  }
}

void Controller::setTime(bool calibrated, std::int64_t utcSeconds, std::uint64_t monotonicMs) {
  timeCalibrated_ = calibrated;
  nowUtc_ = utcSeconds;
  monotonicMs_ = monotonicMs;
  if (timeCalibrated_ && snapshot_.phase == Phase::waiting_for_time) {
    if (snapshot_.task && snapshot_.task->timed && nowUtc_ >= snapshot_.task->deadlineUtc) {
      Command command;
      command.commandId = "deadline-recovery";
      command.taskId = snapshot_.task->taskId;
      command.operation = Operation::retry_operation;
      startUnlock(command, false);
    } else {
      snapshot_.phase = snapshot_.task && snapshot_.task->timed
                            ? Phase::timed_locked : Phase::constant_locked;
      persist();
    }
  }
  publishState();
}

void Controller::setInputs(Inputs inputs) {
  inputs_ = inputs;
  if (inputs_.contradictory()) {
    motor_.stop();
    enterFault("input_contradiction", snapshot_.lastOperationId);
    return;
  }
  if (snapshot_.phase == Phase::awaiting_confirmation && !inputs_.lidClosed) {
    cancelConfirmation("lid_open");
    return;
  }
  if (snapshot_.phase == Phase::locking && inputs_.extended) completeLock();
  if (snapshot_.phase == Phase::unlocking && inputs_.retracted) completeUnlock();
  publishState();
}

void Controller::buttonChanged(bool pressed) {
  buttonPressed_ = pressed;
  if (snapshot_.phase != Phase::awaiting_confirmation) return;
  if (!pressed) {
    confirmationReleased_ = true;
    confirmationStartedMs_ = 0;
    ui_.show("confirmation", "请长按 10 秒确认", 0);
    return;
  }
  if (!confirmationReleased_) {
    ui_.show("confirmation", "请先松开按钮，再重新长按", 0);
    return;
  }
  confirmationStartedMs_ = monotonicMs_;
}

bool Controller::isIdle() const {
  return snapshot_.phase == Phase::idle_retracted && !snapshot_.task && !snapshot_.reservation;
}

void Controller::reject(const Command& command, const std::string& code) {
  result(command.commandId, "rejected", false, code);
}

void Controller::cancelConfirmation(const std::string& code) {
  motor_.stop();
  result(pendingOperationId_, "rejected", false, code);
  pendingOperationId_.clear();
  pendingTaskId_.clear();
  snapshot_.phase = Phase::idle_retracted;
  persist();
  ui_.show("idle", "已取消", 0);
}

void Controller::startLock(const std::string& operationId, const std::string& taskId,
                           bool timed, std::int64_t deadlineUtc) {
  snapshot_.task = Task{taskId, operationId, timed, deadlineUtc};
  snapshot_.lastOperationId = operationId;
  snapshot_.faultCode.clear();
  snapshot_.phase = Phase::locking;
  motionStartedMs_ = monotonicMs_;
  // The snapshot is committed before the motor starts, so a reset can reconcile
  // the action with the physical limit switches.
  if (!persist()) return;
  motor_.extend();
  ui_.show("locking", "正在闭锁", 0);
  result(operationId, "accepted", true);
}

void Controller::startUnlock(const Command& command, bool emergency) {
  if (!snapshot_.task) {
    reject(command, "no_active_task");
    return;
  }
  if (command.taskId.size() && command.taskId != snapshot_.task->taskId) {
    reject(command, "task_mismatch");
    return;
  }
  if (emergency && !snapshot_.reservation) {
    if (snapshot_.emergencyRemaining <= 0) {
      reject(command, "emergency_cards_exhausted");
      return;
    }
    snapshot_.reservation = Reservation{
        command.transactionId.empty() ? command.commandId : command.transactionId,
        command.commandId, snapshot_.task->taskId};
  }
  snapshot_.lastOperationId = command.commandId;
  snapshot_.phase = Phase::unlocking;
  motionStartedMs_ = monotonicMs_;
  if (!persist()) return;
  motor_.retract();
  ui_.show("unlocking", emergency ? "正在紧急退栓" : "正在退栓", 0);
  result(command.commandId, "accepted", true);
}

void Controller::completeLock() {
  if (snapshot_.phase != Phase::locking || !snapshot_.task) return;
  motor_.stop();
  if (snapshot_.task->timed && timeCalibrated_ && nowUtc_ >= snapshot_.task->deadlineUtc) {
    Command command;
    command.commandId = snapshot_.task->operationId;
    command.taskId = snapshot_.task->taskId;
    command.operation = Operation::retry_operation;
    startUnlock(command, false);
    return;
  }
  snapshot_.phase = snapshot_.task->timed ? Phase::timed_locked : Phase::constant_locked;
  persist();
  ui_.show("locked", snapshot_.task->timed ? "定时锁定" : "常锁已锁定", 100);
  result(snapshot_.task->operationId, "succeeded", true);
}

void Controller::completeUnlock() {
  if (snapshot_.phase != Phase::unlocking || !snapshot_.task) return;
  motor_.stop();
  const auto operationId = snapshot_.lastOperationId.empty()
                               ? snapshot_.task->operationId : snapshot_.lastOperationId;
  if (snapshot_.reservation) {
    if (snapshot_.emergencyRemaining <= 0) {
      enterFault("reservation_without_card", operationId);
      return;
    }
    // One commit atomically consumes the reserved card and removes the task.
    snapshot_.emergencyRemaining--;
    snapshot_.reservation.reset();
  }
  snapshot_.task.reset();
  snapshot_.phase = Phase::idle_retracted;
  snapshot_.faultCode.clear();
  if (!persist()) return;
  ui_.show("unlocked", "已退栓", 100);
  result(operationId, "succeeded", true);
}

void Controller::enterFault(const std::string& code, const std::string& operationId) {
  motor_.stop();
  snapshot_.phase = Phase::fault;
  snapshot_.faultCode = code;
  snapshot_.lastOperationId = operationId;
  persist();
  ui_.show("fault", code, 0);
  if (!operationId.empty()) result(operationId, "failed", false, code);
}

void Controller::confirmPending() {
  const auto operationId = pendingOperationId_;
  const auto taskId = pendingTaskId_;
  const auto timed = pendingTimed_;
  const auto deadline = pendingDeadlineUtc_;
  pendingOperationId_.clear();
  pendingTaskId_.clear();
  snapshot_.phase = Phase::idle_retracted;
  startLock(operationId, taskId, timed, deadline);
}

bool Controller::acceptCommand(const Command& command) {
  if (command.deviceSerial != config_.serial) {
    reject(command, "wrong_device");
    return false;
  }
  if (!snapshot_.lastOperationId.empty() && snapshot_.lastOperationId == command.commandId &&
      (snapshot_.phase != Phase::idle_retracted || snapshot_.task)) {
    result(command.commandId, "duplicate", true);
    return true;
  }
  if (snapshot_.phase == Phase::awaiting_confirmation) {
    reject(command, "confirmation_pending");
    return false;
  }
  if (command.operation == Operation::start_timed_lock ||
      command.operation == Operation::start_constant_lock) {
    if (!isIdle()) {
      reject(command, "busy");
      return false;
    }
    if (!inputs_.lidClosed || !inputs_.retracted || inputs_.contradictory()) {
      reject(command, "lock_conditions_unsatisfied");
      return false;
    }
    const bool timed = command.operation == Operation::start_timed_lock;
    if (timed && (!timeCalibrated_ || command.deadlineUtc <= nowUtc_)) {
      reject(command, "time_not_ready_or_expired");
      return false;
    }
    const auto remaining = timed ? command.deadlineUtc - nowUtc_ : 0;
    const bool needsConfirmation = !timed || remaining > 24 * 60 * 60;
    if (needsConfirmation) {
      pendingOperationId_ = command.commandId;
      pendingTaskId_ = command.taskId.empty() ? command.commandId : command.taskId;
      pendingTimed_ = timed;
      pendingDeadlineUtc_ = command.deadlineUtc;
      confirmationReleased_ = !buttonPressed_;
      confirmationStartedMs_ = 0;
      confirmationEnteredMs_ = monotonicMs_;
      snapshot_.phase = Phase::awaiting_confirmation;
      snapshot_.lastOperationId = command.commandId;
      persist();
      ui_.show("confirmation", "请先松开按钮，再长按 10 秒确认", 0);
      result(command.commandId, "waiting_confirmation", true);
      return true;
    }
    startLock(command.commandId, command.taskId.empty() ? command.commandId : command.taskId,
              timed, command.deadlineUtc);
    return true;
  }
  if (command.operation == Operation::unlock_constant) {
    if (snapshot_.phase != Phase::constant_locked) {
      reject(command, "not_constant_locked");
      return false;
    }
    startUnlock(command, false);
    return true;
  }
  if (command.operation == Operation::emergency_unlock) {
    if (snapshot_.phase != Phase::timed_locked && snapshot_.phase != Phase::unlocking &&
        snapshot_.phase != Phase::fault) {
      reject(command, "not_timed_locked");
      return false;
    }
    if (snapshot_.phase == Phase::fault && !snapshot_.reservation) {
      reject(command, "no_retryable_emergency_transaction");
      return false;
    }
    startUnlock(command, true);
    return true;
  }
  if (command.operation == Operation::retry_operation) {
    if (snapshot_.phase != Phase::fault || !snapshot_.task) {
      reject(command, "no_retryable_operation");
      return false;
    }
    if (!snapshot_.lastOperationId.empty() && command.taskId.size() &&
        command.taskId != snapshot_.task->taskId) {
      reject(command, "task_mismatch");
      return false;
    }
    if (snapshot_.reservation) {
      startUnlock(command, true);
    } else if (inputs_.extended) {
      snapshot_.phase = snapshot_.task->timed ? Phase::timed_locked : Phase::constant_locked;
      persist();
      result(command.commandId, "recovered", true);
    } else if (inputs_.retracted) {
      completeUnlock();
    } else {
      reject(command, "position_unknown");
    }
    return true;
  }
  reject(command, "unknown_operation");
  return false;
}

void Controller::tick(std::uint64_t monotonicMs) {
  monotonicMs_ = monotonicMs;
  if (snapshot_.phase == Phase::awaiting_confirmation) {
    if (monotonicMs_ - confirmationEnteredMs_ >= config_.confirmationTtlMs) {
      cancelConfirmation("confirmation_expired");
      return;
    }
    if (buttonPressed_ && confirmationReleased_) {
      if (confirmationStartedMs_ == 0) confirmationStartedMs_ = monotonicMs_;
      const auto elapsed = monotonicMs_ - confirmationStartedMs_;
      const auto progress = static_cast<int>(std::min<std::uint64_t>(100, elapsed * 100 / config_.confirmationMs));
      ui_.show("confirmation", "请长按 10 秒确认", progress);
      if (elapsed >= config_.confirmationMs) confirmPending();
    }
  }
  if ((snapshot_.phase == Phase::locking || snapshot_.phase == Phase::unlocking) &&
      monotonicMs_ - motionStartedMs_ >= config_.motionTimeoutMs) {
    enterFault("motion_timeout", snapshot_.lastOperationId);
    return;
  }
  if (snapshot_.phase == Phase::timed_locked && timeCalibrated_ && nowUtc_ >= snapshot_.task->deadlineUtc) {
    Command command;
    command.commandId = snapshot_.task->operationId + "-expiry";
    command.taskId = snapshot_.task->taskId;
    command.operation = Operation::retry_operation;
    startUnlock(command, false);
  }
  publishState();
}

}  // namespace tetherlock
