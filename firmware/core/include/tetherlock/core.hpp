#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>

namespace tetherlock {

enum class Mode { simulated, bench, real };
enum class Phase {
  boot_recovery,
  waiting_for_time,
  idle_retracted,
  awaiting_confirmation,
  locking,
  timed_locked,
  constant_locked,
  unlocking,
  fault,
};

enum class Operation {
  start_timed_lock,
  start_constant_lock,
  unlock_constant,
  emergency_unlock,
  retry_operation,
};

const char* phaseName(Phase phase);
const char* operationName(Operation operation);

struct Inputs {
  bool lidClosed = false;
  bool retracted = true;
  bool extended = false;
  bool contradictory() const { return retracted && extended; }
};

struct Task {
  std::string taskId;
  std::string operationId;
  bool timed = false;
  std::int64_t deadlineUtc = 0;
};

struct Reservation {
  std::string transactionId;
  std::string operationId;
  std::string taskId;
};

struct PersistentSnapshot {
  std::uint64_t revision = 0;
  Phase phase = Phase::idle_retracted;
  std::optional<Task> task;
  std::optional<Reservation> reservation;
  int emergencyTotal = 3;
  int emergencyRemaining = 3;
  std::string faultCode;
  std::string lastOperationId;
  std::uint32_t checksum = 0;
};

struct Command {
  std::string deviceSerial;
  std::string commandId;
  std::string challenge;
  Operation operation = Operation::start_timed_lock;
  std::int64_t deadlineUtc = 0;
  std::string taskId;
  std::string transactionId;
};

struct Result {
  std::string operationId;
  std::string phase;
  bool ok = false;
  std::string code;
  std::string taskId;
};

class Storage {
 public:
  virtual ~Storage() = default;
  virtual std::optional<PersistentSnapshot> load() = 0;
  virtual bool commit(const PersistentSnapshot& snapshot) = 0;
  virtual void clear() = 0;
};

class Motor {
 public:
  virtual ~Motor() = default;
  virtual void stop() = 0;
  virtual void extend() = 0;
  virtual void retract() = 0;
};

class Ui {
 public:
  virtual ~Ui() = default;
  virtual void show(const std::string& mode, const std::string& text, int progressPercent) = 0;
};

class EventSink {
 public:
  virtual ~EventSink() = default;
  virtual void onResult(const Result& result) = 0;
  virtual void onState(const PersistentSnapshot& snapshot, const Inputs& inputs,
                       bool timeCalibrated, std::int64_t nowUtc, Mode mode) = 0;
};

struct Config {
  std::string serial;
  Mode mode = Mode::simulated;
  int emergencyCards = 3;
  std::uint64_t confirmationMs = 10'000;
  std::uint64_t confirmationTtlMs = 60'000;
  std::uint64_t motionTimeoutMs = 15'000;
};

class Controller {
 public:
  Controller(Config config, Storage& storage, Motor& motor, Ui& ui, EventSink& sink);

  void boot();
  void setTime(bool calibrated, std::int64_t utcSeconds, std::uint64_t monotonicMs);
  void setInputs(Inputs inputs);
  void buttonChanged(bool pressed);
  bool acceptCommand(const Command& command);
  void tick(std::uint64_t monotonicMs);

  Phase phase() const { return snapshot_.phase; }
  const PersistentSnapshot& snapshot() const { return snapshot_; }
  const Inputs& inputs() const { return inputs_; }
  bool timeCalibrated() const { return timeCalibrated_; }
  std::int64_t nowUtc() const { return nowUtc_; }

 private:
  Config config_;
  Storage& storage_;
  Motor& motor_;
  Ui& ui_;
  EventSink& sink_;
  PersistentSnapshot snapshot_;
  Inputs inputs_;
  bool timeCalibrated_ = false;
  std::int64_t nowUtc_ = 0;
  std::uint64_t monotonicMs_ = 0;
  std::uint64_t motionStartedMs_ = 0;
  bool buttonPressed_ = false;
  bool confirmationReleased_ = false;
  std::uint64_t confirmationStartedMs_ = 0;
  std::uint64_t confirmationEnteredMs_ = 0;
  std::string pendingOperationId_;
  std::string pendingTaskId_;
  bool pendingTimed_ = false;
  std::int64_t pendingDeadlineUtc_ = 0;

  bool persist();
  void publishState();
  void result(const std::string& operationId, const std::string& phase, bool ok,
             const std::string& code = {});
  void reject(const Command& command, const std::string& code);
  void cancelConfirmation(const std::string& code);
  void startLock(const std::string& operationId, const std::string& taskId,
                bool timed, std::int64_t deadlineUtc);
  void startUnlock(const Command& command, bool emergency);
  void completeLock();
  void completeUnlock();
  void enterFault(const std::string& code, const std::string& operationId);
  void confirmPending();
  bool isIdle() const;
};

std::uint32_t snapshotChecksum(const PersistentSnapshot& snapshot);

}  // namespace tetherlock
