use super::*;

pub(super) fn outputs_spec(e: &Engine, p: &Value, folder: Option<&str>) -> Res<Vec<Value>> {
    if let Some(list) = p["outputs"].as_array().filter(|a| !a.is_empty()) {
        let mut made = Vec::new();
        for spec in list {
            made.push(e.make_output(spec.get("settings"), s(spec, "preset"), s(spec, "format"), s(spec, "folder").or(folder), s(spec, "path"), "encode")?);
        }
        return Ok(made);
    }
    let mut preset = s(p, "preset").map(String::from);
    if preset.is_none() && s(p, "format").is_none() && !p["settings"].is_object() {
        preset = Some(prefs::load()["defaultPreset"].as_str().unwrap_or("system/match-source-high").to_string());
    }
    Ok(vec![e.make_output(p.get("settings"), preset.as_deref(), s(p, "format"), folder, None, "encode")?])
}

pub(super) fn add_source(e: &mut Engine, p: &Value) -> Res {
    let files = path_list(p, "paths")?;
    if bv(p, "stitch", false) && files.len() > 1 {
        return stitch(e, p);
    }
    let folder = s(p, "folder");
    let mut added = Vec::new();
    for f in files {
        let mut it = if ffmpeg::ext_of(&f) == "fvxlink" {
            return Err("a .fvxlink is a formvfx Dynamic Link clip; add it with family.addLink".into());
        } else if let (Some(fr), "image") = (p["frameRate"].as_f64(), ffmpeg::kind_of(&f)) {
            let seq = ffmpeg::sequence_of(&f).ok_or_else(|| format!("{} is not part of a numbered image sequence", Path::new(&f).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()))?;
            let pattern = seq["pattern"].as_str().unwrap_or("").to_string();
            let mut info = ffmpeg::probe(&pattern, Some(fr));
            info["sequence"] = seq;
            let mut it = e.new_item(&pattern, &info, Some("sequence"));
            it["interpret"] = json!({"frameRate": fr});
            it
        } else if Path::new(&f).is_dir() {
            return Err(format!("{f} is a folder; use queue.addFolder"));
        } else {
            let mut info = ffmpeg::probe(&f, None);
            let hooked = crate::raw::decoder_for(&f).is_some();
            if info.get("error").is_some() && info["video"].is_null() && info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) && !hooked {
                let ext = ffmpeg::ext_of(&f);
                let hint = if ["r3d", "braw", "ari", "arx", "crm", "mxf"].contains(&ext.as_str()) { "; camera raw is decoded by the camera maker's own tool: add it under the rawDecoders preference (Preferences > Delivery Tools)" } else { "" };
                return Err(format!("ffmpeg cannot read {}: {}{hint}", Path::new(&f).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), info["error"].as_str().unwrap_or("")));
            }
            if hooked {
                info["rawDecoder"] = json!(true);
            }
            e.new_item(&f, &info, None)
        };
        it["outputs"] = json!(outputs_spec(e, p, folder)?);
        added.push(json!({"item": it["id"], "outputs": it["outputs"].as_array().unwrap().iter().map(|o| o["id"].clone()).collect::<Vec<_>>(), "name": it["name"]}));
        e.items_mut().push(it);
    }
    if bv(p, "start", false) {
        e.start_queue("addSource");
    }
    Ok(json!({"added": added, "item": added.first().map(|a| a["item"].clone()), "output": added.first().and_then(|a| a["outputs"].get(0).cloned())}))
}

