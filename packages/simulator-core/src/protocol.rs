use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use p256::ecdsa::{signature::Signer, signature::Verifier, Signature, SigningKey, VerifyingKey};
use p256::elliptic_curve::sec1::FromEncodedPoint;
use p256::{EncodedPoint, FieldBytes, PublicKey};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use uuid::Uuid;

use crate::canonical::canonical_bytes;

pub const PROTOCOL_VERSION: u8 = 1;
pub const ALGORITHM: &str = "ECDSA-P256-SHA256-RAW-LOW-S";
pub const COMMAND_DOMAIN: &[u8] = b"TetherLock/v1/command\0";
pub const CHALLENGE_TTL_MS: u64 = 60_000;
pub const MAX_CHALLENGES: usize = 8;
pub const MAX_CONTROL_BYTES: usize = 4096;

pub fn topic_prefix(serial: &str, namespace: &str) -> String {
    format!("{}/{serial}", namespace.trim_end_matches('/'))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    StartTimedLock,
    StartConstantLock,
    UnlockConstant,
    EmergencyUnlock,
    RetryOperation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPayload {
    pub arguments: Value,
    pub challenge: String,
    pub command_id: String,
    pub device_serial: String,
    pub operation: Operation,
    pub protocol_version: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedCommand {
    pub algorithm: String,
    pub payload: String,
    pub protocol_version: u8,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeResponse {
    pub challenge: String,
    pub expires_at_monotonic_ms: u64,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicJwk {
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
}

#[derive(Debug, Clone)]
pub struct KeyPair {
    signing: SigningKey,
}

impl KeyPair {
    pub fn generate() -> Self {
        Self {
            signing: SigningKey::random(&mut OsRng),
        }
    }

    pub fn public_jwk(&self) -> PublicJwk {
        public_jwk(&self.signing.verifying_key())
    }

    pub fn private_bytes(&self) -> [u8; 32] {
        self.signing.to_bytes().into()
    }

    #[allow(dead_code)]
    pub fn sign(&self, payload: &Value) -> Result<SignedCommand> {
        let raw = canonical_bytes(payload);
        let mut message = COMMAND_DOMAIN.to_vec();
        message.extend_from_slice(&raw);
        let mut signature: Signature = self.signing.sign(&message);
        if let Some(normalized) = signature.normalize_s() {
            signature = normalized;
        }
        Ok(SignedCommand {
            algorithm: ALGORITHM.to_owned(),
            payload: URL_SAFE_NO_PAD.encode(raw),
            protocol_version: PROTOCOL_VERSION,
            signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        })
    }
}

pub fn public_jwk(key: &VerifyingKey) -> PublicJwk {
    let encoded = key.to_encoded_point(false);
    PublicJwk {
        kty: "EC".to_owned(),
        crv: "P-256".to_owned(),
        x: URL_SAFE_NO_PAD.encode(encoded.x().expect("x coordinate")),
        y: URL_SAFE_NO_PAD.encode(encoded.y().expect("y coordinate")),
    }
}

pub fn verifying_key(jwk: &PublicJwk) -> Result<VerifyingKey> {
    if jwk.kty != "EC" || jwk.crv != "P-256" {
        bail!("only EC P-256 public JWKs are accepted")
    }
    let x = URL_SAFE_NO_PAD.decode(&jwk.x).context("invalid JWK x")?;
    let y = URL_SAFE_NO_PAD.decode(&jwk.y).context("invalid JWK y")?;
    if x.len() != 32 || y.len() != 32 {
        bail!("P-256 coordinates must be 32 bytes")
    }
    let mut x_field = FieldBytes::default();
    let mut y_field = FieldBytes::default();
    x_field.copy_from_slice(&x);
    y_field.copy_from_slice(&y);
    let encoded = EncodedPoint::from_affine_coordinates(&x_field, &y_field, false);
    let public = PublicKey::from_encoded_point(&encoded)
        .into_option()
        .ok_or_else(|| anyhow!("invalid P-256 public point"))?;
    Ok(VerifyingKey::from(public))
}

pub fn fingerprint(jwk: &PublicJwk) -> Result<String> {
    let key = verifying_key(jwk)?;
    let bytes = key.to_encoded_point(false);
    let digest = Sha256::digest(bytes.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(digest))
}

pub fn parse_and_verify(
    envelope_bytes: &[u8],
    serial: &str,
    public_key: &PublicJwk,
    challenges: &mut ChallengeStore,
    now_ms: u64,
) -> Result<CommandPayload> {
    if envelope_bytes.len() > MAX_CONTROL_BYTES {
        bail!("control message exceeds 4 KiB")
    }
    let envelope: SignedCommand =
        serde_json::from_slice(envelope_bytes).context("invalid command envelope")?;
    if envelope.protocol_version != PROTOCOL_VERSION || envelope.algorithm != ALGORITHM {
        bail!("unsupported protocol or signature algorithm")
    }
    let raw = URL_SAFE_NO_PAD
        .decode(envelope.payload.as_bytes())
        .context("invalid payload base64url")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(envelope.signature.as_bytes())
        .context("invalid signature base64url")?;
    if signature_bytes.len() != 64 {
        bail!("signature must be fixed 64-byte r||s")
    }
    let signature = Signature::from_slice(&signature_bytes).context("invalid P-256 signature")?;
    if signature.normalize_s().is_some() {
        bail!("high-S signatures are rejected")
    }
    let key = verifying_key(public_key)?;
    let mut message = COMMAND_DOMAIN.to_vec();
    message.extend_from_slice(&raw);
    key.verify(&message, &signature)
        .map_err(|_| anyhow!("signature rejected"))?;
    let payload: CommandPayload = serde_json::from_slice(&raw).context("invalid signed payload")?;
    if !integer_json(&serde_json::from_slice::<Value>(&raw)?) {
        bail!("fractional protocol number");
    }
    if canonical_bytes(&serde_json::to_value(&payload)?) != raw {
        bail!("signed payload is not canonical JSON")
    }
    if payload.protocol_version != PROTOCOL_VERSION || payload.device_serial != serial {
        bail!("wrong protocol version or device serial")
    }
    if !challenges.consume(&payload.challenge, now_ms) {
        bail!("challenge missing, expired or already used")
    }
    Ok(payload)
}

fn integer_json(value: &Value) -> bool {
    match value {
        Value::Number(number) => number.is_i64() || number.is_u64(),
        Value::Array(values) => values.iter().all(integer_json),
        Value::Object(values) => values.values().all(integer_json),
        _ => true,
    }
}

#[derive(Debug, Clone)]
struct StoredChallenge {
    value: String,
    expires_at_ms: u64,
}

#[derive(Debug, Default, Clone)]
pub struct ChallengeStore {
    entries: VecDeque<StoredChallenge>,
}

impl ChallengeStore {
    #[allow(dead_code)]
    pub fn issue(&mut self, now_ms: u64) -> ChallengeResponse {
        self.issue_for(None, now_ms)
    }

    pub fn issue_for(&mut self, request_id: Option<String>, now_ms: u64) -> ChallengeResponse {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let challenge = URL_SAFE_NO_PAD.encode(bytes);
        if self.entries.len() >= MAX_CHALLENGES {
            self.entries.pop_front();
        }
        let expires = now_ms + CHALLENGE_TTL_MS;
        self.entries.push_back(StoredChallenge {
            value: challenge.clone(),
            expires_at_ms: expires,
        });
        ChallengeResponse {
            challenge,
            expires_at_monotonic_ms: expires,
            request_id: request_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        }
    }

    pub fn consume(&mut self, value: &str, now_ms: u64) -> bool {
        self.entries.retain(|entry| entry.expires_at_ms > now_ms);
        if let Some(index) = self.entries.iter().position(|entry| entry.value == value) {
            self.entries.remove(index);
            true
        } else {
            false
        }
    }
}

pub fn build_state_topic(serial: &str, namespace: &str) -> String {
    format!("{}/{serial}/state", namespace.trim_end_matches('/'))
}

pub fn build_result_topic(serial: &str, namespace: &str) -> String {
    format!("{}/{serial}/result", namespace.trim_end_matches('/'))
}

pub fn build_challenge_response_topic(serial: &str, namespace: &str) -> String {
    format!(
        "{}/{serial}/challenge/response",
        namespace.trim_end_matches('/')
    )
}

pub fn build_availability_topic(serial: &str, namespace: &str) -> String {
    format!("{}/{serial}/availability", namespace.trim_end_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generated_signature_round_trips_and_challenge_is_single_use() {
        let pair = KeyPair::generate();
        let mut challenges = ChallengeStore::default();
        let challenge = challenges.issue(100);
        let payload = json!({
            "arguments": {"deadline_utc": 1_700_000_100, "task_id": "task-1"},
            "challenge": challenge.challenge,
            "command_id": "op-1",
            "device_serial": "SIM-001",
            "operation": "start_timed_lock",
            "protocol_version": 1
        });
        let envelope = pair.sign(&payload).unwrap();
        let raw = serde_json::to_vec(&envelope).unwrap();
        let decoded =
            parse_and_verify(&raw, "SIM-001", &pair.public_jwk(), &mut challenges, 101).unwrap();
        assert_eq!(decoded.command_id, "op-1");
        assert!(
            parse_and_verify(&raw, "SIM-001", &pair.public_jwk(), &mut challenges, 101).is_err()
        );
    }

    #[test]
    fn verification_rejects_wrong_key_serial_tampering_and_unknown_operation() {
        let pair = KeyPair::generate();
        let other = KeyPair::generate();
        let payload = json!({
            "arguments": {"task_id": "task-1"},
            "challenge": "challenge-1",
            "command_id": "op-1",
            "device_serial": "SIM-001",
            "operation": "start_constant_lock",
            "protocol_version": 1
        });
        let envelope = pair.sign(&payload).unwrap();
        let raw = serde_json::to_vec(&envelope).unwrap();
        let mut wrong_key_challenges = ChallengeStore::default();
        wrong_key_challenges.entries.push_back(StoredChallenge {
            value: "challenge-1".into(),
            expires_at_ms: 100,
        });
        assert!(parse_and_verify(
            &raw,
            "SIM-001",
            &other.public_jwk(),
            &mut wrong_key_challenges,
            1
        )
        .is_err());

        let mut wrong_serial_challenges = ChallengeStore::default();
        wrong_serial_challenges.entries.push_back(StoredChallenge {
            value: "challenge-1".into(),
            expires_at_ms: 100,
        });
        assert!(parse_and_verify(
            &raw,
            "SIM-002",
            &pair.public_jwk(),
            &mut wrong_serial_challenges,
            1
        )
        .is_err());

        let mut tampered = envelope.clone();
        tampered.payload.push('A');
        let mut tampered_challenges = ChallengeStore::default();
        tampered_challenges.entries.push_back(StoredChallenge {
            value: "challenge-1".into(),
            expires_at_ms: 100,
        });
        assert!(parse_and_verify(
            &serde_json::to_vec(&tampered).unwrap(),
            "SIM-001",
            &pair.public_jwk(),
            &mut tampered_challenges,
            1
        )
        .is_err());

        let unknown_payload = json!({
            "arguments": {},
            "challenge": "challenge-2",
            "command_id": "op-2",
            "device_serial": "SIM-001",
            "operation": "unknown_operation",
            "protocol_version": 1
        });
        let unknown = pair.sign(&unknown_payload).unwrap();
        let mut unknown_challenges = ChallengeStore::default();
        unknown_challenges.entries.push_back(StoredChallenge {
            value: "challenge-2".into(),
            expires_at_ms: 100,
        });
        assert!(parse_and_verify(
            &serde_json::to_vec(&unknown).unwrap(),
            "SIM-001",
            &pair.public_jwk(),
            &mut unknown_challenges,
            1
        )
        .is_err());
    }

    #[test]
    fn oversized_control_message_is_rejected_before_parsing() {
        let mut challenges = ChallengeStore::default();
        let error = parse_and_verify(
            &vec![b'x'; MAX_CONTROL_BYTES + 1],
            "SIM-001",
            &KeyPair::generate().public_jwk(),
            &mut challenges,
            0,
        )
        .unwrap_err();
        assert!(error.to_string().contains("4 KiB"));
    }

    #[test]
    fn challenge_expiry_and_capacity_are_enforced() {
        let mut challenges = ChallengeStore::default();
        let first = challenges.issue(0);
        assert!(!challenges.consume(&first.challenge, CHALLENGE_TTL_MS));
        for _ in 0..(MAX_CHALLENGES + 1) {
            challenges.issue(0);
        }
        assert!(!challenges.consume(&first.challenge, 0));
    }

    #[test]
    fn shared_protocol_vector_verifies() {
        let vector: Value =
            serde_json::from_str(include_str!("../tests/protocol_vectors.json")).unwrap();
        let command = vector.get("command_vector").unwrap();
        let payload = command.get("payload").unwrap();
        let envelope = json!({
            "protocol_version": PROTOCOL_VERSION,
            "algorithm": ALGORITHM,
            "payload": command.get("payload_base64url").unwrap(),
            "signature": command.get("signature_base64url").unwrap(),
        });
        let public: PublicJwk = serde_json::from_value(command["public_jwk"].clone()).unwrap();
        let challenge = payload["challenge"].as_str().unwrap().to_owned();
        let mut challenges = ChallengeStore::default();
        challenges.entries.push_back(StoredChallenge {
            value: challenge,
            expires_at_ms: CHALLENGE_TTL_MS,
        });
        let decoded = parse_and_verify(
            &serde_json::to_vec(&envelope).unwrap(),
            "SIM-001",
            &public,
            &mut challenges,
            1,
        )
        .unwrap();
        assert_eq!(decoded.command_id, "vector-operation-1");
    }
}
