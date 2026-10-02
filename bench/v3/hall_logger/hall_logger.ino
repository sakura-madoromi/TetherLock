// Standalone 3.3V Hall bench logger. NOT the V3 lock controller.
// GPIO4 is a placeholder: check the board pinout and existing connections first.
// Candidate DRV5032ZE: OUT externally pulled up by 10k to 3.3V; VCC bypass 0.1uF.
#include <Arduino.h>
constexpr uint8_t HALL_PIN = 4;
constexpr uint32_t STABLE_MS = 100;
int rawLevel = HIGH;
int stableLevel = -1;
uint32_t changedAt = 0;
uint32_t printedAt = 0;
void setup() {
  Serial.begin(115200);
  pinMode(HALL_PIN, INPUT_PULLUP);
  rawLevel = digitalRead(HALL_PIN);
  changedAt = millis();
  Serial.println("ms,raw_level,stable_level,state");
}
void loop() {
  const uint32_t now = millis();
  const int next = digitalRead(HALL_PIN);
  if (next != rawLevel) { rawLevel = next; stableLevel = -1; changedAt = now; }
  if (uint32_t(now - changedAt) >= STABLE_MS) stableLevel = rawLevel;
  if (uint32_t(now - printedAt) >= 20) {
    printedAt = now;
    const char* state = stableLevel < 0 ? "pending" : stableLevel == LOW ? "magnet_present" : "magnet_absent";
    Serial.printf("%lu,%d,%d,%s\n", (unsigned long)now, rawLevel, stableLevel, state);
  }
  delay(1);
}
