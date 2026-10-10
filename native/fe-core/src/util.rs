use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

pub type Res<T = Value> = Result<T, String>;

static SEQ: AtomicU64 = AtomicU64::new(1);

pub fn now() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

pub fn new_id(prefix: &str) -> String {
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    let t = (now() * 1000.0) as u64;
    format!("{prefix}{:x}{:03x}", t & 0xff_ffff, n & 0xfff)
}

pub fn s<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

pub fn f(v: &Value, key: &str) -> Option<f64> {
    match v.get(key) {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(t)) => t.trim().parse().ok(),
        _ => None,
    }
}

pub fn i(v: &Value, key: &str) -> Option<i64> {
    f(v, key).map(|x| x.round() as i64)
}

pub fn b(v: &Value, key: &str) -> Option<bool> {
    match v.get(key) {
        Some(Value::Bool(x)) => Some(*x),
        Some(Value::Number(n)) => Some(n.as_f64().unwrap_or(0.0) != 0.0),
        Some(Value::String(t)) => Some(matches!(t.as_str(), "true" | "1" | "yes" | "on")),
        _ => None,
    }
}

pub fn num(x: f64) -> Value {
    serde_json::Number::from_f64(x).map(Value::Number).unwrap_or(Value::Null)
}

pub fn deep_merge(base: &Value, patch: &Value) -> Value {
    match (base, patch) {
        (Value::Object(a), Value::Object(p)) => {
            let mut out = a.clone();
            for (k, v) in p {
                let merged = match (out.get(k), v) {
                    (Some(old @ Value::Object(_)), Value::Object(_)) if k != "fields" => deep_merge(old, v),
                    _ => v.clone(),
                };
                out.insert(k.clone(), merged);
            }
            Value::Object(out)
        }
        _ => patch.clone(),
    }
}

pub fn get_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    let mut node = v;
    for part in path.split('.') {
        node = node.get(part)?;
    }
    Some(node)
}

pub fn set_path(v: &mut Value, path: &str, value: Value) {
    let parts: Vec<&str> = path.split('.').collect();
    let mut node = v;
    for part in &parts[..parts.len() - 1] {
        if !node.get(*part).map(Value::is_object).unwrap_or(false) {
            if let Value::Object(m) = node {
                m.insert((*part).to_string(), Value::Object(Map::new()));
            }
        }
        node = node.get_mut(*part).expect("object just inserted");
    }
    if let Value::Object(m) = node {
        m.insert(parts[parts.len() - 1].to_string(), value);
    }
}

pub fn obj() -> Value {
    Value::Object(Map::new())
}

pub fn file_safe(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if "\\/:*?\"<>|".contains(c) { '-' } else { c }).collect();
    cleaned.trim().to_string()
}

pub fn local_stamp(fmt: &str) -> String {
    chrono::Local::now().format(fmt).to_string()
}

pub fn rate_str(fps: f64) -> String {
    let table = [(23.976, "24000/1001"), (29.97, "30000/1001"), (59.94, "60000/1001"), (47.952, "48000/1001"), (119.88, "120000/1001")];
    for (k, r) in table {
        if (fps - k).abs() < 0.002 {
            return r.to_string();
        }
    }
    fmt_g(fps)
}

pub fn fmt_g(x: f64) -> String {
    if (x - x.round()).abs() < 1e-9 {
        format!("{}", x.round() as i64)
    } else {
        let t = format!("{x:.6}");
        t.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}