pub(super) fn add_folder(e: &mut Engine, p: &Value) -> Res {
    let root = PathBuf::from(paths::expand(s(p, "folder").unwrap_or("")));
    if !root.is_dir() {
        return Err(format!("no folder at {}", root.display()));
    }
    let want: Vec<String> = p["kinds"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_else(|| vec!["video".into(), "audio".into()]);
    let mut files = Vec::new();
    collect(&root, bv(p, "recursive", false), &mut |f: &Path| {
        let name = f.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if !name.starts_with('.') && want.iter().any(|k| k == ffmpeg::kind_of(&name)) {
            files.push(f.to_string_lossy().into_owned());
        }
    });
    files.sort();
    if files.is_empty() {
        return Err(format!("no {} files in {}", want.join(" or "), root.display()));
    }
    let mut q = p.clone();
    q["paths"] = json!(files);
    if let Value::Object(m) = &mut q {
        for k in ["folder", "recursive", "kinds"] {
            m.remove(k);
        }
    }
    add_source(e, &q)
}

pub(super) fn collect(dir: &Path, recursive: bool, f: &mut dyn FnMut(&Path)) {
    if let Ok(rd) = fs::read_dir(dir) {
        for en in rd.flatten() {
            let p = en.path();
            if p.is_dir() {
                if recursive {
                    collect(&p, true, f);
                }
            } else {
                f(&p);
            }
        }
    }
}

pub(super) fn add_output(e: &mut Engine, p: &Value) -> Res {
    let i = e.item_index(&p["item"])?;
    let item = e.items()[i].clone();
    let o = if s(p, "preset").is_none() && s(p, "format").is_none() && !p["settings"].is_object() {
        let last = item["outputs"].as_array().and_then(|o| o.last().cloned());
        match last {
            Some(l) => e.make_output(Some(&l["settings"]), None, None, s(p, "folder").or(l["folder"].as_str()), s(p, "path"), "encode")?,
            None => e.make_output(None, Some("system/match-source-high"), None, s(p, "folder"), s(p, "path"), "encode")?,
        }
    } else {
        e.make_output(p.get("settings"), s(p, "preset"), s(p, "format"), s(p, "folder"), s(p, "path"), "encode")?
    };
    let oid = o["id"].clone();
    e.items_mut()[i]["outputs"].as_array_mut().unwrap().push(o);
    Ok(json!({"item": item["id"], "output": oid}))
}

pub(super) fn duplicate(e: &mut Engine, p: &Value) -> Res {
    let mut made = Vec::new();
    let mut pairs = e.refs(&p["refs"])?;
    pairs.reverse();
    for (i, j) in pairs {
        let mut twin = e.items()[i]["outputs"][j].clone();
        twin["id"] = json!(new_id("o"));
        twin["path"] = Value::Null;
        made.push(twin["id"].clone());
        e.items_mut()[i]["outputs"].as_array_mut().unwrap().insert(j + 1, twin);
    }
    Ok(json!({"outputs": made}))
}

pub(super) fn remove(e: &mut Engine, p: &Value) -> Res {
    let refs = &p["refs"];
    if refs == "all" || refs == &json!(["all"]) {
        if !e.jobs.is_empty() {
            return Err("stop encoding first".into());
        }
        let n = e.items().len();
        e.items_mut().clear();
        return Ok(json!({"removedItems": n}));
    }
    let list: Vec<Value> = match refs { Value::Array(a) => a.clone(), other => vec![other.clone()] };
    let mut whole: Vec<String> = Vec::new();
    let mut outs: Vec<String> = Vec::new();
    for r in &list {
        if let Some(x) = r.as_str() {
            if e.output_pos(x).is_some() {
                outs.push(x.into());
                continue;
            }
        }
        let i = e.item_index(r)?;
        whole.push(e.items()[i]["id"].as_str().unwrap_or("").into());
    }
    for o in &outs {
        if e.jobs.contains_key(o) {
            return Err("stop the encode first: an output being encoded cannot be removed".into());
        }
    }
    let mut removed = 0;
    let items = e.items_mut();
    items.retain(|it| {
        let id = it["id"].as_str().unwrap_or("").to_string();
        if whole.contains(&id) {
            removed += it["outputs"].as_array().map(|o| o.len()).unwrap_or(0);
            false
        } else {
            true
        }
    });
    for it in items.iter_mut() {
        let before = it["outputs"].as_array().map(|o| o.len()).unwrap_or(0);
        it["outputs"].as_array_mut().unwrap().retain(|o| !outs.contains(&o["id"].as_str().unwrap_or("").to_string()));
        removed += before - it["outputs"].as_array().map(|o| o.len()).unwrap_or(0);
    }
    items.retain(|it| !it["outputs"].as_array().map(|o| o.is_empty()).unwrap_or(true) || it["kind"] == "ingest");
    Ok(json!({"removed": removed}))
}

pub(super) fn clear_done(e: &mut Engine, _: &Value) -> Res {
    let before = e.items().len();
    let doneish: Vec<bool> = e.items().iter().map(|it| it["outputs"].as_array().map(|o| !o.is_empty() && o.iter().all(|x| matches!(e.status_of(x).as_str(), "done" | "skipped"))).unwrap_or(false)).collect();
    let mut k = 0;
    e.items_mut().retain(|_| { let keep = !doneish[k]; k += 1; keep });
    Ok(json!({"removed": before - e.items().len()}))
}

pub(super) fn set_preset(e: &mut Engine, p: &Value) -> Res {
    let s0 = presets::settings_for(s(p, "preset").unwrap_or(""))?;
    let mut done = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        let o = &mut e.items_mut()[i]["outputs"][j];
        let range = o["settings"]["range"].clone();
        let mut ns = s0.clone();
        ns["range"] = range;
        o["settings"] = settings::normalize(&ns)?;
        o["kind"] = json!("encode");
        done.push(o["id"].clone());
    }
    Ok(json!({"outputs": done, "preset": s0["presetName"]}))
}

