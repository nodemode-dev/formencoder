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

pub fn uuid4() -> String {
    use md5::{Digest, Md5};
    use std::hash::{BuildHasher, Hasher};
    let mut seed = std::collections::hash_map::RandomState::new().build_hasher();
    seed.write_u64(SEQ.fetch_add(1, Ordering::Relaxed));
    seed.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    seed.write_u32(std::process::id());
    let mut h = Md5::new();
    h.update(seed.finish().to_le_bytes());
    h.update(std::collections::hash_map::RandomState::new().build_hasher().finish().to_le_bytes());
    let mut b: [u8; 16] = h.finalize().into();
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let x: String = b.iter().map(|v| format!("{v:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &x[0..8], &x[8..12], &x[12..16], &x[16..20], &x[20..32])
}

pub fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
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

#[cfg(target_os = "linux")]
pub fn available_memory() -> Option<u64> {
    let text = std::fs::read_to_string("/proc/meminfo").ok()?;
    let line = text.lines().find(|l| l.starts_with("MemAvailable:"))?;
    let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb * 1024)
}

#[cfg(target_os = "macos")]
pub fn available_memory() -> Option<u64> {
    let out = std::process::Command::new("vm_stat").output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let page: u64 = text.lines().next().and_then(|l| l.split("page size of ").nth(1)).and_then(|r| r.split_whitespace().next()).and_then(|n| n.parse().ok()).unwrap_or(16384);
    let pages = |name: &str| -> u64 { text.lines().find(|l| l.starts_with(name)).and_then(|l| l.rsplit(':').next()).map(|v| v.trim().trim_end_matches('.').parse().unwrap_or(0)).unwrap_or(0) };
    Some((pages("Pages free") + pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable")) * page)
}

#[cfg(windows)]
pub fn available_memory() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut st: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    st.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut st) } != 0 { Some(st.ullAvailPhys) } else { None }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
pub fn available_memory() -> Option<u64> {
    None
}

pub fn fmt_g(x: f64) -> String {
    if (x - x.round()).abs() < 1e-9 {
        format!("{}", x.round() as i64)
    } else {
        let t = format!("{x:.6}");
        t.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}
