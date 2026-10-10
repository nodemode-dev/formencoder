use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::{Value, json};

use crate::engine::Engine;
use crate::util::{Res, new_id, now};
use crate::{captions, colour, encoders, ffmpeg, formats, logs, paths, pipeline, prefs, presets, settings};

pub type Run = fn(&mut Engine, &Value) -> Res;

pub struct Cmd {
    pub id: &'static str,
    pub label: &'static str,
    pub menu: &'static str,
    pub params: Value,
    pub required: &'static [&'static str],
    pub undoable: bool,
    pub query: bool,
    pub shortcut: &'static str,
    pub doc: &'static str,
    pub run: Run,
}

impl Cmd {
    pub fn summary(&self) -> String {
        let parts: Vec<String> = self.params.as_object().map(|m| m.iter().map(|(k, v)| {
            let t = match &v["type"] {
                Value::String(s) => s.clone(),
                Value::Array(a) => a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("|"),
                _ => if v.get("enum").is_some() { "enum".into() } else { "any".into() },
            };
            format!("{k}{}: {t}", if self.required.contains(&k.as_str()) { "" } else { "?" })
        }).collect()).unwrap_or_default();
        format!("{{{}}}", parts.join(", "))
    }

    pub fn schema(&self) -> Value {
        json!({"type": "object", "properties": self.params, "required": self.required, "additionalProperties": false})
    }

    pub fn row(&self, schemas: bool) -> Value {
        let mut r = json!({"id": self.id, "label": self.label, "menu": self.menu, "params": self.summary(), "undoable": self.undoable, "query": self.query, "shortcut": self.shortcut, "enabled": true});
        if schemas {
            r["schema"] = self.schema();
            r["doc"] = json!(self.doc);
        }
        r
    }
}

fn st() -> Value { json!({"type": "string"}) }
fn nu() -> Value { json!({"type": "number"}) }
fn int() -> Value { json!({"type": "integer"}) }
fn bo() -> Value { json!({"type": "boolean"}) }
fn ob() -> Value { json!({"type": "object", "additionalProperties": true}) }
fn ids() -> Value { json!({"type": "array", "items": {"type": "string"}}) }
fn paths_s() -> Value { json!({"type": "array", "items": {"type": "string"}, "description": "absolute paths"}) }
fn refs_s() -> Value { json!({"type": ["array", "string"], "items": {"type": "string"}, "description": "output or item ids, '#n' for the nth queue item, 'selected' or 'all'"}) }
fn preset_s() -> Value { json!({"type": "string", "description": "preset id (system/..., user/...), name or alias"}) }
fn format_s() -> Value { json!({"type": "string", "enum": formats::ids()}) }
fn en(list: &[&str]) -> Value { json!({"type": "string", "enum": list}) }
fn objs() -> Value { json!({"type": "array", "items": {"type": "object", "additionalProperties": true}}) }

macro_rules! p {
    () => { Value::Object(serde_json::Map::new()) };
    ($($k:literal => $v:expr),+ $(,)?) => {{ let mut m = serde_json::Map::new(); $( m.insert($k.to_string(), $v); )+ Value::Object(m) }};
}

fn s<'a>(p: &'a Value, k: &str) -> Option<&'a str> { p.get(k).and_then(Value::as_str).filter(|x| !x.is_empty()) }
fn bv(p: &Value, k: &str, d: bool) -> bool { p.get(k).and_then(Value::as_bool).unwrap_or(d) }

fn path_list(p: &Value, key: &str) -> Res<Vec<String>> {
    let list: Vec<String> = match &p[key] {
        Value::String(x) => vec![x.clone()],
        Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        _ => vec![],
    };
    let mut out = Vec::new();
    for x in list {
        let e = paths::expand(&x);
        if !e.contains("%0") && !Path::new(&e).exists() {
            return Err(format!("no file at {x}"));
        }
        out.push(e);
    }
    if out.is_empty() {
        return Err(format!("pass {key}"));
    }
    Ok(out)
}

