use serde_json::{Map, Value};

/// Deterministic JSON encoding shared with the Dart package. Objects sort keys
/// lexicographically, arrays retain order, and no whitespace is emitted.
pub fn canonical(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => serde_json::to_string(value).expect("string is serializable"),
        Value::Array(values) => {
            let values = values.iter().map(canonical).collect::<Vec<_>>().join(",");
            format!("[{values}]")
        }
        Value::Object(values) => canonical_object(values),
    }
}

fn canonical_object(values: &Map<String, Value>) -> String {
    let mut keys = values.keys().collect::<Vec<_>>();
    keys.sort();
    let fields = keys
        .into_iter()
        .map(|key| {
            format!(
                "{}:{}",
                serde_json::to_string(key).unwrap(),
                canonical(&values[key])
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("{{{fields}}}")
}

pub fn canonical_bytes(value: &Value) -> Vec<u8> {
    canonical(value).into_bytes()
}
