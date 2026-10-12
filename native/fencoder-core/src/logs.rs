use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use serde_json::{Value, json};

use crate::util::{Res, local_stamp};
use crate::{paths, prefs};

pub fn folder() -> PathBuf {
    let custom = prefs::load()["logFolder"].as_str().unwrap_or("").to_string();
    if !custom.trim().is_empty() {
        let p = PathBuf::from(paths::expand(custom.trim()));
        let _ = fs::create_dir_all(&p);
        return p;
    }
    paths::sub("logs")
}

pub fn path(kind: &str) -> Res<PathBuf> {
    match kind {
        "encoding" => Ok(folder().join("formencoder_encoding_log.txt")),
        "error" => Ok(folder().join("formencoder_error_log.txt")),
        _ => Err("log kind is encoding or error".into()),
    }
}

fn append(kind: &str, lines: &[String]) {
    if let Ok(p) = path(kind) {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "{}\n", lines.join("\n").trim_end());
        }
    }
}

pub fn entry(item: &Value, output: &Value, rt: &Value) {
    let status = rt["status"].as_str().unwrap_or("");
    let s = &output["settings"];
    let head = match status {
        "done" => "Encoding succeeded",
        "failed" => "Encoding failed",
        "stopped" => "Encoding stopped by the user",
        other => other,
    };
    let mut lines = vec![
        format!("{} : {head}", local_stamp("%m/%d/%Y %I:%M:%S %p")),
        "------------------------------------------------------------".into(),
        format!("Source: {}", item["path"].as_str().or(item["name"].as_str()).unwrap_or("")),
        format!("Output File: {}", rt["path"].as_str().or(output["path"].as_str()).unwrap_or("")),
        format!("Format: {}  Preset: {}", s["format"].as_str().unwrap_or(output["kind"].as_str().unwrap_or("")), s["presetName"].as_str().unwrap_or("")),
        format!("Video: {}", rt["summary"]["video"].as_str().unwrap_or("")),
        format!("Audio: {}", rt["summary"]["audio"].as_str().unwrap_or("")),
        format!("Encoder: {}  Audio encoder: {}", rt["encoder"].as_str().unwrap_or("-"), rt["audioEncoder"].as_str().unwrap_or("-")),
        format!("Encoding Time: {:.2} s  Size: {} bytes", rt["elapsed"].as_f64().unwrap_or(0.0), rt["bytes"].as_i64().unwrap_or(0)),
    ];
    for n in rt["notes"].as_array().cloned().unwrap_or_default() {
        lines.push(format!("Note: {}", n.as_str().unwrap_or("")));
    }
    if let Some(e) = rt["error"].as_str() {
        lines.push(format!("Error: {e}"));
    }
    if let Some(f) = rt["ffmpeg"].as_str() {
        lines.push(format!("FFmpeg said:\n{f}"));
    }
    append("encoding", &lines);
    if status == "failed" || status == "stopped" {
        append("error", &lines);
    }
}

pub fn read(kind: &str, limit: usize) -> Res {
    let p = path(kind)?;
    let text = fs::read_to_string(&p).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(limit.max(1));
    Ok(json!({"kind": kind, "path": p.to_string_lossy(), "lines": lines[start..], "total": lines.len()}))
}

pub fn clear(kind: &str) -> Res {
    let p = path(kind)?;
    fs::write(&p, "").map_err(|e| e.to_string())?;
    Ok(json!({"cleared": p.to_string_lossy()}))
}
