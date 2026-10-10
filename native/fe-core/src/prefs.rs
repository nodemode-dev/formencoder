use std::fs;
use std::sync::{Mutex, OnceLock};

use serde_json::{Map, Value, json};

use crate::paths;
use crate::util::Res;

pub fn defaults() -> Value {
    json!({
        "parallel": true, "maxParallel": 3, "autoStartIdle": false, "autoStartMinutes": 2.0, "autoEncodeWatch": true,
        "watchInterval": 2.0, "watchSettle": 4.0, "watchSequences": true, "watchSequenceWait": 6.0,
        "outputFolder": "", "outputBesideSource": true, "incrementNames": true, "removeCompletedOnExit": false,
        "chime": true, "notify": "queue", "previewWhileEncoding": true, "stopOnDecodeErrors": false, "skipMissing": true,
        "stillDuration": 5.0, "ffmpegDir": "", "threads": 0, "hardware": "auto", "defaultPreset": "system/match-source-high", "logFolder": "",
        "hwDecode": "off", "cacheFolder": "", "cacheLimitGB": 20.0, "memoryReserveGB": 4.0
    })
}

pub fn descriptions() -> Value {
    json!({
        "parallel": "Encode the outputs of one source at the same time (Enable Parallel Encoding)",
        "maxParallel": "How many outputs encode at once",
        "autoStartIdle": "Start the queue automatically when idle",
        "autoStartMinutes": "Minutes of idle time before the queue starts",
        "autoEncodeWatch": "Encode watch folder items as soon as they arrive (Auto-Encode Watch Folders)",
        "watchInterval": "Seconds between watch folder scans",
        "watchSettle": "Seconds a dropped file must stay unchanged before it is queued",
        "watchSequences": "Import numbered images in a watch folder as one image sequence",
        "watchSequenceWait": "Seconds to wait for more frames of an image sequence",
        "outputFolder": "Default output folder (empty: beside the source)",
        "outputBesideSource": "Write outputs beside their source when no folder is set",
        "incrementNames": "Add a number to the output name when a file of that name exists, instead of replacing it",
        "removeCompletedOnExit": "Remove finished items from the queue when formencoder quits",
        "chime": "Play a chime when encoding finishes",
        "notify": "Notify for each item, for the whole queue, or never (item, queue, never)",
        "previewWhileEncoding": "Show the frame being encoded in the Encoding panel",
        "stopOnDecodeErrors": "Stop the current item when the source has decode errors",
        "skipMissing": "Do not encode outputs whose source, LUT or overlay files are missing",
        "stillDuration": "Seconds a still image lasts when encoded to a movie",
        "ffmpegDir": "Folder holding the ffmpeg to use (empty: formencoder's own, then the system's)",
        "threads": "Threads per encode (0: ffmpeg decides)",
        "hardware": "Default Performance for H.264 and HEVC (auto, on, off)",
        "defaultPreset": "Preset given to sources added without one",
        "logFolder": "Folder for the encoding and error logs (empty: the data folder's logs)",
        "hwDecode": "Decode sources on the GPU when it can (auto, off)",
        "cacheFolder": "Media cache folder for previews, thumbnails, plans and work files (empty: the data folder's cache)",
        "cacheLimitGB": "Largest size the media cache may grow to before the oldest files are removed",
        "memoryReserveGB": "Memory to leave for other applications: no further parallel encode starts while less than this is free"
    })
}

fn cache() -> &'static Mutex<Option<Value>> {
    static C: OnceLock<Mutex<Option<Value>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

fn file() -> std::path::PathBuf {
    paths::data_dir().join("preferences.json")
}

pub fn load() -> Value {
    if let Some(v) = cache().lock().unwrap().clone() {
        return v;
    }
    let mut out = defaults();
    if let Ok(text) = fs::read_to_string(file()) {
        if let Ok(Value::Object(stored)) = serde_json::from_str::<Value>(&text) {
            for (k, v) in stored {
                if out.get(&k).is_some() {
                    out[&k] = v;
                }
            }
        }
    }
    *cache().lock().unwrap() = Some(out.clone());
    out
}

pub fn save(patch: &Map<String, Value>) -> Res {
    let mut cur = load();
    let d = defaults();
    let unknown: Vec<&String> = patch.keys().filter(|k| d.get(k.as_str()).is_none()).collect();
    if !unknown.is_empty() {
        return Err(format!("unknown preference {}; prefs.get lists them", unknown.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")));
    }
    for (k, v) in patch {
        let coerced = match &d[k] {
            Value::Bool(_) => json!(v.as_bool().unwrap_or_else(|| v.as_str().map(|s| s == "true").unwrap_or(false))),
            Value::Number(n) if n.is_f64() => json!(v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).unwrap_or(0.0)),
            Value::Number(_) => json!(v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).unwrap_or(0.0) as i64),
            _ => json!(match v { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() }),
        };
        cur[k] = coerced;
    }
    fs::write(file(), serde_json::to_string_pretty(&cur).unwrap_or_default()).map_err(|e| e.to_string())?;
    *cache().lock().unwrap() = Some(cur.clone());
    Ok(cur)
}

pub fn reset() -> Value {
    let d = defaults();
    let _ = fs::write(file(), serde_json::to_string_pretty(&d).unwrap_or_default());
    *cache().lock().unwrap() = Some(d.clone());
    d
}
