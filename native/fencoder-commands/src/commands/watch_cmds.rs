use super::*;

pub(super) fn watch_list(e: &mut Engine, _: &Value) -> Res {
    Ok(json!({"watch": e.ui_state()["watch"], "autoEncode": prefs::load()["autoEncodeWatch"]}))
}

pub(super) fn watch_add(e: &mut Engine, p: &Value) -> Res {
    let root = PathBuf::from(paths::expand(s(p, "folder").ok_or("pass folder")?));
    fs::create_dir_all(&root).map_err(|x| x.to_string())?;
    if e.doc["watch"].as_array().unwrap().iter().any(|w| Path::new(w["folder"].as_str().unwrap_or("")) == root) {
        return Err(format!("{} is already watched", root.display()));
    }
    let kind = s(p, "kind").unwrap_or("encode");
    let outs = if kind == "analysis" { vec![e.make_output(None, None, Some("h264"), None, None, "analysis")?] } else { outputs_spec(e, p, None)? };
    let w = json!({"id": new_id("w"), "folder": root.to_string_lossy(), "active": true, "outputs": outs, "kind": kind, "frameRate": p["frameRate"].as_f64().unwrap_or(25.0), "moveSources": bv(p, "moveSources", true)});
    let res = json!({"watch": w["id"], "folder": w["folder"], "outputs": w["outputs"].as_array().unwrap().iter().map(|o| o["id"].clone()).collect::<Vec<_>>()});
    e.watch_mut().push(w);
    Ok(res)
}

pub(super) fn watch_remove(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let w = e.watch_mut().remove(i);
    Ok(json!({"removed": w["id"]}))
}

pub(super) fn watch_active(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let on = bv(p, "active", true);
    e.watch_mut()[i]["active"] = json!(on);
    Ok(json!({"watch": e.doc["watch"][i]["id"], "active": on}))
}

pub(super) fn watch_chain(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let from = e.doc["watch"][i]["id"].clone();
    let to = match s(p, "to").filter(|x| !x.is_empty()) {
        None => Value::Null,
        Some(t) => {
            let j = e.watch_index(t)?;
            let target = e.doc["watch"][j]["id"].clone();
            if target == from {
                return Err("a watch folder cannot feed itself".into());
            }
            let mut cur = target.clone();
            for _ in 0..64 {
                let next = e.doc["watch"].as_array().unwrap().iter().find(|w| w["id"] == cur).map(|w| w["chainTo"].clone()).unwrap_or(Value::Null);
                if next.is_null() {
                    break;
                }
                if next == from {
                    return Err("that chain would loop back to this watch folder".into());
                }
                cur = next;
            }
            target
        }
    };
    e.watch_mut()[i]["chainTo"] = to.clone();
    let folder = e.chain_folder(&e.doc["watch"][i].clone()).map(|p| p.to_string_lossy().into_owned());
    Ok(json!({"watch": from, "chainTo": to, "outputsGoTo": folder}))
}

pub(super) fn watch_add_output(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let preset = if s(p, "preset").is_none() && s(p, "format").is_none() && !p["settings"].is_object() { Some("system/match-source-high") } else { s(p, "preset") };
    let o = e.make_output(p.get("settings"), preset, s(p, "format"), s(p, "folder"), None, "encode")?;
    let oid = o["id"].clone();
    e.watch_mut()[i]["outputs"].as_array_mut().unwrap().push(o);
    Ok(json!({"watch": e.doc["watch"][i]["id"], "output": oid}))
}

pub(super) fn watch_set_output(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").unwrap_or("").to_string();
    let i = e.watch_index(&oid)?;
    let w = &mut e.watch_mut()[i];
    let o = w["outputs"].as_array_mut().unwrap().iter_mut().find(|x| x["id"] == json!(oid)).ok_or("no such watch folder output")?;
    if let Some(pr) = s(p, "preset") {
        o["settings"] = presets::settings_for(pr)?;
    }
    if p["settings"].is_object() {
        o["settings"] = settings::apply_patch(&o["settings"], &p["settings"])?;
    }
    if let Some(f) = p.get("folder") {
        o["folder"] = if f.as_str().map(|x| x.is_empty()).unwrap_or(true) { Value::Null } else { json!(paths::expand(f.as_str().unwrap())) };
    }
    Ok(json!({"output": oid, "summary": settings::summary(&o["settings"], &Value::Null)}))
}

pub(super) fn watch_remove_output(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").unwrap_or("").to_string();
    let i = e.watch_index(&oid)?;
    e.watch_mut()[i]["outputs"].as_array_mut().unwrap().retain(|o| o["id"] != json!(oid));
    Ok(json!({"watch": e.doc["watch"][i]["id"], "outputs": e.doc["watch"][i]["outputs"].as_array().map(|o| o.len())}))
}

pub(super) fn watch_scan(e: &mut Engine, _: &Value) -> Res {
    let p = prefs::load();
    let ids_w: Vec<String> = e.doc["watch"].as_array().unwrap().iter().filter(|w| w["active"].as_bool().unwrap_or(true)).map(|w| w["id"].as_str().unwrap_or("").to_string()).collect();
    let mut n = 0;
    for w in ids_w {
        n += e.scan_watch(&w, &p, true);
    }
    Ok(json!({"added": n}))
}