pub(super) fn set_format(e: &mut Engine, p: &Value) -> Res {
    let f = s(p, "format").unwrap_or("h264");
    let mut done = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        let o = &mut e.items_mut()[i]["outputs"][j];
        o["settings"] = settings::apply_patch(&o["settings"], &json!({"format": f}))?;
        done.push(o["id"].clone());
    }
    Ok(json!({"outputs": done}))
}

pub(super) fn set_settings(e: &mut Engine, p: &Value) -> Res {
    let mut done = Vec::new();
    let replace = bv(p, "replace", false);
    for (i, j) in e.refs(&p["refs"])? {
        let info = e.items()[i]["info"].clone();
        let o = &mut e.items_mut()[i]["outputs"][j];
        o["settings"] = if replace { settings::normalize(&p["settings"])? } else { settings::apply_patch(&o["settings"], &p["settings"])? };
        done.push(json!({"output": o["id"], "summary": settings::summary(&o["settings"], &info)}));
    }
    Ok(json!({"outputs": done}))
}

pub(super) fn apply_settings(e: &mut Engine, p: &Value) -> Res {
    let base = settings::normalize(&p["settings"])?;
    let s0 = match p.get("patch").filter(|x| x.is_object()) {
        Some(patch) => settings::apply_patch(&base, patch)?,
        None => base,
    };
    let (info, range) = match s(p, "output") {
        Some(o) => {
            let (i, _) = e.output_ref(&json!(o))?;
            (e.items()[i]["info"].clone(), e.items()[i]["range"].clone())
        }
        None => (json!({}), json!({})),
    };
    let estimate = if info.get("duration").is_some() { pipeline::estimate(&s0, &info, &range) } else { Value::Null };
    Ok(json!({"settings": s0, "summary": settings::summary(&s0, &info), "estimate": estimate}))
}

pub(super) fn get_settings(e: &mut Engine, p: &Value) -> Res {
    let (i, j) = e.output_ref(&p["output"])?;
    let it = e.items()[i].clone();
    let o = &it["outputs"][j];
    let s0 = settings::normalize(&o["settings"])?;
    Ok(json!({"output": o["id"], "item": it["id"], "source": it["path"], "path": e.output_path(&it, o), "kind": o["kind"], "settings": s0, "summary": settings::summary(&s0, &it["info"]), "sourceInfo": ffmpeg::light(&it["info"])}))
}

