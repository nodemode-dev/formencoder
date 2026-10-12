use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;

use serde_json::{Value, json};

use crate::paths;
use crate::util::{Res, new_id, now};

pub const PROTOCOL: i64 = 1;
pub const EVENTS: &[&str] = &["afterEncode", "publish", "command"];

pub fn dirs() -> Vec<PathBuf> {
    let mut out = vec![paths::sub("plugins")];
    if let Ok(v) = std::env::var("FORMENCODER_PLUGINS") {
        out.extend(std::env::split_paths(&v).filter(|p| !p.as_os_str().is_empty()));
    }
    out
}

fn read_manifest(folder: &Path) -> Option<Value> {
    let text = fs::read_to_string(folder.join("plugin.json")).ok()?;
    let mut m: Value = serde_json::from_str(&text).unwrap_or_else(|e| json!({"error": format!("plugin.json is not valid JSON: {e}")}));
    let id = m["id"].as_str().map(String::from).unwrap_or_else(|| folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
    m["id"] = json!(id);
    m["folder"] = json!(folder.to_string_lossy());
    let mut problems: Vec<String> = Vec::new();
    if m.get("error").is_some() {
        problems.push(m["error"].as_str().unwrap_or("").to_string());
    }
    if !m["run"].as_array().map(|a| !a.is_empty() && a.iter().all(Value::is_string)).unwrap_or(false) {
        problems.push("run must be a list of strings: the program and its arguments".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') || id.is_empty() {
        problems.push("id may use letters, digits, - and _".into());
    }
    for ev in m["events"].as_array().cloned().unwrap_or_default() {
        if !EVENTS.contains(&ev.as_str().unwrap_or("")) {
            problems.push(format!("unknown event {ev}; events: {}", EVENTS.join(", ")));
        }
    }
    m["valid"] = json!(problems.is_empty());
    m["problems"] = json!(problems);
    Some(m)
}

pub fn list() -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for d in dirs() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        let mut folders: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.join("plugin.json").is_file()).collect();
        folders.sort();
        for f in folders {
            if let Some(m) = read_manifest(&f) {
                if !out.iter().any(|x| x["id"] == m["id"]) {
                    out.push(m);
                }
            }
        }
    }
    out
}

pub fn get(id: &str) -> Res<Value> {
    let m = list().into_iter().find(|m| m["id"] == id).ok_or_else(|| format!("no plug-in {id:?}; plugin.list shows the installed ones and where they are looked for"))?;
    if !m["valid"].as_bool().unwrap_or(false) {
        return Err(format!("the plug-in {id} is not usable: {}", m["problems"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("; ")).unwrap_or_default()));
    }
    Ok(m)
}

pub fn handles(m: &Value, event: &str) -> bool {
    m["events"].as_array().map(|a| a.iter().any(|e| e == event)).unwrap_or(event == "afterEncode")
}

fn options_for(m: &Value, given: &Value) -> Value {
    let mut out = serde_json::Map::new();
    if let Some(spec) = m["options"].as_object() {
        for (k, v) in spec {
            out.insert(k.clone(), given.get(k).cloned().unwrap_or_else(|| v["default"].clone()));
        }
    }
    if let Some(g) = given.as_object() {
        for (k, v) in g {
            out.entry(k.clone()).or_insert(v.clone());
        }
    }
    Value::Object(out)
}