fn outputs_spec(e: &Engine, p: &Value, folder: Option<&str>) -> Res<Vec<Value>> {
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

fn add_source(e: &mut Engine, p: &Value) -> Res {
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
            let info = ffmpeg::probe(&f, None);
            if info.get("error").is_some() && info["video"].is_null() && info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
                return Err(format!("ffmpeg cannot read {}: {}", Path::new(&f).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), info["error"].as_str().unwrap_or("")));
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

fn add_folder(e: &mut Engine, p: &Value) -> Res {
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

fn collect(dir: &Path, recursive: bool, f: &mut dyn FnMut(&Path)) {
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

fn add_output(e: &mut Engine, p: &Value) -> Res {
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

fn duplicate(e: &mut Engine, p: &Value) -> Res {
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

fn remove(e: &mut Engine, p: &Value) -> Res {
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

fn clear_done(e: &mut Engine, _: &Value) -> Res {
    let before = e.items().len();
    let doneish: Vec<bool> = e.items().iter().map(|it| it["outputs"].as_array().map(|o| !o.is_empty() && o.iter().all(|x| matches!(e.status_of(x).as_str(), "done" | "skipped"))).unwrap_or(false)).collect();
    let mut k = 0;
    e.items_mut().retain(|_| { let keep = !doneish[k]; k += 1; keep });
    Ok(json!({"removed": before - e.items().len()}))
}

fn set_preset(e: &mut Engine, p: &Value) -> Res {
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

fn set_format(e: &mut Engine, p: &Value) -> Res {
    let f = s(p, "format").unwrap_or("h264");
    let mut done = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        let o = &mut e.items_mut()[i]["outputs"][j];
        o["settings"] = settings::apply_patch(&o["settings"], &json!({"format": f}))?;
        done.push(o["id"].clone());
    }
    Ok(json!({"outputs": done}))
}

fn set_settings(e: &mut Engine, p: &Value) -> Res {
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

fn get_settings(e: &mut Engine, p: &Value) -> Res {
    let (i, j) = e.output_ref(&p["output"])?;
    let it = e.items()[i].clone();
    let o = &it["outputs"][j];
    let s0 = settings::normalize(&o["settings"])?;
    Ok(json!({"output": o["id"], "item": it["id"], "source": it["path"], "path": e.output_path(&it, o), "kind": o["kind"], "settings": s0, "summary": settings::summary(&s0, &it["info"]), "sourceInfo": ffmpeg::light(&it["info"])}))
}

fn set_output(e: &mut Engine, p: &Value) -> Res {
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

fn set_range(e: &mut Engine, p: &Value) -> Res {
    let mode = s(p, "mode").unwrap_or("custom");
    for (i, j) in e.refs(&p["refs"])? {
        e.items_mut()[i]["outputs"][j]["settings"]["range"] = json!({"mode": mode, "in": p["in"], "out": p["out"]});
    }
    Ok(json!({"mode": mode, "in": p["in"], "out": p["out"]}))
}

fn interpret(e: &mut Engine, p: &Value) -> Res {
    let i = e.item_index(&p["item"])?;
    let it = &mut e.items_mut()[i];
    if !it["interpret"].is_object() {
        it["interpret"] = json!({});
    }
    for k in ["frameRate", "pixelAspect", "fieldOrder", "alpha", "rotation"] {
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

fn reorder(e: &mut Engine, p: &Value) -> Res {
    let i = e.item_index(&p["item"])?;
    let to = p["to"].as_i64().unwrap_or(1).max(1) as usize - 1;
    let it = e.items_mut().remove(i);
    let id = it["id"].clone();
    let pos = to.min(e.items().len());
    e.items_mut().insert(pos, it);
    Ok(json!({"item": id, "index": pos + 1}))
}

fn skip(e: &mut Engine, p: &Value) -> Res {
    let on = bv(p, "skip", true);
    let mut out = Vec::new();
    for (i, j) in e.refs(&p["refs"])? {
        e.items_mut()[i]["outputs"][j]["skip"] = json!(on);
        out.push(e.items()[i]["outputs"][j]["id"].clone());
    }
    Ok(json!({"outputs": out, "skip": on}))
}

fn reset_status(e: &mut Engine, p: &Value) -> Res {
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

fn stitch(e: &mut Engine, p: &Value) -> Res {
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

fn select(e: &mut Engine, p: &Value) -> Res {
    e.selection = json!({"items": p["items"].as_array().cloned().unwrap_or_default(), "outputs": p["outputs"].as_array().cloned().unwrap_or_default()});
    let sel = e.selection.clone();
    let mut ev = sel.clone();
    ev["type"] = json!("selection");
    e.emit(ev);
    Ok(sel)
}

fn save_queue(e: &mut Engine, p: &Value) -> Res {
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

fn open_queue(e: &mut Engine, p: &Value) -> Res {
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

fn queue_list(e: &mut Engine, _: &Value) -> Res {
    let st = e.ui_state();
    Ok(json!({"running": st["running"], "paused": st["paused"], "counts": st["counts"], "items": st["items"]}))
}

fn encode_status(e: &mut Engine, _: &Value) -> Res {
    let mut rows = Vec::new();
    for (oid, job) in &e.jobs {
        let rt = e.runtime.get(oid).cloned().unwrap_or(json!({}));
        let name = e.output_pos(oid).map(|(i, _)| e.items()[i]["name"].clone()).unwrap_or(Value::Null);
        rows.push(json!({"output": oid, "item": job.item_id, "name": name, "status": rt["status"], "progress": rt["progress"], "eta": rt["eta"], "elapsed": rt["elapsed"], "fps": rt["fps"], "speed": rt["speed"], "path": rt["path"], "encoder": rt["encoder"], "message": rt["message"], "outTime": rt["outTime"]}));
    }
    Ok(json!({"running": e.running, "paused": e.paused, "encoding": rows, "counts": e.counts()}))
}

fn outputs_report(e: &mut Engine, p: &Value) -> Res {
    let want: Vec<String> = p["outputs"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let mut rows = Vec::new();
    for it in e.items() {
        for o in it["outputs"].as_array().cloned().unwrap_or_default() {
            let oid = o["id"].as_str().unwrap_or("").to_string();
            if !want.is_empty() && !want.contains(&oid) {
                continue;
            }
            let rt = e.runtime.get(&oid).cloned().unwrap_or(json!({}));
            rows.push(json!({"output": oid, "item": it["id"], "name": it["name"], "status": e.status_of(&o), "path": rt["path"], "error": rt["error"], "elapsed": rt["elapsed"], "bytes": rt["bytes"],
                             "encoder": rt["encoder"], "notes": rt["notes"], "sidecars": rt["sidecars"], "loudness": rt["loudness"], "loudnessReport": rt["loudnessReport"], "publish": rt["publish"], "count": rt["count"], "ffmpeg": rt["ffmpeg"]}));
        }
    }
    Ok(json!({"running": e.running, "outputs": rows, "counts": e.counts()}))
}

fn estimate(e: &mut Engine, p: &Value) -> Res {
    let (i, j) = e.output_ref(&p["output"])?;
    let it = &e.items()[i];
    let s0 = settings::normalize(&it["outputs"][j]["settings"])?;
    Ok(pipeline::estimate(&s0, &it["info"], &it["range"]))
}

pub fn source_of(e: &Engine, i: usize) -> pipeline::Source {
    let it = &e.items()[i];
    let kind = it["kind"].as_str().unwrap_or("file");
    if kind == "stitch" {
        let parts: Vec<(String, Value)> = it["stitch"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str()).map(|x| (x.to_string(), ffmpeg::probe(x, None))).collect();
        let mut info = parts.first().map(|x| x.1.clone()).unwrap_or(json!({}));
        info["duration"] = json!(parts.iter().map(|x| x.1["duration"].as_f64().unwrap_or(0.0)).sum::<f64>());
        return pipeline::Source { path: it["path"].as_str().unwrap_or("").into(), info, interpret: json!({}), range: json!({}), audio_path: None, stitch: parts };
    }
    let path = it["path"].as_str().unwrap_or("").to_string();
    let info = if kind == "sequence" { let mut x = ffmpeg::probe(&path, it["interpret"]["frameRate"].as_f64().or(Some(25.0))); if x["sequence"].is_null() { x["sequence"] = it["info"]["sequence"].clone(); } x } else { it["info"].clone() };
    pipeline::Source { path, info, interpret: it["interpret"].clone(), range: it["range"].clone(), audio_path: None, stitch: vec![] }
}

fn command_line(e: &mut Engine, p: &Value) -> Res {
    let (i, j) = e.output_ref(&p["output"])?;
    if e.items()[i]["kind"] == "family" {
        return Err("a family source is fetched when it encodes; its command is known then (see the output's runtime)".into());
    }
    let mut s0 = settings::normalize(&e.items()[i]["outputs"][j]["settings"])?;
    s0["effects"]["timeTuner"]["enabled"] = json!(false);
    let src = source_of(e, i);
    let out = e.output_path(&e.items()[i].clone(), &e.items()[i]["outputs"][j].clone());
    let measured = pipeline::Measured::default();
    let work = paths::sub("cache").join("plans").join(e.items()[i]["outputs"][j]["id"].as_str().unwrap_or("x"));
    let opt = pipeline::BuildOptions { preview_at: None, preview_width: None, still_duration: prefs::load()["stillDuration"].as_f64().unwrap_or(5.0), threads: 0, measured: &measured };
    let plan = pipeline::build(&src, &s0, &out, &work, &opt)?;
    Ok(json!({"command": plan.command_line(), "encoder": plan.encoder, "audioEncoder": plan.audio_encoder, "notes": plan.notes, "width": plan.width, "height": plan.height, "fps": plan.fps, "duration": plan.duration, "output": out}))
}

fn verify(e: &mut Engine, p: &Value) -> Res {
    let mut sopt: Option<Value> = None;
    let mut path = s(p, "path").map(String::from);
    let mut rt = json!({});
    if let Some(oid) = s(p, "output") {
        let (i, j) = e.output_ref(&json!(oid))?;
        sopt = Some(settings::normalize(&e.items()[i]["outputs"][j]["settings"])?);
        let real = e.items()[i]["outputs"][j]["id"].as_str().unwrap_or("").to_string();
        rt = e.runtime.get(&real).cloned().unwrap_or(json!({}));
        if path.is_none() {
            path = rt["path"].as_str().map(String::from);
        }
    }
    let path = path.ok_or("pass path, or an output that has been encoded")?;
    let mut probe_path = path.clone();
    if path.contains("%0") {
        probe_path = rt["files"].get(0).and_then(|x| x.as_str()).map(String::from).ok_or("no frames of that sequence were written")?;
    }
    let info = ffmpeg::probe(&probe_path, None);
    let v = &info["video"];
    let mut checks: Vec<Value> = Vec::new();
    if let Some(s0) = &sopt {
        let fmt = s0["format"].as_str().unwrap_or("");
        if s0["exportVideo"].as_bool().unwrap_or(false) && rt["width"].is_number() {
            checks.push(json!({"check": "frame size", "want": format!("{}x{}", rt["width"], rt["height"]), "got": format!("{}x{}", v["width"], v["height"]), "ok": v["width"] == rt["width"] && v["height"] == rt["height"]}));
        }
        if s0["exportVideo"].as_bool().unwrap_or(false) && rt["fps"].is_number() && !formats::is_image(fmt) && fmt != "gif" {
            let ok = (v["fps"].as_f64().unwrap_or(0.0) - rt["fps"].as_f64().unwrap_or(0.0)).abs() < 0.02;
            checks.push(json!({"check": "frame rate", "want": rt["fps"], "got": v["fps"], "ok": ok}));
        }
        if rt["duration"].as_f64().unwrap_or(0.0) > 0.0 && !formats::is_image(fmt) {
            let want = rt["duration"].as_f64().unwrap_or(0.0);
            let got = info["duration"].as_f64().unwrap_or(0.0);
            let tol = (2.0 / rt["fps"].as_f64().unwrap_or(25.0).max(1.0)).max(0.15);
            checks.push(json!({"check": "duration", "want": (want * 1000.0).round() / 1000.0, "got": (got * 1000.0).round() / 1000.0, "ok": (got - want).abs() < tol}));
        }
        if s0["exportVideo"].as_bool().unwrap_or(false) {
            let codec = s0["video"]["codec"].as_str().unwrap_or("");
            let want = match codec { "dnxhr" => "dnxhd", "cineform" => "cfhd", "xdcam" | "mpeg2" => "mpeg2video", "jpeg" | "mjpeg" => "mjpeg", "uncompressed" => if s0["video"]["flavor"] == "v210" { "v210" } else { "rawvideo" }, other => other };
            checks.push(json!({"check": "video codec", "want": want, "got": v["codec"], "ok": v["codec"] == json!(want)}));
        }
        if s0["exportAudio"].as_bool().unwrap_or(false) {
            if let Some(ac) = s0["audio"]["codec"].as_str() {
                let a = info["audio"].get(0).cloned().unwrap_or(Value::Null);
                let got = a["codec"].as_str().unwrap_or("");
                checks.push(json!({"check": "audio", "want": ac, "got": got, "ok": !a.is_null() && got.starts_with(ac)}));
                if let Some(r) = s0["audio"]["sampleRate"].as_i64() {
                    if !a.is_null() {
                        checks.push(json!({"check": "sample rate", "want": r, "got": a["sampleRate"], "ok": a["sampleRate"].as_i64() == Some(r)}));
                    }
                }
            }
        }
    }
    let mut out = json!({"path": path, "probe": info, "checks": checks});
    if bv(p, "loudness", false) && !info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        let m = pipeline::measure_file(&probe_path);
        if let (Some(s0), Some(integrated)) = (&sopt, m["integrated"].as_f64()) {
            if s0["effects"]["loudness"]["enabled"].as_bool().unwrap_or(false) {
                let (target, _, _) = pipeline::loudness_targets(s0);
                let tol = s0["effects"]["loudness"]["tolerance"].as_f64().unwrap_or(1.0) + 0.6;
                out["checks"].as_array_mut().unwrap().push(json!({"check": "integrated loudness", "want": target, "got": integrated, "ok": (integrated - target).abs() <= tol}));
            }
        }
        out["loudness"] = m;
    }
    let passed = out["checks"].as_array().map(|c| c.iter().all(|x| x["ok"].as_bool().unwrap_or(false))).unwrap_or(true);
    out["passed"] = json!(passed);
    Ok(out)
}

fn preset_list(_: &mut Engine, p: &Value) -> Res {
    let rows = presets::listing(s(p, "query"), s(p, "category"), s(p, "kind"));
    let mut groups: BTreeMap<String, i64> = BTreeMap::new();
    for r in &rows {
        *groups.entry(format!("{}/{}", if r["system"].as_bool().unwrap_or(false) { "System" } else { "User" }, r["group"].as_str().unwrap_or(""))).or_default() += 1;
    }
    Ok(json!({"presets": rows, "groups": groups, "userGroups": presets::groups()}))
}

fn preset_get(_: &mut Engine, p: &Value) -> Res {
    let pr = presets::require(s(p, "preset").unwrap_or(""))?;
    let mut row = presets::row(&pr);
    row["settings"] = pr["settings"].clone();
    Ok(row)
}

fn preset_create(e: &mut Engine, p: &Value) -> Res {
    let name = s(p, "name").ok_or("pass name")?.to_string();
    let mut settings_v = p["settings"].clone();
    let mut from: Option<(usize, usize)> = None;
    if let Some(oid) = s(p, "fromOutput") {
        let pos = e.output_ref(&json!(oid))?;
        settings_v = e.items()[pos.0]["outputs"][pos.1]["settings"].clone();
        from = Some(pos);
    }
    if !settings_v.is_object() {
        return Err("pass settings or fromOutput".into());
    }
    let made = presets::create(&name, &settings_v, s(p, "group"), s(p, "comment").unwrap_or(""))?;
    if let Some((i, j)) = from {
        let o = &mut e.items_mut()[i]["outputs"][j]["settings"];
        o["preset"] = made["id"].clone();
        o["presetName"] = json!(name);
    }
    Ok(json!({"preset": made["id"], "name": name, "file": made["file"]}))
}

fn preset_update(_: &mut Engine, p: &Value) -> Res {
    let pr = presets::require(s(p, "preset").unwrap_or(""))?;
    let merged = if p["settings"].is_object() { Some(settings::apply_patch(&pr["settings"], &p["settings"])?) } else { None };
    let d = presets::update(pr["id"].as_str().unwrap_or(""), s(p, "name"), merged.as_ref(), s(p, "group"), p["comment"].as_str())?;
    Ok(json!({"preset": d["id"], "name": d["name"]}))
}

fn preset_delete(_: &mut Engine, p: &Value) -> Res {
    let r = presets::delete(s(p, "preset").unwrap_or(""))?;
    Ok(json!({"deleted": r["deleted"]}))
}

fn preset_duplicate(_: &mut Engine, p: &Value) -> Res {
    let m = presets::duplicate(s(p, "preset").unwrap_or(""), s(p, "name"))?;
    Ok(json!({"preset": m["id"], "name": m["name"]}))
}

fn preset_group(_: &mut Engine, p: &Value) -> Res {
    Ok(json!({"groups": presets::new_group(s(p, "name").unwrap_or("Group"))?}))
}

fn preset_alias(_: &mut Engine, p: &Value) -> Res {
    presets::set_alias(s(p, "preset").unwrap_or(""), s(p, "alias"))
}

fn preset_import(_: &mut Engine, p: &Value) -> Res {
    let m = presets::import_file(s(p, "path").unwrap_or(""), s(p, "group"))?;
    Ok(json!({"preset": m["id"], "name": m["name"], "notes": m["notes"]}))
}

fn preset_export(_: &mut Engine, p: &Value) -> Res {
    presets::export(s(p, "preset").unwrap_or(""), s(p, "path").unwrap_or(""))
}

fn preset_reveal(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"folder": presets::user_dir().to_string_lossy()}))
}

fn ingest(e: &mut Engine, p: &Value) -> Res {
    let dest = paths::expand(s(p, "destination").ok_or("pass destination")?);
    let verify = s(p, "verify").unwrap_or("md5").to_string();
    let mut added = Vec::new();
    let list: Vec<String> = p["paths"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(paths::expand)).collect()).unwrap_or_default();
    if list.is_empty() {
        return Err("pass paths".into());
    }
    let transcode = match s(p, "preset") {
        Some(pr) => {
            let row = presets::require(pr)?;
            if row["kind"] == "ingest" { row["transcode"].as_str().map(String::from) } else { row["id"].as_str().map(String::from) }
        }
        None => None,
    };
    let verify = match s(p, "preset").and_then(|pr| presets::find(pr)) { Some(r) if r["kind"] == "ingest" && s(p, "verify").is_none() => r["verify"].as_str().unwrap_or(&verify).to_string(), _ => verify };
    for path in list {
        let src = PathBuf::from(&path);
        if !src.exists() {
            return Err(format!("no file or folder at {path}"));
        }
        let info = if src.is_file() { ffmpeg::probe(&path, None) } else { json!({"kind": "folder", "duration": 0}) };
        let mut it = e.new_item(&path, &info, Some("ingest"));
        let mut copy = e.make_output(None, None, Some("h264"), None, None, "copy")?;
        copy["destination"] = json!(dest);
        copy["verify"] = json!(verify);
        let mut outs = vec![copy];
        if let (Some(t), true) = (&transcode, src.is_file()) {
            outs.push(e.make_output(None, Some(t), None, Some(s(p, "transcodeFolder").unwrap_or(&dest)), None, "encode")?);
        }
        it["outputs"] = json!(outs);
        added.push(it["id"].clone());
        e.items_mut().push(it);
    }
    if bv(p, "start", false) {
        e.start_queue("ingest");
    }
    Ok(json!({"items": added}))
}

fn proxies(e: &mut Engine, p: &Value) -> Res {
    let preset = s(p, "preset").unwrap_or("system/proxy-h264-720").to_string();
    let mut added = Vec::new();
    for f in path_list(p, "paths")? {
        let info = ffmpeg::probe(&f, None);
        let mut it = e.new_item(&f, &info, None);
        let folder = s(p, "folder").map(String::from).unwrap_or_else(|| Path::new(&f).parent().unwrap_or(Path::new(".")).join("Proxies").to_string_lossy().into_owned());
        it["outputs"] = json!([e.make_output(None, Some(&preset), None, Some(&folder), None, "encode")?]);
        it["proxy"] = json!(true);
        added.push(json!({"item": it["id"], "output": it["outputs"][0]["id"]}));
        e.items_mut().push(it);
    }
    if bv(p, "start", false) {
        e.start_queue("proxy");
    }
    Ok(json!({"added": added}))
}

fn analyze(e: &mut Engine, p: &Value) -> Res {
    let mut added = Vec::new();
    for f in path_list(p, "paths")? {
        let info = ffmpeg::probe(&f, None);
        let mut it = e.new_item(&f, &info, None);
        it["outputs"] = json!([e.make_output(None, None, Some("h264"), None, None, "analysis")?]);
        added.push(it["id"].clone());
        e.items_mut().push(it);
    }
    if bv(p, "start", true) {
        e.start_queue("analysis");
    }
    Ok(json!({"items": added}))
}

fn watch_list(e: &mut Engine, _: &Value) -> Res {
    Ok(json!({"watch": e.ui_state()["watch"], "autoEncode": prefs::load()["autoEncodeWatch"]}))
}

fn watch_add(e: &mut Engine, p: &Value) -> Res {
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

fn watch_remove(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let w = e.watch_mut().remove(i);
    Ok(json!({"removed": w["id"]}))
}

fn watch_active(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let on = bv(p, "active", true);
    e.watch_mut()[i]["active"] = json!(on);
    Ok(json!({"watch": e.doc["watch"][i]["id"], "active": on}))
}

fn watch_add_output(e: &mut Engine, p: &Value) -> Res {
    let i = e.watch_index(s(p, "watch").unwrap_or(""))?;
    let preset = if s(p, "preset").is_none() && s(p, "format").is_none() && !p["settings"].is_object() { Some("system/match-source-high") } else { s(p, "preset") };
    let o = e.make_output(p.get("settings"), preset, s(p, "format"), s(p, "folder"), None, "encode")?;
    let oid = o["id"].clone();
    e.watch_mut()[i]["outputs"].as_array_mut().unwrap().push(o);
    Ok(json!({"watch": e.doc["watch"][i]["id"], "output": oid}))
}

fn watch_set_output(e: &mut Engine, p: &Value) -> Res {
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

fn watch_remove_output(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").unwrap_or("").to_string();
    let i = e.watch_index(&oid)?;
    e.watch_mut()[i]["outputs"].as_array_mut().unwrap().retain(|o| o["id"] != json!(oid));
    Ok(json!({"watch": e.doc["watch"][i]["id"], "outputs": e.doc["watch"][i]["outputs"].as_array().map(|o| o.len())}))
}

fn watch_scan(e: &mut Engine, _: &Value) -> Res {
    let p = prefs::load();
    let ids_w: Vec<String> = e.doc["watch"].as_array().unwrap().iter().filter(|w| w["active"].as_bool().unwrap_or(true)).map(|w| w["id"].as_str().unwrap_or("").to_string()).collect();
    let mut n = 0;
    for w in ids_w {
        n += e.scan_watch(&w, &p, true);
    }
    Ok(json!({"added": n}))
}

fn format_list(e: &mut Engine, _: &Value) -> Res {
    let det = encoders::detect(false);
    let st = e.encoder_status.lock().unwrap().clone().unwrap_or(json!({}));
    Ok(json!({"formats": formats::listing(Some(&det)), "hardware": st["hardware"], "ffmpeg": st["ffmpeg"]}))
}

fn format_describe(e: &mut Engine, p: &Value) -> Res {
    let mut sopt = None;
    let mut fmt = s(p, "format").map(String::from);
    if let Some(oid) = s(p, "output") {
        let (i, j) = e.output_ref(&json!(oid))?;
        let st = e.items()[i]["outputs"][j]["settings"].clone();
        fmt = st["format"].as_str().map(String::from);
        sopt = Some(st);
    }
    let fmt = fmt.ok_or("pass format or output")?;
    let det = encoders::detect(false);
    let f = formats::get(&fmt)?;
    let mut out = formats::fields(&fmt, sopt.as_ref())?;
    let codecs: serde_json::Map<String, Value> = formats::strs(&f["video"]).iter().map(|c| (c.clone(), json!({"label": formats::vcodec(c)["label"], "encoders": det.video.get(formats::vcodec(c)["family"].as_str().unwrap_or("")).cloned().unwrap_or_default()}))).collect();
    let acodecs: serde_json::Map<String, Value> = formats::strs(&f["audio"]).iter().map(|c| (c.clone(), json!({"label": formats::acodec(c)["label"], "encoders": det.audio.get(formats::acodec(c)["family"].as_str().unwrap_or("")).cloned().unwrap_or_default()}))).collect();
    out["codecs"] = Value::Object(codecs);
    out["audioCodecs"] = Value::Object(acodecs);
    out["effects"] = settings::effects_default();
    out["loudnessStandards"] = settings::loudness_standards();
    out["positions"] = json!(settings::POSITIONS);
    out["scaling"] = json!(formats::SCALING.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["timeInterpolation"] = json!(formats::INTERPOLATION.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["captions"] = json!(captions::FORMATS.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["defaults"] = settings::default(&fmt)?;
    Ok(out)
}

fn format_encoders(e: &mut Engine, p: &Value) -> Res {
    if bv(p, "refresh", false) {
        encoders::detect(true);
        let st = encoders::status();
        *e.encoder_status.lock().unwrap() = Some(st);
    }
    let cur = e.encoder_status.lock().unwrap().clone();
    Ok(cur.unwrap_or_else(encoders::status))
}

fn media_roots(_: &mut Engine, _: &Value) -> Res {
    let home = paths::home();
    let mut roots = vec![json!({"name": "Home", "path": home.to_string_lossy()})];
    for n in ["Desktop", "Movies", "Videos", "Music", "Pictures", "Downloads", "Documents"] {
        let pth = home.join(n);
        if pth.is_dir() {
            roots.push(json!({"name": n, "path": pth.to_string_lossy()}));
        }
    }
    let mut vols = |base: &Path| {
        if let Ok(rd) = fs::read_dir(base) {
            for en in rd.flatten() {
                if en.path().is_dir() {
                    roots.push(json!({"name": en.file_name().to_string_lossy(), "path": en.path().to_string_lossy(), "volume": true}));
                }
            }
        }
    };
    if cfg!(target_os = "macos") {
        vols(Path::new("/Volumes"));
    } else if cfg!(windows) {
        for d in b'A'..=b'Z' {
            let pth = format!("{}:\\", d as char);
            if Path::new(&pth).exists() {
                roots.push(json!({"name": format!("{}:", d as char), "path": pth, "volume": true}));
            }
        }
    } else {
        vols(Path::new("/media"));
        vols(Path::new("/mnt"));
    }
    roots.push(json!({"name": "formencoder Output", "path": paths::sub("Output").to_string_lossy()}));
    Ok(json!({"roots": roots}))
}

fn card(name: &str) -> Option<&'static str> {
    Some(match name.to_uppercase().as_str() {
        "PRIVATE" => "AVCHD or XAVC card",
        "CONTENTS" => "P2 card",
        "BPAV" => "XDCAM EX card",
        "XDROOT" => "XDCAM card",
        "DCIM" => "Camera card",
        "CLIPS001" => "Canon XF card",
        "M4ROOT" => "Sony card",
        _ => return None,
    })
}

fn media_browse(_: &mut Engine, p: &Value) -> Res {
    let root = PathBuf::from(paths::expand(s(p, "path").ok_or("pass path")?));
    if !root.is_dir() {
        return Err(format!("no folder at {}", root.display()));
    }
    let filter = s(p, "filter").unwrap_or("media");
    let query = s(p, "query").map(|q| q.to_lowercase());
    let mut entries: Vec<PathBuf> = fs::read_dir(&root).map_err(|x| format!("cannot read {}: {x}", root.display()))?.flatten().map(|en| en.path()).collect();
    entries.sort_by_key(|x| (!x.is_dir(), x.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default()));
    let mut rows = Vec::new();
    let mut seen_seq: Vec<String> = Vec::new();
    for pth in entries {
        let name = pth.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.starts_with('.') || query.as_ref().map(|q| !name.to_lowercase().contains(q)).unwrap_or(false) {
            continue;
        }
        if pth.is_dir() {
            rows.push(json!({"name": name, "path": pth.to_string_lossy(), "dir": true, "card": card(&name)}));
            continue;
        }
        let kind = ffmpeg::kind_of(&name);
        if filter == "media" && !matches!(kind, "video" | "audio" | "image" | "link") {
            continue;
        }
        if matches!(filter, "video" | "audio" | "image") && kind != filter {
            continue;
        }
        let md = fs::metadata(&pth).ok();
        let size = md.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = md.and_then(|m| m.modified().ok()).and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64()).unwrap_or(0.0);
        if kind == "image" {
            if let Some(c) = ffmpeg::sequence_regex().captures(&name) {
                let key = format!("{}|{}|{}", &c[1], c[2].len(), &c[3]);
                if seen_seq.contains(&key) {
                    continue;
                }
                if let Some(seq) = ffmpeg::sequence_of(&pth.to_string_lossy()) {
                    seen_seq.push(key);
                    rows.push(json!({"name": format!("{}[{}-{}]{}", &c[1], seq["first"], seq["last"], &c[3]), "path": pth.to_string_lossy(), "dir": false, "kind": "sequence", "frames": seq["count"], "size": size, "modified": modified}));
                    continue;
                }
            }
        }
        let mut row = json!({"name": name, "path": pth.to_string_lossy(), "dir": false, "kind": kind, "size": size, "modified": modified});
        if bv(p, "probe", false) && (kind == "video" || kind == "audio") {
            let info = ffmpeg::probe(&pth.to_string_lossy(), None);
            row["duration"] = info["duration"].clone();
            row["width"] = info["video"]["width"].clone();
            row["height"] = info["video"]["height"].clone();
            row["fps"] = info["video"]["fps"].clone();
            row["codec"] = info["video"]["codec"].clone();
        }
        rows.push(row);
        if rows.len() >= 5000 {
            break;
        }
    }
    Ok(json!({"path": root.to_string_lossy(), "parent": root.parent().map(|x| x.to_string_lossy().into_owned()), "entries": rows}))
}

fn media_probe(_: &mut Engine, p: &Value) -> Res {
    let path = paths::expand(s(p, "path").ok_or("pass path")?);
    let mut info = ffmpeg::probe(&path, p["frameRate"].as_f64());
    if bv(p, "loudness", false) && !info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        info["loudness"] = pipeline::measure_file(&path);
    }
    Ok(info)
}

fn captions_read(_: &mut Engine, p: &Value) -> Res {
    let cues = captions::read_file(&paths::expand(s(p, "path").ok_or("pass path")?))?;
    Ok(json!({"cues": cues.iter().take(2000).map(|c| c.json()).collect::<Vec<_>>(), "count": cues.len()}))
}

fn captions_convert(_: &mut Engine, p: &Value) -> Res {
    let src = paths::expand(s(p, "path").ok_or("pass path")?);
    let to = s(p, "to").unwrap_or("srt");
    let cues = captions::read_file(&src)?;
    let target = s(p, "output").map(paths::expand).unwrap_or_else(|| Path::new(&src).with_extension(captions::sidecar_ext(to)).to_string_lossy().into_owned());
    fs::write(&target, captions::write(&cues, to, "en")).map_err(|x| x.to_string())?;
    Ok(json!({"path": target, "cues": cues.len()}))
}

fn lut_list(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"luts": colour::listing(), "folder": colour::lut_dir().to_string_lossy()}))
}

fn lut_install(_: &mut Engine, p: &Value) -> Res {
    colour::install(s(p, "path").ok_or("pass path")?)
}

fn log_read(_: &mut Engine, p: &Value) -> Res {
    logs::read(s(p, "kind").unwrap_or("encoding"), p["limit"].as_u64().unwrap_or(300) as usize)
}

fn log_clear(_: &mut Engine, p: &Value) -> Res {
    logs::clear(s(p, "kind").unwrap_or("encoding"))
}

fn prefs_get(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"prefs": prefs::load(), "describe": prefs::descriptions(), "dataDir": paths::data_dir().to_string_lossy()}))
}

fn prefs_set(e: &mut Engine, p: &Value) -> Res {
    let vals = p["values"].as_object().ok_or("values is an object")?;
    let out = prefs::save(vals)?;
    if vals.contains_key("ffmpegDir") {
        ffmpeg::set_custom_dir(out["ffmpegDir"].as_str());
        encoders::detect(true);
        *e.encoder_status.lock().unwrap() = Some(encoders::status());
    }
    Ok(json!({"prefs": out}))
}

fn prefs_reset(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"prefs": prefs::reset()}))
}

fn family_queue(e: &mut Engine, p: &Value) -> Res {
    let spec = p["spec"].clone();
    let app = spec["app"].as_str().ok_or("spec.app is required")?.to_string();
    let kind = match app.as_str() { "formwav" => "audio", "formvis" => "image", _ => "video" };
    let w = spec["width"].clone();
    let info = json!({"kind": kind, "duration": spec["duration"].as_f64().unwrap_or(0.0), "video": if w.is_number() { json!({"width": w, "height": spec["height"], "fps": spec["frameRate"]}) } else { Value::Null }, "audio": if app == "formwav" { json!([{"codec": "pcm", "sampleRate": 48000, "channels": 2}]) } else { json!([]) }});
    let key = spec["descriptor"].as_str().map(String::from).unwrap_or_else(|| format!("{app}:{}", spec["id"].as_str().map(String::from).unwrap_or_else(|| spec["id"].to_string())));
    let mut it = e.new_item(&key, &info, Some("family"));
    it["name"] = json!(format!("{} ({app})", spec["name"].as_str().unwrap_or("source")));
    it["family"] = spec.clone();
    let mut q = p.clone();
    if s(p, "preset").is_none() && s(p, "format").is_none() && !p["settings"].is_object() && p["outputs"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        q["preset"] = json!(match app.as_str() { "formwav" => "system/wav-48-24", "formvis" => "system/png-still", _ => "system/match-source-high" });
    }
    it["outputs"] = json!(outputs_spec(e, &q, s(p, "folder"))?);
    let res = json!({"item": it["id"], "output": it["outputs"][0]["id"], "name": it["name"]});
    e.items_mut().push(it);
    if bv(p, "start", false) {
        e.start_queue("family");
    }
    Ok(res)
}

fn family_resolved(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").ok_or("pass output")?;
    let job = e.jobs.get(oid).ok_or("that output is not waiting for family media")?;
    let r = if let Some(err) = s(p, "error") { Err(err.to_string()) } else { Ok(p["media"].clone()) };
    job.shared.lock().unwrap().family = Some(r);
    Ok(json!({"output": oid}))
}

fn publish_result(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").ok_or("pass output")?.to_string();
    let rt = e.runtime.entry(oid.clone()).or_insert_with(|| json!({}));
    rt["publish"] = p["results"].clone();
    rt["publishPending"] = json!(false);
    let failed = p["results"].as_array().map(|a| a.iter().any(|r| !r["ok"].as_bool().unwrap_or(false))).unwrap_or(false);
    if failed {
        e.toast("A publish destination failed; the Encoding log has the reason", "error");
    }
    Ok(json!({"output": oid}))
}

fn undo(e: &mut Engine, _: &Value) -> Res {
    e.do_undo()
}

fn redo(e: &mut Engine, _: &Value) -> Res {
    e.do_redo()
}

fn history(e: &mut Engine, _: &Value) -> Res {
    Ok(json!({"undo": e.undo.iter().map(|u| u.0.clone()).collect::<Vec<_>>(), "redo": e.redo.iter().rev().map(|u| u.0.clone()).collect::<Vec<_>>()}))
}

fn ui_action(e: &mut Engine, p: &Value) -> Res {
    let mut ev = p.clone();
    ev["type"] = json!("uiAction");
    e.emit(ev);
    Ok(p.clone())
}

fn ui_toast(e: &mut Engine, p: &Value) -> Res {
    let t = s(p, "text").unwrap_or("").to_string();
    e.toast(&t, s(p, "kind").unwrap_or("info"));
    Ok(json!({"shown": t}))
}

fn queue_start(e: &mut Engine, _: &Value) -> Res { Ok(e.start_queue("command")) }
fn queue_pause(e: &mut Engine, _: &Value) -> Res { Ok(e.pause_queue()) }
fn queue_stop(e: &mut Engine, _: &Value) -> Res { Ok(e.stop_queue(false)) }

fn queue_stop_current(e: &mut Engine, p: &Value) -> Res {
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

fn auto_encode(e: &mut Engine, p: &Value) -> Res {
    let mut m = serde_json::Map::new();
    m.insert("autoEncodeWatch".into(), json!(bv(p, "enabled", true)));
    prefs::save(&m)?;
    let _ = e;
    Ok(json!({"autoEncodeWatch": bv(p, "enabled", true)}))
}

fn app_capabilities(e: &mut Engine, _: &Value) -> Res {
    let st = e.encoder_status.lock().unwrap().clone().unwrap_or(json!({}));
    Ok(json!({"name": "formencoder", "version": crate::VERSION, "engine": "fe-core (Rust)", "commands": all().len(), "formats": formats::ids().len(), "presets": presets::system().len() + presets::ingest().len(),
              "ffmpeg": st["ffmpeg"], "hardware": st["hardware"], "dataDir": paths::data_dir().to_string_lossy(), "effects": settings::effects_default().as_object().map(|m| m.keys().cloned().collect::<Vec<_>>()),
              "queueExtension": ".fequeue", "presetExtension": format!(".{}", presets::EXT), "time": now()}))
}

fn app_status(e: &mut Engine, _: &Value) -> Res {
    let st = e.ui_state();
    let c = &st["counts"];
    let next = if st["items"].as_array().map(|a| a.is_empty()).unwrap_or(true) { "add sources (queue.addSource, or the encode tool)" } else if c["ready"].as_i64().unwrap_or(0) > 0 && !e.running { "start the queue (queue.start)" } else if e.running { "wait for encoding (the wait tool)" } else { "verify outputs (encode.verify)" };
    let enc = encode_status(e, &json!({}))?;
    Ok(json!({"running": st["running"], "paused": st["paused"], "counts": st["counts"], "items": st["items"].as_array().map(|a| a.len()), "watchFolders": st["watch"].as_array().map(|a| a.len()),
              "encoding": enc["encoding"], "ffmpeg": st["ffmpeg"], "hardware": st["hardware"], "selection": st["selection"], "undo": st["undo"], "next": next, "notices": e.notices.iter().rev().take(5).cloned().collect::<Vec<_>>()}))
}

pub fn all() -> &'static Vec<Cmd> {
    static C: OnceLock<Vec<Cmd>> = OnceLock::new();
    C.get_or_init(|| {
        let c = |id, label, menu, params, required, undoable, query, shortcut, doc, run| Cmd { id, label, menu, params, required, undoable, query, shortcut, doc, run };
        vec![
            c("queue.list", "Queue", "Window", p!(), &[], false, true, "Cmd+1", "Every queue item with its outputs, status and progress.", queue_list),
            c("queue.addSource", "Add Source...", "File", p!("paths" => paths_s(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st(), "outputs" => objs(), "stitch" => bo(), "frameRate" => nu(), "start" => bo()), &["paths"], true, false, "Cmd+I",
              "Adds files to the queue, each with one output (preset or format, default Match Source - High bitrate) or the outputs given. stitch joins them into one source. A numbered image (frame_0001.png) with frameRate adds the whole image sequence.", add_source),
            c("queue.addFolder", "Add Folder...", "File", p!("folder" => st(), "recursive" => bo(), "preset" => preset_s(), "format" => format_s(), "kinds" => json!({"type": "array", "items": en(&["video", "audio", "image"])})), &["folder"], true, false, "", "Adds every media file of a folder.", add_folder),
            c("queue.addOutput", "Add Output", "Queue", p!("item" => st(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st(), "path" => st()), &["item"], true, false, "", "Adds an output to a queue item: a preset or format, or with neither a copy of the item's last output.", add_output),
            c("queue.duplicate", "Duplicate", "Edit", p!("refs" => refs_s()), &["refs"], true, false, "Cmd+D", "", duplicate),
            c("queue.remove", "Clear", "Edit", p!("refs" => refs_s()), &["refs"], true, false, "Delete", "Removes outputs, or whole items when an item is named.", remove),
            c("queue.clearDone", "Clear Completed", "Queue", p!(), &[], true, false, "", "", clear_done),
            c("queue.setPreset", "Apply Preset", "Preset", p!("refs" => refs_s(), "preset" => preset_s()), &["refs", "preset"], true, false, "Cmd+U", "Applies a preset to outputs; their folder, file name and source range are kept.", set_preset),
            c("queue.setFormat", "Set Format", "Queue", p!("refs" => refs_s(), "format" => format_s()), &["refs", "format"], true, false, "", "", set_format),
            c("queue.setSettings", "Export Settings...", "Edit", p!("refs" => refs_s(), "settings" => ob(), "replace" => bo()), &["refs", "settings"], true, false, "Cmd+E",
              "Changes export settings: settings is merged into each output's settings (nested, or dotted keys such as video.targetBitrate); replace swaps the whole object. format.describe lists the fields of a format.", set_settings),
            c("queue.getSettings", "Output Settings", "Queue", p!("output" => st()), &["output"], false, true, "", "One output's complete export settings, its summary, its file and its source.", get_settings),
            c("queue.setOutput", "Set Output File...", "Queue", p!("refs" => refs_s(), "path" => st(), "folder" => st(), "name" => st()), &["refs"], true, false, "",
              "Sets one output's file (path), the folder of several outputs at once, or the output name template ({source} {preset} {format} {date} {time} {width} {height} {fps} {index}).", set_output),
            c("queue.setRange", "Set Source Range", "Queue", p!("refs" => refs_s(), "mode" => en(&["entire", "inout", "custom", "workArea"]), "in" => nu(), "out" => nu()), &["refs"], true, false, "", "In and out points in source seconds.", set_range),
            c("queue.interpret", "Interpret Footage...", "File", p!("item" => st(), "frameRate" => nu(), "pixelAspect" => st(), "fieldOrder" => en(&["source", "progressive", "tff", "bff"]), "alpha" => en(&["source", "ignore", "straight", "premultiplied", "invert"]), "rotation" => int()), &["item"], true, false, "", "Overrides how a source is read.", interpret),
            c("queue.reorder", "Move In Queue", "Queue", p!("item" => st(), "to" => int()), &["item", "to"], true, false, "", "Moves an item to a 1-based position.", reorder),
            c("queue.skip", "Skip Selection", "Edit", p!("refs" => refs_s(), "skip" => bo()), &["refs"], true, false, "", "", skip),
            c("queue.resetStatus", "Reset Status", "Edit", p!("refs" => refs_s()), &["refs"], false, false, "Cmd+.", "Returns outputs to Ready so they encode again.", reset_status),
            c("queue.start", "Start Queue", "Queue", p!(), &[], false, false, "Enter", "Starts or resumes encoding.", queue_start),
            c("queue.pause", "Pause Queue", "Queue", p!(), &[], false, false, "", "", queue_pause),
            c("queue.stop", "Stop Queue", "Queue", p!(), &[], false, false, "Escape", "", queue_stop),
            c("queue.stopCurrent", "Stop Current Item", "Queue", p!("refs" => refs_s()), &[], false, false, "Cmd+-", "", queue_stop_current),
            c("queue.autoEncodeWatch", "Auto-Encode Watch Folders", "Queue", p!("enabled" => bo()), &["enabled"], false, false, "", "", auto_encode),
            c("queue.stitch", "Stitch Clips Together", "File", p!("paths" => paths_s(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st(), "start" => bo()), &["paths"], true, false, "",
              "Joins clips, in the order given, into one source with one output; sizes and rates follow the first clip.", stitch),
            c("queue.select", "Select", "Edit", p!("items" => ids(), "outputs" => ids()), &[], false, true, "", "", select),
            c("queue.save", "Save Queue", "File", p!("path" => st()), &[], false, true, "Cmd+S", "", save_queue),
            c("queue.open", "Open Queue...", "File", p!("path" => st(), "append" => bo()), &["path"], true, false, "", "", open_queue),
            c("encode.status", "Encoding", "Window", p!(), &[], false, true, "Cmd+2", "The outputs being encoded now with progress, speed and time remaining.", encode_status),
            c("encode.report", "Output Report", "Queue", p!("outputs" => ids()), &[], false, true, "", "Final status, file, sidecars, loudness, publish results and errors of outputs.", outputs_report),
            c("encode.estimate", "Estimated File Size", "Queue", p!("output" => st()), &["output"], false, true, "", "", estimate),
            c("encode.command", "Show FFmpeg Command", "Queue", p!("output" => st()), &["output"], false, true, "", "The ffmpeg command line an output would run (Time Tuner analysis left out).", command_line),
            c("encode.verify", "Verify Output", "Queue", p!("path" => st(), "output" => st(), "loudness" => bo()), &[], false, true, "", "Probes an encoded file and checks it against its settings: size, rate, duration, codecs, sample rate, loudness.", verify),
            c("preset.list", "Preset Browser", "Window", p!("query" => st(), "category" => st(), "kind" => en(&["encode", "ingest"])), &[], false, true, "Cmd+3", "", preset_list),
            c("preset.get", "Preset Settings", "Preset", p!("preset" => preset_s()), &["preset"], false, true, "", "", preset_get),
            c("preset.create", "Create Encoding Preset...", "Preset", p!("name" => st(), "settings" => ob(), "fromOutput" => st(), "group" => st(), "comment" => st()), &["name"], false, false, "Cmd+N", "Saves a user preset from settings or from an output's export settings, effects and publish settings included.", preset_create),
            c("preset.update", "Edit Preset...", "Preset", p!("preset" => preset_s(), "name" => st(), "settings" => ob(), "group" => st(), "comment" => st()), &["preset"], false, false, "", "", preset_update),
            c("preset.delete", "Delete Preset", "Preset", p!("preset" => preset_s()), &["preset"], false, false, "", "", preset_delete),
            c("preset.duplicate", "Save A Copy", "Preset", p!("preset" => preset_s(), "name" => st()), &["preset"], false, false, "", "", preset_duplicate),
            c("preset.newGroup", "Create Group", "Preset", p!("name" => st()), &["name"], false, false, "Cmd+G", "", preset_group),
            c("preset.alias", "Create Alias", "Preset", p!("preset" => preset_s(), "alias" => st()), &["preset"], false, false, "", "", preset_alias),
            c("preset.import", "Import Preset...", "Preset", p!("path" => st(), "group" => st()), &["path"], false, false, "", "Imports a .fepreset, a JSON settings file, or a Media Encoder .epr (format, frame size, frame rate, bitrates and sample rate are read).", preset_import),
            c("preset.export", "Export Preset...", "Preset", p!("preset" => preset_s(), "path" => st()), &["preset", "path"], false, false, "", "", preset_export),
            c("preset.reveal", "Reveal Preset Folder", "Preset", p!(), &[], false, true, "", "", preset_reveal),
            c("ingest.copy", "Ingest...", "File", p!("paths" => paths_s(), "destination" => st(), "verify" => en(&["size", "md5", "bit"]), "preset" => preset_s(), "transcodeFolder" => st(), "start" => bo()), &["paths", "destination"], true, false, "",
              "Copies camera media (files or card folders) with verification, and with a preset also transcodes (an ingest preset or any encoding preset).", ingest),
            c("proxy.create", "Create Proxies", "File", p!("paths" => paths_s(), "preset" => preset_s(), "folder" => st(), "start" => bo()), &["paths"], true, false, "", "Queues proxies into a Proxies folder beside each source, named <source>_Proxy.", proxies),
            c("analyze.media", "Analyze Media", "File", p!("paths" => paths_s(), "start" => bo()), &["paths"], true, false, "", "Queues analysis: a .feanalysis.json sidecar with scene changes, black frames, silences and loudness.", analyze),
            c("watch.list", "Watch Folders", "Window", p!(), &[], false, true, "Cmd+4", "", watch_list),
            c("watch.add", "Add Watch Folder...", "File", p!("folder" => st(), "preset" => preset_s(), "format" => format_s(), "outputs" => objs(), "kind" => en(&["encode", "analysis"]), "frameRate" => nu(), "moveSources" => bo()), &["folder"], true, false, "Cmd+Alt+I",
              "Watches a folder: dropped media is queued with the folder's outputs and encoded (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source/<date-time>.", watch_add),
            c("watch.remove", "Remove Watch Folder", "Watch", p!("watch" => st()), &["watch"], true, false, "", "", watch_remove),
            c("watch.setActive", "Watch Folder Active", "Watch", p!("watch" => st(), "active" => bo()), &["watch", "active"], true, false, "", "", watch_active),
            c("watch.addOutput", "Add Watch Folder Output", "Watch", p!("watch" => st(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st()), &["watch"], true, false, "", "", watch_add_output),
            c("watch.setOutput", "Watch Folder Output Settings", "Watch", p!("output" => st(), "preset" => preset_s(), "settings" => ob(), "folder" => st()), &["output"], true, false, "", "", watch_set_output),
            c("watch.removeOutput", "Remove Watch Folder Output", "Watch", p!("output" => st()), &["output"], true, false, "", "", watch_remove_output),
            c("watch.scan", "Scan Watch Folders Now", "Watch", p!(), &[], false, false, "", "Queues what is in the active watch folders now, without waiting for files to settle.", watch_scan),
            c("format.list", "Formats", "Window", p!(), &[], false, true, "", "", format_list),
            c("format.describe", "Format Settings", "Window", p!("format" => format_s(), "output" => st()), &[], false, true, "", "The export settings fields of a format (or an output's) with keys, types and options, its codecs and the encoders this machine has for them.", format_describe),
            c("format.encoders", "Hardware And Encoders", "Window", p!("refresh" => bo()), &[], false, true, "", "", format_encoders),
            c("media.roots", "Media Browser Locations", "Window", p!(), &[], false, true, "", "", media_roots),
            c("media.browse", "Media Browser", "Window", p!("path" => st(), "filter" => en(&["all", "video", "audio", "image", "media"]), "query" => st(), "probe" => bo()), &["path"], false, true, "Cmd+5", "", media_browse),
            c("media.probe", "Media Info", "Window", p!("path" => st(), "frameRate" => nu(), "loudness" => bo()), &["path"], false, true, "", "", media_probe),
            c("captions.read", "Read Captions", "File", p!("path" => st()), &["path"], false, true, "", "", captions_read),
            c("captions.convert", "Convert Captions", "File", p!("path" => st(), "to" => en(&["srt", "vtt", "scc", "ttml"]), "output" => st()), &["path", "to"], false, false, "", "", captions_convert),
            c("lut.list", "LUTs", "Effects", p!(), &[], false, true, "", "", lut_list),
            c("lut.install", "Install LUT...", "Effects", p!("path" => st()), &["path"], false, false, "", "", lut_install),
            c("log.read", "Show Log", "File", p!("kind" => en(&["encoding", "error"]), "limit" => int()), &[], false, true, "Cmd+L", "", log_read),
            c("log.clear", "Clear Log", "File", p!("kind" => en(&["encoding", "error"])), &["kind"], false, false, "", "", log_clear),
            c("prefs.get", "Preferences...", "Edit", p!(), &[], false, true, "Cmd+,", "", prefs_get),
            c("prefs.set", "Set Preferences", "Edit", p!("values" => ob()), &["values"], false, false, "", "", prefs_set),
            c("prefs.reset", "Reset Preferences", "Edit", p!(), &[], false, false, "", "", prefs_reset),
            c("family.queue", "Queue Family Source", "File", p!("spec" => ob(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st(), "outputs" => objs(), "start" => bo()), &["spec"], true, false, "",
              "Queues a source described by the family bridge (family.add finds it in the app and calls this).", family_queue),
            c("family.resolved", "Family Media Ready", "File", p!("output" => st(), "media" => ob(), "error" => st()), &["output"], false, true, "", "The service hands a waiting output the media the family app produced.", family_resolved),
            c("publish.result", "Publish Result", "Publish", p!("output" => st(), "results" => json!({"type": "array"})), &["output", "results"], false, false, "", "", publish_result),
            c("edit.undo", "Undo", "Edit", p!(), &[], false, false, "Cmd+Z", "", undo),
            c("edit.redo", "Redo", "Edit", p!(), &[], false, false, "Cmd+Shift+Z", "", redo),
            c("history.list", "History", "Edit", p!(), &[], false, true, "", "", history),
            c("ui.panel", "Show Panel", "Window", p!("panel" => en(&["queue", "encoding", "watch", "media", "presets", "family", "log", "info", "terminal", "agents"])), &["panel"], false, true, "", "", |e, p| ui_action(e, &json!({"action": "panel", "panel": p["panel"]}))),
            c("ui.workspace", "Workspace", "Window", p!("name" => en(&["Default", "Encoding", "Ingest", "Agent"])), &["name"], false, true, "", "", |e, p| ui_action(e, &json!({"action": "workspace", "name": p["name"]}))),
            c("ui.exportSettings", "Open Export Settings", "Window", p!("output" => st()), &["output"], false, true, "", "", |e, p| { e.output_ref(&p["output"])?; ui_action(e, &json!({"action": "exportSettings", "output": p["output"]})) }),
            c("ui.toast", "Show Message", "Window", p!("text" => st(), "kind" => en(&["info", "ok", "error"])), &["text"], false, true, "", "", ui_toast),
            c("app.capabilities", "About formencoder", "Help", p!(), &[], false, true, "", "", app_capabilities),
            c("app.status", "Status", "Help", p!(), &[], false, true, "", "", app_status),
        ]
    })
}

pub fn get(id: &str) -> Res<&'static Cmd> {
    all().iter().find(|c| c.id == id).ok_or_else(|| {
        let ns = id.split('.').next().unwrap_or("");
        let near: Vec<&str> = all().iter().filter(|c| c.id.starts_with(&format!("{ns}."))).map(|c| c.id).take(14).collect();
        if near.is_empty() { format!("no command {id:?}; command.list shows every command") } else { format!("no command {id:?}; in that namespace: {}", near.join(", ")) }
    })
}

pub fn check(cmd: &Cmd, params: Value) -> Res {
    let params = if params.is_null() { json!({}) } else { params };
    let m = params.as_object().ok_or_else(|| format!("{}: params must be an object", cmd.id))?;
    let missing: Vec<&str> = cmd.required.iter().filter(|k| m.get(**k).map(Value::is_null).unwrap_or(true)).cloned().collect();
    if !missing.is_empty() {
        return Err(format!("{}: missing {} (schema: {})", cmd.id, missing.join(", "), cmd.summary()));
    }
    let unknown: Vec<&String> = m.keys().filter(|k| cmd.params.get(k.as_str()).is_none()).collect();
    if !unknown.is_empty() {
        return Err(format!("{}: unknown parameter {} (schema: {})", cmd.id, unknown.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "), cmd.summary()));
    }
    for (k, v) in m {
        if let Some(list) = cmd.params[k].get("enum").and_then(Value::as_array) {
            if !v.is_null() && !list.contains(v) {
                return Err(format!("{}: {k} must be one of {}", cmd.id, list.iter().map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect::<Vec<_>>().join(", ")));
            }
        }
    }
    Ok(params)
}

pub fn listing(filter: Option<&str>, schemas: bool) -> Vec<Value> {
    let f = filter.map(|x| x.to_lowercase());
    all().iter().filter(|c| f.as_ref().map(|q| c.id.contains(q.as_str()) || c.label.to_lowercase().contains(q.as_str()) || c.menu.to_lowercase() == *q).unwrap_or(true)).map(|c| c.row(schemas)).collect()
}

pub fn menus() -> Value {
    let mut m: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for c in all() {
        if !c.menu.is_empty() {
            m.entry(c.menu.to_string()).or_default().push(json!({"id": c.id, "label": c.label, "shortcut": c.shortcut}));
        }
    }
    json!(m)
}