pub(super) fn set_output(e: &mut Engine, p: &Value) -> Res {
    let pairs = e.refs(&p["refs"])?;
    if s(p, "path").is_some() && pairs.len() > 1 {
        return Err("a path names one file; pass folder to change several outputs".into());
    }
    let mut ids_out = Vec::new();
    for (i, j) in pairs {
        let o = &mut e.items_mut()[i]["outputs"][j];
        if let Some(path) = s(p, "path") {
            let ex = paths::expand(path);
            o["folder"] = json!(Path::new(&ex).parent().map(|x| x.to_string_lossy().into_owned()));
            o["path"] = json!(ex);
        }
        if let Some(f) = s(p, "folder") {
            o["folder"] = json!(paths::expand(f));
            o["path"] = Value::Null;
        }
        if let Some(n) = s(p, "name") {
            o["settings"]["outputName"] = json!(n);
            o["path"] = Value::Null;
        }
        ids_out.push(o["id"].clone());
    }
    Ok(json!({"outputs": ids_out}))
}

pub(super) fn set_range(e: &mut Engine, p: &Value) -> Res {
    let mode = s(p, "mode").unwrap_or("custom");
    for (i, j) in e.refs(&p["refs"])? {
        e.items_mut()[i]["outputs"][j]["settings"]["range"] = json!({"mode": mode, "in": p["in"], "out": p["out"]});
    }
    Ok(json!({"mode": mode, "in": p["in"], "out": p["out"]}))
}

pub(super) fn interpret(e: &mut Engine, p: &Value) -> Res {
    let i = e.item_index(&p["item"])?;
    let it = &mut e.items_mut()[i];
    if !it["interpret"].is_object() {
        it["interpret"] = json!({});
    }
    for k in ["frameRate", "pixelAspect", "fieldOrder", "alpha", "rotation", "rawExposure", "rawTransfer"] {
        if let Some(v) = p.get(k) {
            if v.is_null() || v == "source" {
                it["interpret"].as_object_mut().unwrap().remove(k);
            } else {
                it["interpret"][k] = v.clone();
            }
        }
    }
    Ok(json!({"item": it["id"], "interpret": it["interpret"]}))
}

pub(super) fn reorder(e: &mut Engine, p: &Value) -> Res {
    let i = e.item_index(&p["item"])?;
    let to = p["to"].as_i64().unwrap_or(1).max(1) as usize - 1;
    let it = e.items_mut().remove(i);
    let id = it["id"].clone();
    let pos = to.min(e.items().len());
    e.items_mut().insert(pos, it);
    Ok(json!({"item": id, "index": pos + 1}))
}

pub(super) fn skip(e: &mut Engine, p: &Value) -> Res {
    let on = bv(p, "skip", true);
    let mut out = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        e.items_mut()[i]["outputs"][j]["skip"] = json!(on);
        out.push(e.items()[i]["outputs"][j]["id"].clone());
    }
    Ok(json!({"outputs": out, "skip": on}))
}

pub(super) fn reset_status(e: &mut Engine, p: &Value) -> Res {
    let mut out = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        let oid = e.items()[i]["outputs"][j]["id"].as_str().unwrap_or("").to_string();
        if e.jobs.contains_key(&oid) {
            continue;
        }
        e.runtime.remove(&oid);
        e.items_mut()[i]["outputs"][j]["skip"] = json!(false);
        out.push(oid);
    }
    Ok(json!({"outputs": out}))
}