pub fn run(m: &Value, event: &str, mut payload: Value, report: &dyn Fn(f64, &str), stopped: &dyn Fn() -> bool) -> Res {
    let folder = PathBuf::from(m["folder"].as_str().unwrap_or("."));
    let argv: Vec<String> = m["run"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let program = {
        let p = folder.join(&argv[0]);
        if p.is_file() { p.to_string_lossy().into_owned() } else if cfg!(windows) && argv[0] == "python3" { "python".to_string() } else { argv[0].clone() }
    };
    let args: Vec<String> = argv[1..].iter().map(|a| if folder.join(a).exists() { folder.join(a).to_string_lossy().into_owned() } else { a.clone() }).collect();
    payload["protocol"] = json!(PROTOCOL);
    payload["event"] = json!(event);
    payload["plugin"] = json!({"id": m["id"], "version": m["version"], "folder": m["folder"]});
    payload["options"] = options_for(m, &payload["options"]);
    payload["formencoder"] = json!({"version": crate::VERSION, "dataFolder": paths::data_dir().to_string_lossy()});
    let mut cmd = Command::new(&program);
    cmd.args(&args).current_dir(&folder).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("the plug-in {} could not start {program}: {e}", m["id"].as_str().unwrap_or("")))?;
    if let Some(mut stdin) = child.stdin.take() {
        let text = serde_json::to_string(&payload).unwrap_or_default();
        thread::spawn(move || {
            let _ = stdin.write_all(text.as_bytes());
            let _ = stdin.write_all(b"\n");
        });
    }
    let mut err = child.stderr.take();
    let err_thread = thread::spawn(move || {
        let mut s = String::new();
        if let Some(e) = err.as_mut() {
            let _ = e.read_to_string(&mut s);
        }
        s
    });
    let mut result: Option<Value> = None;
    let mut error: Option<String> = None;
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if stopped() {
                let _ = child.kill();
                break;
            }
            let Ok(v) = serde_json::from_str::<Value>(line.trim()) else { continue };
            if let Some(p) = v["progress"].as_f64() {
                report(p.clamp(0.0, 1.0), v["message"].as_str().unwrap_or("running the plug-in"));
            }
            if v.get("result").is_some() {
                result = Some(v["result"].clone());
            }
            if let Some(e) = v["error"].as_str() {
                error = Some(e.to_string());
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr = err_thread.join().unwrap_or_default();
    if stopped() {
        return Err("stopped".into());
    }
    if let Some(e) = error {
        return Err(format!("the plug-in {} reported: {e}", m["id"].as_str().unwrap_or("")));
    }
    if !status.success() {
        return Err(format!("the plug-in {} exited with {}: {}", m["id"].as_str().unwrap_or(""), status.code().unwrap_or(-1), stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim()));
    }
    Ok(result.unwrap_or(json!({})))
}

pub fn after_encode(s: &Value, files: &[String], output: &Value, report: &dyn Fn(f64, &str), stopped: &dyn Fn() -> bool) -> Res<(Vec<String>, Vec<String>)> {
    let mut added = Vec::new();
    let mut notes = Vec::new();
    for entry in s["plugins"].as_array().cloned().unwrap_or_default() {
        if !entry["enabled"].as_bool().unwrap_or(true) {
            continue;
        }
        let id = entry["id"].as_str().unwrap_or("");
        let m = get(id)?;
        if !handles(&m, "afterEncode") {
            return Err(format!("the plug-in {id} does not take afterEncode"));
        }
        report(0.99, &format!("running the plug-in {id}"));
        let r = run(&m, "afterEncode", json!({"files": files, "output": output, "settings": s, "options": entry["options"]}), report, stopped)?;
        added.extend(r["files"].as_array().cloned().unwrap_or_default().iter().filter_map(|f| f.as_str()).filter(|f| Path::new(f).is_file()).map(String::from));
        notes.extend(r["notes"].as_array().cloned().unwrap_or_default().iter().filter_map(|n| n.as_str()).map(|n| format!("{id}: {n}")));
    }
    Ok((added, notes))
}

fn runs() -> &'static Mutex<HashMap<String, Value>> {
    static R: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn start_command(id: &str, command: &str, params: Value) -> Res {
    let m = get(id)?;
    if !handles(&m, "command") {
        return Err(format!("the plug-in {id} has no commands"));
    }
    let known: Vec<String> = m["commands"].as_array().map(|a| a.iter().filter_map(|c| c["name"].as_str().map(String::from)).collect()).unwrap_or_default();
    if !known.is_empty() && !known.iter().any(|k| k == command) {
        return Err(format!("the plug-in {id} has no command {command:?}; it has {}", known.join(", ")));
    }
    let run_id = new_id("p");
    runs().lock().unwrap().insert(run_id.clone(), json!({"run": run_id, "plugin": id, "command": command, "status": "running", "started": now(), "progress": 0.0}));
    let rid = run_id.clone();
    let cmd = command.to_string();
    thread::Builder::new()
        .name(format!("formencoder-plugin-{id}"))
        .spawn(move || {
            let r2 = rid.clone();
            let report = move |p: f64, msg: &str| {
                if let Some(x) = runs().lock().unwrap().get_mut(&r2) {
                    x["progress"] = json!(p);
                    x["message"] = json!(msg);
                }
            };
            let outcome = run(&m, "command", json!({"command": cmd, "params": params}), &report, &|| false);
            if let Some(x) = runs().lock().unwrap().get_mut(&rid) {
                x["finished"] = json!(now());
                match outcome {
                    Ok(v) => {
                        x["status"] = json!("done");
                        x["result"] = v;
                        x["progress"] = json!(1.0);
                    }
                    Err(e) => {
                        x["status"] = json!("failed");
                        x["error"] = json!(e);
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(json!({"run": run_id, "status": "running"}))
}

pub fn result(run_id: &str) -> Res {
    runs().lock().unwrap().get(run_id).cloned().ok_or_else(|| format!("no plug-in run {run_id}"))
}
