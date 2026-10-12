use super::*;

pub(super) fn log_read(_: &mut Engine, p: &Value) -> Res {
    logs::read(s(p, "kind").unwrap_or("encoding"), p["limit"].as_u64().unwrap_or(300) as usize)
}

pub(super) fn log_clear(_: &mut Engine, p: &Value) -> Res {
    logs::clear(s(p, "kind").unwrap_or("encoding"))
}

pub(super) fn prefs_get(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"prefs": prefs::load(), "describe": prefs::descriptions(), "dataDir": paths::data_dir().to_string_lossy()}))
}

pub(super) fn prefs_set(e: &mut Engine, p: &Value) -> Res {
    let vals = p["values"].as_object().ok_or("values is an object")?;
    let out = prefs::save(vals)?;
    if vals.contains_key("ffmpegDir") {
        ffmpeg::set_custom_dir(out["ffmpegDir"].as_str());
        encoders::detect(true);
        *e.encoder_status.lock().unwrap() = Some(encoders::status());
    }
    Ok(json!({"prefs": out}))
}

pub const RESERVED_KEYS: &[&str] = &["Cmd+K", "Cmd+Shift+P", "`", "Cmd+,"];

pub fn normalize_combo(text: &str) -> Res<String> {
    let t = text.trim();
    if t.is_empty() {
        return Ok(String::new());
    }
    let (mut ctrl, mut cmd, mut alt, mut shift) = (false, false, false, false);
    let mut key: Option<String> = None;
    let parts: Vec<&str> = if t == "+" { vec!["+"] } else { t.split('+').map(str::trim).filter(|p| !p.is_empty()).collect() };
    for p in parts {
        match p.to_lowercase().as_str() {
            "cmd" | "command" | "meta" | "mod" | "primary" | "super" => cmd = true,
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" | "opt" => alt = true,
            "shift" => shift = true,
            _ => {
                if key.is_some() {
                    return Err(format!("{text:?} has more than one key; use modifiers (Cmd, Ctrl, Alt, Shift) and one key"));
                }
                let k = if p.chars().count() == 1 { p.to_uppercase() } else { let mut c = p.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() };
                key = Some(k);
            }
        }
    }
    let key = key.ok_or_else(|| format!("{text:?} has no key"))?;
    let mut out: Vec<String> = Vec::new();
    if ctrl {
        out.push("Ctrl".into());
    }
    if cmd {
        out.push("Cmd".into());
    }
    if alt {
        out.push("Alt".into());
    }
    if shift {
        out.push("Shift".into());
    }
    out.push(key);
    Ok(out.join("+"))
}

pub(super) fn shortcuts_list(_: &mut Engine, _: &Value) -> Res {
    let rows: Vec<Value> = all().iter().filter(|c| !c.menu.is_empty()).map(|c| json!({"id": c.id, "label": c.label, "menu": c.menu, "shortcut": c.shortcut_now(), "default": c.shortcut, "changed": c.shortcut_now() != c.shortcut})).collect();
    Ok(json!({"shortcuts": rows, "reserved": RESERVED_KEYS}))
}

pub(super) fn shortcuts_set(_: &mut Engine, p: &Value) -> Res {
    let id = s(p, "command").ok_or("pass command")?;
    let cmd = all().iter().find(|c| c.id == id).ok_or_else(|| format!("no command {id}"))?;
    let mut map = prefs::load()["shortcuts"].as_object().cloned().unwrap_or_default();
    let mut freed: Vec<String> = Vec::new();
    match p.get("shortcut") {
        None | Some(Value::Null) => {
            map.remove(id);
        }
        Some(v) => {
            let combo = normalize_combo(v.as_str().unwrap_or(""))?;
            if RESERVED_KEYS.contains(&combo.as_str()) {
                return Err(format!("{combo} is kept for the command palette, panel maximize or Preferences"));
            }
            if !combo.is_empty() {
                if let Some(other) = all().iter().find(|c| c.id != id && c.shortcut_now() == combo) {
                    if !bv(p, "force", false) {
                        return Err(format!("{combo} already runs {} ({}); pass force to move it", other.label, other.id));
                    }
                    map.insert(other.id.to_string(), json!(""));
                    freed.push(other.id.to_string());
                }
            }
            if combo == cmd.shortcut {
                map.remove(id);
            } else {
                map.insert(id.to_string(), json!(combo));
            }
        }
    }
    let mut vals = serde_json::Map::new();
    vals.insert("shortcuts".into(), Value::Object(map));
    prefs::save(&vals)?;
    Ok(json!({"command": id, "shortcut": cmd.shortcut_now(), "default": cmd.shortcut, "freed": freed}))
}

pub(super) fn shortcuts_reset(_: &mut Engine, _: &Value) -> Res {
    let mut vals = serde_json::Map::new();
    vals.insert("shortcuts".into(), json!({}));
    prefs::save(&vals)?;
    Ok(json!({"reset": true}))
}

pub(super) fn plugin_list(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"plugins": crate::plugins::list(), "folders": crate::plugins::dirs().iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>(), "protocol": crate::plugins::PROTOCOL, "events": crate::plugins::EVENTS}))
}

pub(super) fn plugin_run(_: &mut Engine, p: &Value) -> Res {
    crate::plugins::start_command(s(p, "plugin").ok_or("pass plugin")?, s(p, "command").unwrap_or(""), p.get("params").cloned().unwrap_or(json!({})))
}

pub(super) fn plugin_result(_: &mut Engine, p: &Value) -> Res {
    crate::plugins::result(s(p, "run").ok_or("pass run")?)
}

pub(super) fn tools_list(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"tools": crate::tools::listing(), "folders": crate::tools::folders().iter().map(|(o, p)| json!({"origin": o, "path": p.to_string_lossy()})).collect::<Vec<_>>(),
              "vendorRaw": crate::raw::vendor_listing(), "rawDecoders": prefs::load()["rawDecoders"]}))
}

pub(super) fn cache_info(_: &mut Engine, _: &Value) -> Res {
    let (bytes, files) = paths::cache_usage();
    let p = prefs::load();
    Ok(json!({"folder": paths::cache_dir().to_string_lossy(), "bytes": bytes, "files": files, "limitGB": p["cacheLimitGB"], "availableMemory": crate::util::available_memory(), "memoryReserveGB": p["memoryReserveGB"]}))
}

pub(super) fn cache_clean(e: &mut Engine, p: &Value) -> Res {
    let keep: Vec<String> = e.jobs_running();
    let limit = if bv(p, "all", false) { 0 } else { (prefs::load()["cacheLimitGB"].as_f64().unwrap_or(20.0).max(0.0) * 1024.0 * 1024.0 * 1024.0) as u64 };
    let (freed, removed) = paths::trim_cache(limit, &keep);
    let (bytes, files) = paths::cache_usage();
    Ok(json!({"freed": freed, "removed": removed, "bytes": bytes, "files": files}))
}

pub(super) fn prefs_reset(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"prefs": prefs::reset()}))
}