pub(super) fn stitch(e: &mut Engine, p: &Value) -> Res {
    let files = path_list(p, "paths")?;
    if files.len() < 2 {
        return Err("stitching needs at least two clips".into());
    }
    let infos: Vec<Value> = files.iter().map(|f| ffmpeg::probe(f, None)).collect();
    let mut it = e.new_item(&files[0], &infos[0], Some("stitch"));
    it["stitch"] = json!(files);
    it["name"] = json!(format!("{} + {}", Path::new(&files[0]).file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), files.len() - 1));
    let total: f64 = infos.iter().map(|i| i["duration"].as_f64().unwrap_or(0.0)).sum();
    it["info"]["duration"] = json!(total);
    it["outputs"] = json!(outputs_spec(e, p, s(p, "folder"))?);
    let res = json!({"item": it["id"], "output": it["outputs"][0]["id"], "clips": files.len(), "duration": total});
    e.items_mut().push(it);
    if bv(p, "start", false) {
        e.start_queue("stitch");
    }
    Ok(res)
}

pub(super) fn select(e: &mut Engine, p: &Value) -> Res {
    e.selection = json!({"items": p["items"].as_array().cloned().unwrap_or_default(), "outputs": p["outputs"].as_array().cloned().unwrap_or_default()});
    let sel = e.selection.clone();
    let mut ev = sel.clone();
    ev["type"] = json!("selection");
    e.emit(ev);
    Ok(sel)
}

pub(super) fn save_queue(e: &mut Engine, p: &Value) -> Res {
    e.save();
    if let Some(path) = s(p, "path") {
        let mut target = PathBuf::from(paths::expand(path));
        if target.extension().map(|x| x != "fequeue").unwrap_or(true) {
            target.set_extension("fequeue");
        }
        fs::write(&target, serde_json::to_string_pretty(&json!({"format": "formencoder.queue/1", "doc": e.doc})).unwrap_or_default()).map_err(|x| x.to_string())?;
        return Ok(json!({"path": target.to_string_lossy()}));
    }
    Ok(json!({"path": paths::data_dir().join("queue.json").to_string_lossy()}))
}

pub(super) fn open_queue(e: &mut Engine, p: &Value) -> Res {
    let text = fs::read_to_string(paths::expand(s(p, "path").unwrap_or(""))).map_err(|x| x.to_string())?;
    let data: Value = serde_json::from_str(&text).map_err(|x| format!("not a queue file: {x}"))?;
    let mut items = data["doc"]["items"].as_array().cloned().unwrap_or_default();
    for it in items.iter_mut() {
        it["id"] = json!(new_id("i"));
        for o in it["outputs"].as_array_mut().into_iter().flatten() {
            o["id"] = json!(new_id("o"));
        }
    }
    if !bv(p, "append", true) {
        e.items_mut().clear();
    }
    let n = items.len();
    e.items_mut().extend(items);
    Ok(json!({"added": n}))
}

pub(super) fn queue_list(e: &mut Engine, _: &Value) -> Res {
    let st = e.ui_state();
    Ok(json!({"running": st["running"], "paused": st["paused"], "counts": st["counts"], "items": st["items"]}))
}

pub(super) fn queue_start(e: &mut Engine, _: &Value) -> Res { Ok(e.start_queue("command")) }
pub(super) fn queue_pause(e: &mut Engine, _: &Value) -> Res { Ok(e.pause_queue()) }
pub(super) fn queue_stop(e: &mut Engine, _: &Value) -> Res { Ok(e.stop_queue(false)) }

pub(super) fn queue_stop_current(e: &mut Engine, p: &Value) -> Res {
    if p["refs"].is_null() {
        return Ok(e.stop_queue(true));
    }
    let mut stopped = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        let oid = e.items()[i]["outputs"][j]["id"].as_str().unwrap_or("").to_string();
        if let Some(job) = e.jobs.get(&oid) {
            job.stop();
            stopped.push(oid);
        }
    }
    Ok(json!({"stopped": stopped}))
}

pub(super) fn auto_encode(e: &mut Engine, p: &Value) -> Res {
    let mut m = serde_json::Map::new();
    m.insert("autoEncodeWatch".into(), json!(bv(p, "enabled", true)));
    prefs::save(&m)?;
    let _ = e;
    Ok(json!({"autoEncodeWatch": bv(p, "enabled", true)}))
}
