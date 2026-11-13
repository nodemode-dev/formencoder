use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{Value, json};

use crate::runner::{self, Job};
use crate::util::{Res, local_stamp, new_id, now};
use crate::{encoders, ffmpeg, formats, logs, paths, prefs, presets, settings};

pub const FINAL: &[&str] = &["done", "failed", "stopped"];

pub struct Engine {
    pub doc: Value,
    pub runtime: HashMap<String, Value>,
    pub undo: Vec<(String, Value)>,
    pub redo: Vec<(String, Value)>,
    pub revision: u64,
    pub running: bool,
    pub paused: bool,
    pub jobs: HashMap<String, Job>,
    pub events: Vec<Value>,
    pub activity: VecDeque<Value>,
    pub notices: VecDeque<Value>,
    pub selection: Value,
    pub last_interaction: f64,
    watch_seen: HashMap<String, HashMap<String, (u64, f64, f64, bool)>>,
    watch_scanned: HashMap<String, f64>,
    watch_online: HashMap<String, bool>,
    save_due: f64,
    pub encoder_status: Arc<Mutex<Option<Value>>>,
    pub queue_started: Option<f64>,
    last_progress: HashMap<String, f64>,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        let p = prefs::load();
        ffmpeg::set_custom_dir(p["ffmpegDir"].as_str());
        let status = Arc::new(Mutex::new(None));
        let s2 = status.clone();
        thread::spawn(move || {
            let st = encoders::status();
            *s2.lock().unwrap() = Some(st);
        });
        let mut e = Engine {
            doc: json!({"items": [], "watch": []}),
            runtime: HashMap::new(),
            undo: Vec::new(),
            redo: Vec::new(),
            revision: 0,
            running: false,
            paused: false,
            jobs: HashMap::new(),
            events: Vec::new(),
            activity: VecDeque::new(),
            notices: VecDeque::new(),
            selection: json!({"items": [], "outputs": []}),
            last_interaction: now(),
            watch_seen: HashMap::new(),
            watch_scanned: HashMap::new(),
            watch_online: HashMap::new(),
            save_due: 0.0,
            encoder_status: status,
            queue_started: None,
            last_progress: HashMap::new(),
        };
        e.load();
        let limit = (p["cacheLimitGB"].as_f64().unwrap_or(20.0).max(0.0) * 1024.0 * 1024.0 * 1024.0) as u64;
        if limit > 0 {
            std::thread::spawn(move || paths::trim_cache(limit, &[]));
        }
        e
    }

    pub fn jobs_running(&self) -> Vec<String> {
        self.jobs.keys().cloned().collect()
    }

    fn queue_file() -> PathBuf {
        paths::data_dir().join("queue.json")
    }

    fn load(&mut self) {
        let Ok(text) = fs::read_to_string(Self::queue_file()) else { return };
        let Ok(data) = serde_json::from_str::<Value>(&text) else { return };
        if data["doc"].is_object() {
            self.doc = json!({"items": data["doc"]["items"].as_array().cloned().unwrap_or_default(), "watch": data["doc"]["watch"].as_array().cloned().unwrap_or_default()});
        }
        if let Some(rt) = data["runtime"].as_object() {
            for (k, v) in rt {
                if FINAL.contains(&v["status"].as_str().unwrap_or("")) {
                    self.runtime.insert(k.clone(), v.clone());
                }
            }
        }
    }

    pub fn save(&mut self) {
        let keep: serde_json::Map<String, Value> = self.runtime.iter().filter(|(_, v)| FINAL.contains(&v["status"].as_str().unwrap_or(""))).map(|(k, v)| {
            let mut c = v.clone();
            if let Value::Object(m) = &mut c {
                m.remove("command");
            }
            (k.clone(), c)
        }).collect();
        let data = json!({"format": "formencoder.queue/1", "version": crate::VERSION, "doc": self.doc, "runtime": keep});
        let path = Self::queue_file();
        let staged = path.with_extension("tmp");
        if fs::write(&staged, serde_json::to_string_pretty(&data).unwrap_or_default()).is_ok() {
            let _ = fs::rename(&staged, &path);
        }
    }

    pub fn shutdown(&mut self) {
        for j in self.jobs.values() {
            j.stop();
        }
        if prefs::load()["removeCompletedOnExit"].as_bool().unwrap_or(false) {
            let rt = self.runtime.clone();
            if let Some(items) = self.doc["items"].as_array_mut() {
                items.retain(|it| !it["outputs"].as_array().map(|o| !o.is_empty() && o.iter().all(|x| rt.get(x["id"].as_str().unwrap_or("")).map(|r| r["status"] == "done").unwrap_or(false))).unwrap_or(false));
            }
        }
        self.save();
    }

    pub fn emit(&mut self, ev: Value) {
        self.events.push(ev);
        if self.events.len() > 5000 {
            self.events.drain(0..1000);
        }
    }

    pub fn changed(&mut self, edited: bool, source: &str) {
        self.revision += 1;
        self.save_due = now() + 0.6;
        let rev = self.revision;
        self.emit(json!({"type": "changed", "revision": rev, "edited": edited, "source": source}));
    }

    pub fn note(&mut self, source: &str, command: &str, ok: bool, error: Option<&str>) {
        let entry = json!({"time": now(), "source": source, "command": command, "ok": ok, "error": error});
        self.activity.push_back(entry.clone());
        while self.activity.len() > 300 {
            self.activity.pop_front();
        }
        if source != "ui" {
            let mut ev = entry;
            ev["type"] = json!("activity");
            self.emit(ev);
        }
    }

    pub fn toast(&mut self, text: &str, kind: &str) {
        self.notices.push_back(json!({"time": now(), "text": text, "kind": kind}));
        while self.notices.len() > 50 {
            self.notices.pop_front();
        }
        self.emit(json!({"type": "toast", "text": text, "kind": kind}));
    }

    pub fn do_undo(&mut self) -> Res {
        let (label, snap) = self.undo.pop().ok_or("nothing to undo")?;
        self.redo.push((label.clone(), std::mem::replace(&mut self.doc, snap)));
        Ok(json!({"undone": label}))
    }

    pub fn do_redo(&mut self) -> Res {
        let (label, snap) = self.redo.pop().ok_or("nothing to redo")?;
        self.undo.push((label.clone(), std::mem::replace(&mut self.doc, snap)));
        Ok(json!({"redone": label}))
    }

    pub fn items(&self) -> &Vec<Value> {
        self.doc["items"].as_array().expect("items")
    }

    pub fn items_mut(&mut self) -> &mut Vec<Value> {
        self.doc["items"].as_array_mut().expect("items")
    }

    pub fn watch_mut(&mut self) -> &mut Vec<Value> {
        self.doc["watch"].as_array_mut().expect("watch")
    }

    pub fn item_index(&self, r: &Value) -> Res<usize> {
        let items = self.items();
        let key = match r {
            Value::Number(n) => format!("#{}", n),
            Value::String(s) => s.clone(),
            _ => return Err("an item is an id, '#n' or a name".into()),
        };
        if let Some(num) = key.strip_prefix('#').and_then(|x| x.parse::<usize>().ok()) {
            if num >= 1 && num <= items.len() {
                return Ok(num - 1);
            }
            return Err(format!("no queue item #{num}; the queue has {}", items.len()));
        }
        if let Some(i) = items.iter().position(|it| it["id"] == json!(key) || it["name"] == json!(key)) {
            return Ok(i);
        }
        if let Some(i) = items.iter().position(|it| it["outputs"].as_array().map(|o| o.iter().any(|x| x["id"] == json!(key))).unwrap_or(false)) {
            return Ok(i);
        }
        Err(format!("no queue item {key:?} (queue.list shows ids)"))
    }

    pub fn output_pos(&self, oid: &str) -> Option<(usize, usize)> {
        for (i, it) in self.items().iter().enumerate() {
            if let Some(j) = it["outputs"].as_array().and_then(|o| o.iter().position(|x| x["id"] == json!(oid))) {
                return Some((i, j));
            }
        }
        None
    }

    pub fn output_ref(&self, r: &Value) -> Res<(usize, usize)> {
        if let Some(s) = r.as_str() {
            if let Some(p) = self.output_pos(s) {
                return Ok(p);
            }
        }
        let i = self.item_index(r)?;
        if self.items()[i]["outputs"].as_array().map(|o| o.is_empty()).unwrap_or(true) {
            return Err(format!("{} has no outputs", self.items()[i]["name"].as_str().unwrap_or("")));
        }
        Ok((i, 0))
    }

    pub fn refs(&self, refs: &Value) -> Res<Vec<(usize, usize)>> {
        let list: Vec<Value> = match refs {
            Value::Null => vec![json!("all")],
            Value::Array(a) => a.clone(),
            other => vec![other.clone()],
        };
        let mut out = Vec::new();
        for r in list {
            match r.as_str() {
                Some("all") => {
                    for (i, it) in self.items().iter().enumerate() {
                        for j in 0..it["outputs"].as_array().map(|o| o.len()).unwrap_or(0) {
                            out.push((i, j));
                        }
                    }
                }
                Some("selected") => {
                    let mut sel: Vec<Value> = self.selection["outputs"].as_array().cloned().unwrap_or_default();
                    if sel.is_empty() {
                        sel = self.selection["items"].as_array().cloned().unwrap_or_default();
                    }
                    for s in sel {
                        out.extend(self.refs(&s)?);
                    }
                }
                Some(s) if self.output_pos(s).is_some() => out.push(self.output_pos(s).unwrap()),
                _ => {
                    let i = self.item_index(&r)?;
                    for j in 0..self.items()[i]["outputs"].as_array().map(|o| o.len()).unwrap_or(0) {
                        out.push((i, j));
                    }
                }
            }
        }
        out.sort();
        out.dedup();
        Ok(out)
    }

    pub fn watch_index(&self, r: &str) -> Res<usize> {
        let w = self.doc["watch"].as_array().unwrap();
        if let Some(n) = r.strip_prefix('#').and_then(|x| x.parse::<usize>().ok()) {
            if n >= 1 && n <= w.len() {
                return Ok(n - 1);
            }
        }
        w.iter().position(|x| x["id"] == json!(r) || x["folder"] == json!(r) || x["outputs"].as_array().map(|o| o.iter().any(|y| y["id"] == json!(r))).unwrap_or(false)).ok_or_else(|| format!("no watch folder {r:?} (watch.list shows them)"))
    }

    pub fn status_of(&self, output: &Value) -> String {
        if output["skip"].as_bool().unwrap_or(false) {
            return "skipped".into();
        }
        self.runtime.get(output["id"].as_str().unwrap_or("")).and_then(|r| r["status"].as_str()).unwrap_or("ready").to_string()
    }

    pub fn make_output(&self, settings_v: Option<&Value>, preset: Option<&str>, fmt: Option<&str>, folder: Option<&str>, path: Option<&str>, kind: &str) -> Res {
        let given = settings_v.filter(|v| v.is_object());
        let mut s = if let Some(p) = preset.filter(|p| !p.is_empty()) {
            presets::settings_for(p)?
        } else {
            let base_fmt = fmt.or_else(|| given.and_then(|g| g["format"].as_str())).unwrap_or("h264");
            settings::normalize(&json!({"format": base_fmt}))?
        };
        if let Some(f) = fmt {
            if s["format"] != json!(f) {
                s = settings::apply_patch(&s, &json!({"format": f}))?;
            }
        }
        if let Some(sv) = given {
            s = settings::apply_patch(&s, sv)?;
        }
        Ok(json!({"id": new_id("o"), "kind": kind, "settings": s, "folder": folder.map(|f| paths::expand(f)), "path": path.map(|p| paths::expand(p)), "skip": false}))
    }

    pub fn new_item(&self, path: &str, info: &Value, kind: Option<&str>) -> Value {
        let name = if path.contains("%0") { settings::source_stem(path) } else { Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string()) };
        let k = kind.map(String::from).unwrap_or_else(|| if info["kind"] == "sequence" { "sequence".into() } else { "file".into() });
        json!({"id": new_id("i"), "kind": k, "path": path, "name": name, "info": ffmpeg::light(info), "interpret": {}, "range": {}, "outputs": [], "added": now()})
    }

    pub fn output_path(&self, item: &Value, output: &Value) -> String {
        let s = &output["settings"];
        if let Some(p) = output["path"].as_str().filter(|p| !p.is_empty()) {
            let mut pb = PathBuf::from(p);
            let want = settings::extension(s);
            if formats::get(s["format"].as_str().unwrap_or("")).map(|f| f.get("folder").is_some()).unwrap_or(false) {
                return pb.to_string_lossy().into_owned();
            }
            if formats::is_image(s["format"].as_str().unwrap_or("")) && s["video"]["sequence"].as_bool().unwrap_or(false) && !p.contains("%0") {
                let stem = pb.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
                return pb.with_file_name(format!("{stem}_%06d.{want}")).to_string_lossy().into_owned();
            }
            if pb.extension().map(|e| e.to_string_lossy().to_lowercase()) != Some(want.clone()) {
                pb.set_extension(&want);
            }
            return pb.to_string_lossy().into_owned();
        }
        let p = prefs::load();
        let mut folder = output["folder"].as_str().filter(|f| !f.is_empty()).map(String::from).unwrap_or_else(|| p["outputFolder"].as_str().unwrap_or("").to_string());
        let src = item["path"].as_str().unwrap_or("");
        let kind = item["kind"].as_str().unwrap_or("file");
        if folder.is_empty() {
            folder = if kind == "family" || src.is_empty() || !p["outputBesideSource"].as_bool().unwrap_or(true) {
                paths::sub("Output").to_string_lossy().into_owned()
            } else {
                Path::new(&src.replace("%0", "x")).parent().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default()
            };
        }
        let index = item["outputs"].as_array().and_then(|o| o.iter().position(|x| x["id"] == output["id"])).map(|i| i + 1).unwrap_or(1);
        let stem = if kind == "family" || kind == "stitch" { Some(crate::util::file_safe(item["name"].as_str().unwrap_or("Output"))) } else { None };
        let name = settings::output_name(s, src, &item["info"], index, stem.as_deref());
        PathBuf::from(paths::expand(&folder)).join(name).to_string_lossy().into_owned()
    }

    pub fn missing(&self, item: &Value, output: &Value) -> Vec<String> {
        let mut out = Vec::new();
        let kind = item["kind"].as_str().unwrap_or("file");
        if kind == "file" || kind == "sequence" || kind == "ingest" {
            let p = item["path"].as_str().unwrap_or("");
            let ok = if p.contains("%0") { Path::new(p).parent().map(|x| x.is_dir()).unwrap_or(false) } else { Path::new(p).exists() };
            if !ok {
                out.push(p.to_string());
            }
        }
        if kind == "stitch" {
            for p in item["stitch"].as_array().cloned().unwrap_or_default() {
                if !Path::new(p.as_str().unwrap_or("")).exists() {
                    out.push(p.as_str().unwrap_or("").into());
                }
            }
        }
        let eff = &output["settings"]["effects"];
        if eff["imageOverlay"]["enabled"].as_bool().unwrap_or(false) && !Path::new(&paths::expand(eff["imageOverlay"]["path"].as_str().unwrap_or(""))).is_file() {
            out.push(eff["imageOverlay"]["path"].as_str().unwrap_or("overlay image").into());
        }
        if eff["lut"]["enabled"].as_bool().unwrap_or(false) && crate::colour::resolve(eff["lut"]["path"].as_str().unwrap_or("")).is_none() {
            out.push(eff["lut"]["path"].as_str().unwrap_or("LUT").into());
        }
        out
    }

    pub fn start_queue(&mut self, why: &str) -> Value {
        self.running = true;
        self.paused = false;
        self.queue_started = Some(now());
        for j in self.jobs.values() {
            j.pause(false);
        }
        self.emit(json!({"type": "queue", "running": true, "paused": false, "why": why}));
        json!({"running": true})
    }

    pub fn pause_queue(&mut self) -> Value {
        self.paused = true;
        for j in self.jobs.values() {
            j.pause(true);
        }
        let running = self.running;
        self.emit(json!({"type": "queue", "running": running, "paused": true}));
        json!({"paused": true})
    }

    pub fn stop_queue(&mut self, current_only: bool) -> Value {
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        for j in self.jobs.values() {
            j.stop();
        }
        if !current_only {
            self.running = false;
            self.paused = false;
        }
        let (r, p) = (self.running, self.paused);
        self.emit(json!({"type": "queue", "running": r, "paused": p}));
        json!({"stopped": ids, "running": r})
    }

    pub fn counts(&self) -> Value {
        let mut c: BTreeMap<String, i64> = BTreeMap::new();
        let mut total = 0;
        for it in self.items() {
            for o in it["outputs"].as_array().cloned().unwrap_or_default() {
                *c.entry(self.status_of(&o)).or_default() += 1;
                total += 1;
            }
        }
        let g = |k: &str| *c.get(k).unwrap_or(&0);
        json!({"total": total, "ready": g("ready"), "encoding": g("encoding") + g("paused") + g("preparing"), "done": g("done"), "failed": g("failed"), "stopped": g("stopped"), "skipped": g("skipped")})
    }

    fn has_ready(&self) -> bool {
        self.items().iter().any(|it| it["outputs"].as_array().map(|o| o.iter().any(|x| self.status_of(x) == "ready")).unwrap_or(false))
    }

    pub fn tick(&mut self, t: f64) -> Value {
        let mut finished: Vec<String> = Vec::new();
        let mut progress: Vec<(String, Value)> = Vec::new();
        let mut requests: Vec<Value> = Vec::new();
        for (oid, job) in &self.jobs {
            let mut s = job.shared.lock().unwrap();
            for u in s.updates.drain(..) {
                progress.push((oid.clone(), u));
            }
            requests.extend(s.requests.drain(..));
            if s.result.is_some() {
                finished.push(oid.clone());
            }
        }
        for (oid, u) in progress {
            let rt = self.runtime.entry(oid.clone()).or_insert_with(|| json!({"status": "encoding"}));
            if let (Value::Object(m), Value::Object(n)) = (rt, &u) {
                for (k, v) in n {
                    m.insert(k.clone(), v.clone());
                }
            }
            let important = u.get("status").is_some() || u.get("path").is_some();
            let last = *self.last_progress.get(&oid).unwrap_or(&0.0);
            if important || t - last >= 0.2 {
                self.last_progress.insert(oid.clone(), t);
                let mut ev = self.runtime[&oid].clone();
                if let Value::Object(m) = &mut ev {
                    m.remove("command");
                    m.remove("summary");
                }
                ev["type"] = json!("progress");
                ev["output"] = json!(oid);
                self.emit(ev);
            }
        }
        for r in requests {
            self.emit(r);
        }
        for oid in finished {
            if let Some(job) = self.jobs.remove(&oid) {
                let result = job.shared.lock().unwrap().result.take().unwrap_or(json!({"status": "failed"}));
                if let Some(h) = job.handle {
                    let _ = h.join();
                }
                self.finish(&oid, result);
            }
        }
        let p = prefs::load();
        let watch_ids: Vec<(String, bool)> = self.doc["watch"].as_array().unwrap().iter().map(|w| (w["id"].as_str().unwrap_or("").to_string(), w["active"].as_bool().unwrap_or(true))).collect();
        for (wid, active) in watch_ids {
            if !active {
                continue;
            }
            if t - self.watch_scanned.get(&wid).copied().unwrap_or(0.0) >= p["watchInterval"].as_f64().unwrap_or(2.0) {
                self.watch_scanned.insert(wid.clone(), t);
                self.scan_watch(&wid, &p, false);
            }
        }
        if p["autoStartIdle"].as_bool().unwrap_or(false) && !self.running && self.has_ready() && t - self.last_interaction >= p["autoStartMinutes"].as_f64().unwrap_or(2.0) * 60.0 {
            self.start_queue("idle");
            self.changed(false, "engine");
        }
        self.dispatch(&p);
        if self.save_due > 0.0 && t >= self.save_due {
            self.save_due = 0.0;
            self.save();
        }
        json!({"jobs": self.jobs.len(), "running": self.running})
    }

    fn finish(&mut self, oid: &str, result: Value) {
        let status = result["status"].as_str().unwrap_or("failed").to_string();
        let rt = self.runtime.entry(oid.to_string()).or_insert_with(|| json!({}));
        if let (Value::Object(m), Value::Object(n)) = (rt, &result) {
            for (k, v) in n {
                m.insert(k.clone(), v.clone());
            }
        }
        let rt = self.runtime[oid].clone();
        if let Some((i, j)) = self.output_pos(oid) {
            let item = self.items()[i].clone();
            let output = item["outputs"][j].clone();
            logs::entry(&item, &output, &rt);
            self.emit(json!({"type": "finished", "output": oid, "item": item["id"], "status": status, "path": rt["path"], "error": rt["error"]}));
            let p = prefs::load();
            if p["notify"] == "item" {
                self.emit(json!({"type": "notify", "title": format!("{} {status}", item["name"].as_str().unwrap_or("")), "body": rt["path"].as_str().or(rt["error"].as_str()).unwrap_or(""), "chime": p["chime"]}));
            }
            let all_done = item["outputs"].as_array().map(|o| o.iter().all(|x| self.status_of(x) == "done")).unwrap_or(false);
            if all_done && item["origin"]["watch"].is_string() {
                self.archive_watch_source(&item);
            }
        }
        self.changed(false, "engine");
    }

    fn archive_watch_source(&mut self, item: &Value) {
        let Ok(wi) = self.watch_index(item["origin"]["watch"].as_str().unwrap_or("")) else { return };
        let w = self.doc["watch"][wi].clone();
        if !w["moveSources"].as_bool().unwrap_or(true) {
            return;
        }
        let dest = Path::new(w["folder"].as_str().unwrap_or("")).join("Source").join(local_stamp("%Y-%m-%d_%H-%M-%S"));
        let _ = fs::create_dir_all(&dest);
        let files: Vec<String> = item["origin"]["files"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_else(|| vec![item["path"].as_str().unwrap_or("").to_string()]);
        for f in files {
            let p = Path::new(&f);
            if p.exists() {
                if let Some(name) = p.file_name() {
                    if fs::rename(p, dest.join(name)).is_err() && fs::copy(p, dest.join(name)).is_ok() {
                        let _ = fs::remove_file(p);
                    }
                }
            }
        }
    }

    fn dispatch(&mut self, p: &Value) {
        if self.paused {
            return;
        }
        let slots = if p["parallel"].as_bool().unwrap_or(true) { p["maxParallel"].as_i64().unwrap_or(3).max(1) as usize } else { 1 };
        let auto_watch = p["autoEncodeWatch"].as_bool().unwrap_or(true);
        let active_items: HashSet<String> = self.jobs.values().map(|j| j.item_id.clone()).collect();
        let mut candidates: Vec<(usize, usize)> = Vec::new();
        for (i, it) in self.items().iter().enumerate() {
            let watch_item = it["origin"]["watch"].is_string();
            if !(self.running || (auto_watch && watch_item)) {
                continue;
            }
            for (j, o) in it["outputs"].as_array().cloned().unwrap_or_default().iter().enumerate() {
                if self.status_of(o) == "ready" && !self.jobs.contains_key(o["id"].as_str().unwrap_or("")) {
                    candidates.push((i, j));
                }
            }
        }
        if candidates.is_empty() {
            if self.running && self.jobs.is_empty() {
                self.running = false;
                let line = self.counts();
                self.emit(json!({"type": "queue", "running": false, "paused": false, "done": true}));
                self.emit(json!({"type": "notify", "title": "Queue finished", "body": format!("{} done, {} failed, {} stopped of {}", line["done"], line["failed"], line["stopped"], line["total"]), "chime": p["chime"].as_bool().unwrap_or(true) && p["notify"] != "never"}));
                self.changed(false, "engine");
            }
            return;
        }
        let pick: Vec<(usize, usize)> = if p["parallel"].as_bool().unwrap_or(true) {
            let focus = active_items.iter().next().cloned().unwrap_or_else(|| self.items()[candidates[0].0]["id"].as_str().unwrap_or("").to_string());
            let mut v: Vec<(usize, usize)> = candidates.iter().filter(|(i, _)| self.items()[*i]["id"] == json!(focus)).cloned().collect();
            if v.is_empty() && self.jobs.is_empty() {
                let first = candidates[0].0;
                v = candidates.iter().filter(|(i, _)| *i == first).cloned().collect();
            }
            v
        } else if self.jobs.is_empty() {
            candidates[..1].to_vec()
        } else {
            vec![]
        };
        let mut started = false;
        let reserve = (p["memoryReserveGB"].as_f64().unwrap_or(4.0).max(0.0) * 1024.0 * 1024.0 * 1024.0) as u64;
        for (i, j) in pick {
            if self.jobs.len() >= slots {
                break;
            }
            if !self.jobs.is_empty() && reserve > 0 {
                if let Some(free) = crate::util::available_memory() {
                    if free < reserve {
                        break;
                    }
                }
            }
            let item = self.items()[i].clone();
            let output = item["outputs"][j].clone();
            let oid = output["id"].as_str().unwrap_or("").to_string();
            let miss = self.missing(&item, &output);
            if !miss.is_empty() && p["skipMissing"].as_bool().unwrap_or(true) {
                let names: Vec<String> = miss.iter().map(|m| Path::new(m).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(m.clone())).collect();
                let rt = json!({"status": "failed", "error": format!("missing: {}", names.join(", ")), "finished": now()});
                self.runtime.insert(oid.clone(), rt);
                let rt = self.runtime[&oid].clone();
                logs::entry(&item, &output, &rt);
                self.emit(json!({"type": "finished", "output": oid, "item": item["id"], "status": "failed", "error": rt["error"]}));
                started = true;
                continue;
            }
            let mut out_path = self.output_path(&item, &output);
            let busy: HashSet<String> = self.jobs.keys().filter_map(|k| self.runtime.get(k).and_then(|r| r["path"].as_str()).map(String::from)).collect();
            let encodes = !matches!(output["kind"].as_str(), Some("copy" | "analysis" | "transcribe"));
            if encodes && !out_path.contains("%0") && (busy.contains(&out_path) || (p["incrementNames"].as_bool().unwrap_or(true) && Path::new(&out_path).exists())) {
                let pb = Path::new(&out_path);
                let stem = pb.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
                let ext = pb.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default();
                let next = (1..10000).map(|i| pb.with_file_name(format!("{stem}_{i}{ext}")).to_string_lossy().into_owned()).find(|c| !busy.contains(c) && !Path::new(c).exists());
                if let Some(c) = next {
                    out_path = c;
                }
            }
            self.runtime.insert(oid.clone(), json!({"status": "encoding", "progress": 0.0, "started": now(), "path": out_path}));
            let job = runner::start(item, output, out_path, p.clone());
            self.jobs.insert(oid.clone(), job);
            self.emit(json!({"type": "progress", "output": oid, "status": "encoding", "progress": 0.0}));
            started = true;
        }
        if started {
            self.changed(false, "engine");
        }
    }

    pub fn chain_folder(&self, w: &Value) -> Option<PathBuf> {
        let to = w["chainTo"].as_str()?;
        self.doc["watch"].as_array()?.iter().find(|x| x["id"] == json!(to)).and_then(|x| x["folder"].as_str()).map(PathBuf::from)
    }

    pub fn scan_watch(&mut self, wid: &str, p: &Value, immediate: bool) -> usize {
        let Ok(wi) = self.watch_index(wid) else { return 0 };
        let w = self.doc["watch"][wi].clone();
        let folder = PathBuf::from(w["folder"].as_str().unwrap_or(""));
        let online = folder.is_dir();
        let was = self.watch_online.insert(wid.to_string(), online);
        if was.is_some() && was != Some(online) {
            let fname = folder.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            if online {
                self.toast(&format!("Watch folder {fname} is reachable again"), "ok");
            } else {
                self.toast(&format!("Watch folder {fname} cannot be reached; formencoder keeps checking"), "error");
            }
            self.changed(false, "watch");
        }
        if !online {
            return 0;
        }
        let default_out = self.chain_folder(&w).unwrap_or_else(|| folder.join("Output"));
        let t = now();
        let settle = if immediate { 0.0 } else { p["watchSettle"].as_f64().unwrap_or(4.0) };
        let known: HashSet<String> = self.items().iter().flat_map(|it| {
            let mut v = vec![it["path"].as_str().unwrap_or("").to_string()];
            v.extend(it["origin"]["files"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_str().map(String::from)));
            v
        }).collect();
        let seen = self.watch_seen.entry(wid.to_string()).or_default();
        let mut stable: Vec<PathBuf> = Vec::new();
        if let Ok(rd) = fs::read_dir(&folder) {
            for e in rd.flatten() {
                let path = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                if !path.is_file() || name.starts_with('.') || !ffmpeg::is_media(&name) {
                    continue;
                }
                let Ok(md) = e.metadata() else { continue };
                let size = md.len();
                let mtime = md.modified().ok().and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64()).unwrap_or(0.0);
                let key = path.to_string_lossy().into_owned();
                match seen.get(&key) {
                    Some((s0, m0, since, queued)) if *s0 == size && *m0 == mtime => {
                        if !*queued && t - since >= settle && !known.contains(&key) {
                            stable.push(path.clone());
                        }
                    }
                    _ => {
                        seen.insert(key.clone(), (size, mtime, if immediate { t - 1e6 } else { t }, false));
                        if immediate && !known.contains(&key) {
                            stable.push(path.clone());
                        }
                    }
                }
            }
        }
        if stable.is_empty() {
            return 0;
        }
        let mut groups: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
        let mut singles: Vec<PathBuf> = Vec::new();
        for pth in stable {
            let name = pth.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if p["watchSequences"].as_bool().unwrap_or(true) && ffmpeg::kind_of(&name) == "image" {
                if let Some(c) = ffmpeg::sequence_regex().captures(&name) {
                    groups.entry(format!("{}|{}|{}", &c[1], c[2].len(), &c[3])).or_default().push(pth);
                    continue;
                }
            }
            singles.push(pth);
        }
        let mut added: Vec<Value> = Vec::new();
        let wait = if immediate { 0.0 } else { p["watchSequenceWait"].as_f64().unwrap_or(6.0) };
        for frames in groups.values() {
            let newest = frames.iter().filter_map(|f| seen.get(&f.to_string_lossy().into_owned()).map(|x| x.2)).fold(0.0, f64::max);
            if t - newest < wait {
                continue;
            }
            if frames.len() < 2 {
                singles.extend(frames.iter().cloned());
                continue;
            }
            let mut sorted = frames.clone();
            sorted.sort();
            let Some(seq) = ffmpeg::sequence_of(&sorted[0].to_string_lossy()) else { continue };
            let fr = w["frameRate"].as_f64().unwrap_or(25.0);
            let pattern = seq["pattern"].as_str().unwrap_or("").to_string();
            let mut info = ffmpeg::probe(&pattern, Some(fr));
            info["sequence"] = seq;
            added.push(json!({"path": pattern, "info": info, "kind": "sequence", "fr": fr, "files": sorted.iter().map(|f| f.to_string_lossy().into_owned()).collect::<Vec<_>>()}));
        }
        for s in singles {
            let key = s.to_string_lossy().into_owned();
            let info = ffmpeg::probe(&key, None);
            if info.get("error").is_some() && info["video"].is_null() && info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
                if let Some(e) = seen.get_mut(&key) {
                    e.3 = true;
                }
                continue;
            }
            added.push(json!({"path": key, "info": info, "kind": "file", "files": [key]}));
        }
        for a in &added {
            for f in a["files"].as_array().cloned().unwrap_or_default() {
                if let Some(e) = seen.get_mut(f.as_str().unwrap_or("")) {
                    e.3 = true;
                }
            }
        }
        let n = added.len();
        for a in added {
            let mut it = self.new_item(a["path"].as_str().unwrap_or(""), &a["info"], Some(a["kind"].as_str().unwrap_or("file")));
            if a["kind"] == "sequence" {
                it["interpret"] = json!({"frameRate": a["fr"]});
            }
            it["origin"] = json!({"watch": w["id"], "files": a["files"]});
            let outs: Vec<Value> = w["outputs"].as_array().cloned().unwrap_or_default().into_iter().map(|mut o| {
                o["id"] = json!(new_id("o"));
                if o["folder"].is_null() || o["folder"] == "" {
                    o["folder"] = json!(default_out.to_string_lossy());
                }
                o["skip"] = json!(false);
                o
            }).collect();
            it["outputs"] = json!(outs);
            self.items_mut().push(it);
        }
        if n > 0 {
            let fname = folder.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            self.toast(&format!("Watch folder {fname}: {n} new source{}", if n == 1 { "" } else { "s" }), "info");
            self.changed(false, "watch");
        }
        n
    }

    pub fn ui_state(&self) -> Value {
        let mut items = Vec::new();
        for (n, it) in self.items().iter().enumerate() {
            let mut outs = Vec::new();
            for o in it["outputs"].as_array().cloned().unwrap_or_default() {
                let oid = o["id"].as_str().unwrap_or("");
                let rt = self.runtime.get(oid).cloned().unwrap_or(json!({}));
                let s = &o["settings"];
                let status = self.status_of(&o);
                let kind = o["kind"].as_str().unwrap_or("encode");
                let path = if FINAL.contains(&status.as_str()) && rt["path"].is_string() { rt["path"].as_str().unwrap().to_string() } else if kind == "copy" { o["destination"].as_str().unwrap_or("").to_string() } else if kind == "transcribe" { crate::transcribe::planned(it, &o) } else { self.output_path(it, &o) };
                let effects: Vec<String> = s["effects"].as_object().map(|m| m.iter().filter(|(_, e)| e["enabled"].as_bool().unwrap_or(false)).map(|(k, _)| k.clone()).collect()).unwrap_or_default();
                outs.push(json!({
                    "id": oid, "kind": kind, "format": s["format"],
                    "formatLabel": match kind { "copy" => "Copy".to_string(), "analysis" => "Analysis".to_string(), "transcribe" => "Speech to Text".to_string(), _ => formats::label(s["format"].as_str().unwrap_or("")) },
                    "preset": s["preset"], "presetName": if kind == "copy" { json!(format!("Verify: {}", o["verify"].as_str().unwrap_or("size"))) } else if kind == "analysis" { json!("Scenes, silences, loudness") } else if kind == "transcribe" { let t = crate::transcribe::options(&o); json!(format!("{} model, {}, {}", t["model"].as_str().unwrap_or(""), t["language"].as_str().unwrap_or(""), formats::strs(&t["formats"]).join(" "))) } else { s["presetName"].clone() },
                    "path": path, "status": status, "progress": rt.get("progress").cloned().unwrap_or(json!(if status == "done" { 1.0 } else { 0.0 })),
                    "error": rt["error"], "eta": rt["eta"], "elapsed": rt["elapsed"], "fps": rt["fps"], "speed": rt["speed"], "encoder": rt["encoder"], "bytes": rt["bytes"], "notes": rt["notes"],
                    "message": rt["message"], "summary": if kind == "encode" { settings::summary(s, &it["info"]) } else { json!({}) }, "effects": effects, "skip": o["skip"], "folder": o["folder"],
                    "custom": o["path"].is_string(), "publish": rt["publish"], "loudness": rt["loudness"], "outTime": rt["outTime"], "duration": rt["duration"]
                }));
            }
            let info = &it["info"];
            let v = &info["video"];
            let video = if v["width"].is_number() && v["fps"].as_f64().unwrap_or(0.0) > 0.0 { format!("{}x{}, {} fps", v["width"], v["height"], crate::util::fmt_g((v["fps"].as_f64().unwrap_or(0.0) * 100.0).round() / 100.0)) } else if info["kind"] == "image" { "Still".into() } else { String::new() };
            let audio: Vec<String> = info["audio"].as_array().cloned().unwrap_or_default().iter().take(2).map(|a| format!("{} Hz {} ch", a["sampleRate"], a["channels"])).collect();
            let first = it["outputs"].get(0).cloned().unwrap_or(json!({"settings": {"effects": {}}}));
            items.push(json!({"id": it["id"], "index": n + 1, "kind": it["kind"], "name": it["name"], "path": it["path"], "duration": info["duration"], "video": video, "audio": audio.join(", "),
                              "origin": it["origin"], "family": it["family"], "stitch": it["stitch"], "range": it["range"], "interpret": it["interpret"], "missing": !self.missing(it, &first).is_empty(), "outputs": outs}));
        }
        let mut watch = Vec::new();
        for w in self.doc["watch"].as_array().unwrap() {
            let folder = w["folder"].as_str().unwrap_or("");
            let default_out = self.chain_folder(w).unwrap_or_else(|| Path::new(folder).join("Output")).to_string_lossy().into_owned();
            let outs: Vec<Value> = w["outputs"].as_array().cloned().unwrap_or_default().iter().map(|o| json!({"id": o["id"], "format": o["settings"]["format"], "formatLabel": if o["kind"] == "analysis" { "Analysis".to_string() } else { formats::label(o["settings"]["format"].as_str().unwrap_or("")) }, "presetName": o["settings"]["presetName"], "folder": o["folder"].as_str().filter(|x| !x.is_empty()).map(String::from).unwrap_or_else(|| default_out.clone())})).collect();
            let wid = w["id"].as_str().unwrap_or("");
            watch.push(json!({"id": w["id"], "folder": folder, "active": w["active"].as_bool().unwrap_or(true), "moveSources": w["moveSources"].as_bool().unwrap_or(true), "kind": w["kind"].as_str().unwrap_or("encode"), "outputs": outs, "lastScan": self.watch_scanned.get(wid), "online": self.watch_online.get(wid).copied().unwrap_or(true), "chainTo": w["chainTo"]}));
        }
        let p = prefs::load();
        let idle = if p["autoStartIdle"].as_bool().unwrap_or(false) && !self.running && self.has_ready() { Some((p["autoStartMinutes"].as_f64().unwrap_or(2.0) * 60.0 - (now() - self.last_interaction)).max(0.0)) } else { None };
        let enc = self.encoder_status.lock().unwrap().clone();
        json!({"revision": self.revision, "version": crate::VERSION, "running": self.running, "paused": self.paused, "items": items, "watch": watch, "selection": self.selection,
               "undo": self.undo.last().map(|u| u.0.clone()), "redo": self.redo.last().map(|u| u.0.clone()), "counts": self.counts(), "autoStartIn": idle,
               "autoEncodeWatch": p["autoEncodeWatch"], "parallel": p["parallel"], "encoding": self.jobs.keys().collect::<Vec<_>>(),
               "ffmpeg": enc.as_ref().map(|e| e["ffmpeg"].clone()).unwrap_or(json!({"found": ffmpeg::available()})), "hardware": enc.as_ref().map(|e| e["hardware"].clone()).unwrap_or(json!([])), "encodersReady": enc.is_some()})
    }

    pub fn drain_events(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.events)
    }
}
