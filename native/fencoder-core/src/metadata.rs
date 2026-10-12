use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value, json};

use crate::paths;
use crate::util::{Res, file_safe};

pub const CATEGORIES: &[(&str, &str, &[&str])] = &[
    ("descriptive", "Title, creator, description, keywords", &["title", "artist", "author", "album", "album_artist", "comment", "description", "synopsis", "keywords", "genre", "show", "episode_id", "network", "composer", "grouping"]),
    ("rights", "Copyright and licence", &["copyright", "license", "licence", "rights"]),
    ("dates", "Creation and recording dates", &["creation_time", "date", "year", "com.apple.quicktime.creationdate"]),
    ("camera", "Camera make, model and settings", &["make", "model", "com.apple.quicktime.make", "com.apple.quicktime.model", "com.apple.quicktime.software", "com.android.manufacturer", "com.android.model", "lens", "software"]),
    ("location", "GPS position and place names", &["location", "location-eng", "com.apple.quicktime.location.iso6709", "com.apple.quicktime.location.name", "com.android.capture.location", "xyz"]),
    ("technical", "Encoder and handler names", &["encoder", "encoded_by", "handler_name", "major_brand", "minor_version", "compatible_brands", "vendor_id"]),
];

pub fn category_of(key: &str) -> &'static str {
    let k = key.to_lowercase();
    for (id, _, keys) in CATEGORIES {
        if keys.iter().any(|x| *x == k) || (*id == "location" && k.contains("location")) || (*id == "camera" && (k.ends_with(".make") || k.ends_with(".model"))) {
            return id;
        }
    }
    "other"
}

fn folder() -> PathBuf {
    paths::sub("metadata")
}

pub fn list_templates() -> Vec<Value> {
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(folder()) {
        let mut files: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| e == "json").unwrap_or(false)).collect();
        files.sort();
        for f in files {
            if let Ok(v) = fs::read_to_string(&f).map_err(|e| e.to_string()).and_then(|t| serde_json::from_str::<Value>(&t).map_err(|e| e.to_string())) {
                out.push(json!({"name": v["name"].as_str().unwrap_or(""), "fields": v["fields"], "file": f.to_string_lossy()}));
            }
        }
    }
    out
}

pub fn template(name: &str) -> Option<Value> {
    list_templates().into_iter().find(|t| t["name"].as_str().map(|n| n.eq_ignore_ascii_case(name)).unwrap_or(false))
}

pub fn save_template(name: &str, fields: &Value) -> Res {
    let name = name.trim();
    if name.is_empty() {
        return Err("give the template a name".into());
    }
    let clean: Map<String, Value> = fields.as_object().map(|m| m.iter().filter(|(_, v)| v.is_string() && !v.as_str().unwrap().is_empty()).map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
    let dir = folder();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.json", file_safe(name)));
    fs::write(&file, serde_json::to_string_pretty(&json!({"name": name, "fields": clean})).unwrap()).map_err(|e| e.to_string())?;
    Ok(json!({"name": name, "fields": clean, "file": file.to_string_lossy()}))
}

pub fn delete_template(name: &str) -> Res {
    let t = template(name).ok_or_else(|| format!("no metadata template {name:?}"))?;
    fs::remove_file(t["file"].as_str().unwrap_or("")).map_err(|e| e.to_string())?;
    Ok(json!({"deleted": t["name"]}))
}

pub fn resolve(meta: &Value, source_tags: &Value, carries_source: bool) -> Vec<(String, String)> {
    let mode = meta["mode"].as_str().unwrap_or("retain");
    let rules = &meta["rules"];
    let keep: Vec<String> = rules["keep"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let drop: Vec<String> = rules["drop"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let mut out: Vec<(String, String)> = Vec::new();
    if mode != "clear" && carries_source {
        if let Some(tags) = source_tags.as_object() {
            for (k, v) in tags {
                let cat = category_of(k);
                if cat == "technical" {
                    continue;
                }
                if !keep.is_empty() && !keep.iter().any(|c| c == cat) {
                    continue;
                }
                if drop.iter().any(|c| c == cat) {
                    continue;
                }
                let val = match v { Value::String(s) => s.clone(), other => other.to_string() };
                if !val.is_empty() {
                    out.push((k.clone(), val));
                }
            }
        }
    }
    let mut set = |k: &str, v: &str| {
        out.retain(|(x, _)| !x.eq_ignore_ascii_case(k));
        if !v.is_empty() {
            out.push((k.to_string(), v.to_string()));
        }
    };
    if let Some(name) = meta["template"].as_str().filter(|n| !n.is_empty()) {
        if let Some(t) = template(name) {
            if let Some(f) = t["fields"].as_object() {
                for (k, v) in f {
                    set(k, v.as_str().unwrap_or(""));
                }
            }
        }
    }
    if let Some(f) = meta["fields"].as_object() {
        for (k, v) in f {
            let val = match v { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() };
            if !val.is_empty() {
                set(k, &val);
            }
        }
    }
    out
}
