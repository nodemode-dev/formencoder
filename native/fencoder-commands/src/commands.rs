use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::{Value, json};

use crate::engine::Engine;
use crate::util::{Res, new_id, now};
use crate::{captions, colour, encoders, ffmpeg, formats, logs, metadata, paths, pipeline, prefs, presets, settings};

pub type Run = fn(&mut Engine, &Value) -> Res;

pub const DESTRUCTIVE: &[&str] = &["queue.remove", "queue.clearDone", "queue.open", "preset.delete", "watch.remove", "watch.removeOutput", "metadata.deleteTemplate", "log.clear", "prefs.reset", "prefs.cleanCache", "shortcuts.reset"];

pub const OPEN_WORLD: &[&str] = &["family", "publish"];

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

    pub fn shortcut_now(&self) -> String {
        match prefs::load()["shortcuts"].get(self.id).and_then(Value::as_str) {
            Some(s) => s.to_string(),
            None => self.shortcut.to_string(),
        }
    }

    pub fn mcp_name(&self) -> String {
        let mut out = String::with_capacity(self.id.len() + 4);
        for ch in self.id.chars() {
            if ch == '.' {
                out.push('_');
            } else if ch.is_ascii_uppercase() {
                out.push('_');
                out.push(ch.to_ascii_lowercase());
            } else {
                out.push(ch);
            }
        }
        out
    }

    pub fn category(&self) -> &'static str {
        self.id.split('.').next().unwrap_or(self.id)
    }

    pub fn annotations(&self) -> Value {
        let set_like = self.id.rsplit('.').next().is_some_and(|v| v.starts_with("set"));
        json!({
            "title": self.label,
            "readOnlyHint": self.query,
            "destructiveHint": DESTRUCTIVE.contains(&self.id),
            "idempotentHint": self.query || set_like,
            "openWorldHint": OPEN_WORLD.contains(&self.category()) || self.id == "plugin.run",
        })
    }

    pub fn row(&self, schemas: bool) -> Value {
        let mut r = json!({"id": self.id, "mcpName": self.mcp_name(), "category": self.category(), "label": self.label, "menu": self.menu, "params": self.summary(), "undoable": self.undoable, "query": self.query, "shortcut": self.shortcut_now(), "defaultShortcut": self.shortcut, "enabled": true, "annotations": self.annotations()});
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

mod app_cmds;
mod encode_cmds;
mod family_cmds;
mod format_cmds;
mod ingest_cmds;
mod media_cmds;
mod prefs_cmds;
mod preset_cmds;
mod queue_cmds;
mod watch_cmds;

use app_cmds::*;
use encode_cmds::*;
use family_cmds::*;
use format_cmds::*;
use ingest_cmds::*;
use media_cmds::*;
use prefs_cmds::*;
use preset_cmds::*;
use queue_cmds::*;
use watch_cmds::*;

pub use encode_cmds::source_of;
pub use prefs_cmds::{RESERVED_KEYS, normalize_combo};

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
            c("settings.apply", "Apply Settings Patch", "", p!("settings" => ob(), "patch" => ob(), "output" => st()), &["settings"], false, true, "",
              "Normalises settings and applies a patch to them without touching the queue (format switches keep range, effects and publish); with output, also the summary and estimated size against that output's source.", apply_settings),
            c("queue.setOutput", "Set Output File...", "Queue", p!("refs" => refs_s(), "path" => st(), "folder" => st(), "name" => st()), &["refs"], true, false, "",
              "Sets one output's file (path), the folder of several outputs at once, or the output name template ({source} {preset} {format} {date} {time} {width} {height} {fps} {index}).", set_output),
            c("queue.setRange", "Set Source Range", "Queue", p!("refs" => refs_s(), "mode" => en(&["entire", "inout", "custom", "workArea"]), "in" => nu(), "out" => nu()), &["refs"], true, false, "", "In and out points in source seconds.", set_range),
            c("queue.interpret", "Interpret Footage...", "File", p!("item" => st(), "frameRate" => nu(), "pixelAspect" => st(), "fieldOrder" => en(&["source", "progressive", "tff", "bff"]), "alpha" => en(&["source", "ignore", "straight", "premultiplied", "invert"]), "rotation" => int(), "rawExposure" => nu(), "rawTransfer" => en(&["rec709", "linear"])), &["item"], true, false, "", "Overrides how a source is read. rawExposure (stops) and rawTransfer develop camera raw (CinemaDNG and other Bayer sources): the default is Rec. 709 at 0 stops.", interpret),
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
            c("encode.command", "Show FFmpeg Command", "Queue", p!("output" => st()), &["output"], false, true, "", "The ffmpeg command line an output would run (Fit Tuning analysis left out).", command_line),
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
            c("proxy.create", "Create Proxies", "File", p!("paths" => paths_s(), "preset" => preset_s(), "folder" => st(), "start" => bo()), &["paths"], true, false, "", "Queues proxies into a Proxies folder beside each source, named [source]_Proxy.", proxies),
            c("captions.transcribe", "Speech to Text...", "File", p!("paths" => paths_s(), "model" => en(&crate::transcribe::MODELS.iter().map(|(k, _)| *k).collect::<Vec<_>>()), "language" => st(), "translate" => bo(), "formats" => json!({"type": "array", "items": {"type": "string", "enum": crate::transcribe::FORMATS}}), "folder" => st(), "overwrite" => bo(), "start" => bo()), &["paths"], true, false, "",
              "Queues speech to text with whisper.cpp: an .srt (and .vtt, .txt or .json) transcript beside each source, which Captions then finds for burn-in, embedding or sidecars. language is a code such as en or auto; translate makes English; model is one of captions.models.", transcribe),
            c("captions.models", "Speech Models", "File", p!(), &[], false, true, "", "The whisper.cpp speech models, which are downloaded, where they live, and whether whisper-cli is installed.", transcribe_models),
            c("analyze.media", "Analyze Media", "File", p!("paths" => paths_s(), "start" => bo()), &["paths"], true, false, "", "Queues analysis: a .feanalysis.json sidecar with scene changes, black frames, silences and loudness.", analyze),
            c("watch.list", "Watch Folders", "Window", p!(), &[], false, true, "Cmd+4", "", watch_list),
            c("watch.add", "Add Watch Folder...", "File", p!("folder" => st(), "preset" => preset_s(), "format" => format_s(), "outputs" => objs(), "kind" => en(&["encode", "analysis"]), "frameRate" => nu(), "moveSources" => bo()), &["folder"], true, false, "Cmd+Alt+I",
              "Watches a folder: dropped media is queued with the folder's outputs and encoded (Auto-Encode Watch Folders); outputs go to an Output subfolder and originals move to Source/[date-time].", watch_add),
            c("watch.remove", "Remove Watch Folder", "Watch", p!("watch" => st()), &["watch"], true, false, "", "", watch_remove),
            c("watch.setActive", "Watch Folder Active", "Watch", p!("watch" => st(), "active" => bo()), &["watch", "active"], true, false, "", "", watch_active),
            c("watch.chain", "Chain Watch Folder", "Watch", p!("watch" => st(), "to" => json!({"type": ["string", "null"]})), &["watch"], true, false, "",
              "Sends a watch folder's outputs (those without their own folder) into another watch folder, which then encodes them with its own outputs; to null ends the chain. Loops are refused.", watch_chain),
            c("watch.addOutput", "Add Watch Folder Output", "Watch", p!("watch" => st(), "preset" => preset_s(), "format" => format_s(), "settings" => ob(), "folder" => st()), &["watch"], true, false, "", "", watch_add_output),
            c("watch.setOutput", "Watch Folder Output Settings", "Watch", p!("output" => st(), "preset" => preset_s(), "settings" => ob(), "folder" => st()), &["output"], true, false, "", "", watch_set_output),
            c("watch.removeOutput", "Remove Watch Folder Output", "Watch", p!("output" => st()), &["output"], true, false, "", "", watch_remove_output),
            c("watch.scan", "Scan Watch Folders Now", "Watch", p!(), &[], false, false, "", "Queues what is in the active watch folders now, without waiting for files to settle.", watch_scan),
            c("format.list", "Formats", "Window", p!(), &[], false, true, "", "", format_list),
            c("format.describe", "Format Settings", "Window", p!("format" => format_s(), "output" => st(), "settings" => ob()), &[], false, true, "", "The export settings fields of a format (or an output's, or of a settings object) with keys, types and options, its codecs and the encoders this machine has for them.", format_describe),
            c("format.encoders", "Hardware And Encoders", "Window", p!("refresh" => bo()), &[], false, true, "", "", format_encoders),
            c("media.roots", "Media Browser Locations", "Window", p!(), &[], false, true, "", "", media_roots),
            c("media.browse", "Media Browser", "Window", p!("path" => st(), "filter" => en(&["all", "video", "audio", "image", "media"]), "query" => st(), "probe" => bo()), &["path"], false, true, "Cmd+5", "", media_browse),
            c("media.probe", "Media Info", "Window", p!("path" => st(), "frameRate" => nu(), "loudness" => bo()), &["path"], false, true, "", "", media_probe),
            c("captions.read", "Read Captions", "File", p!("path" => st()), &["path"], false, true, "", "", captions_read),
            c("captions.convert", "Convert Captions", "File", p!("path" => st(), "to" => en(&["srt", "vtt", "scc", "ttml"]), "output" => st()), &["path", "to"], false, false, "", "", captions_convert),
            c("metadata.templates", "Metadata Templates", "Metadata", p!(), &[], false, true, "",
              "Saved metadata templates and the categories metadata.rules keep or drop (descriptive, rights, dates, camera, location).", metadata_templates),
            c("metadata.saveTemplate", "Save Metadata Template", "Metadata", p!("name" => st(), "fields" => json!({"type": "object"}), "fromOutput" => st()), &["name"], false, false, "",
              "Saves fields (or an output's metadata fields) as a named template that outputs apply with metadata.template.", metadata_save_template),
            c("metadata.deleteTemplate", "Delete Metadata Template", "Metadata", p!("name" => st()), &["name"], false, false, "", "", metadata_delete_template),
            c("lut.list", "LUTs", "Effects", p!(), &[], false, true, "", "", lut_list),
            c("lut.install", "Install LUT...", "Effects", p!("path" => st()), &["path"], false, false, "", "", lut_install),
            c("log.read", "Show Log", "File", p!("kind" => en(&["encoding", "error"]), "limit" => int()), &[], false, true, "Cmd+L", "", log_read),
            c("log.clear", "Clear Log", "File", p!("kind" => en(&["encoding", "error"])), &["kind"], false, false, "", "", log_clear),
            c("prefs.get", "Preferences...", "Edit", p!(), &[], false, true, "Cmd+,", "", prefs_get),
            c("prefs.set", "Set Preferences", "Edit", p!("values" => ob()), &["values"], false, false, "", "", prefs_set),
            c("prefs.reset", "Reset Preferences", "Edit", p!(), &[], false, false, "", "", prefs_reset),
            c("prefs.cacheInfo", "Media Cache", "Edit", p!(), &[], false, true, "", "The media cache folder, its size and file count, the cache limit, and the memory free and reserved.", cache_info),
            c("plugin.list", "Plug-ins", "", p!(), &[], false, true, "", "Installed plug-ins (folders with a plugin.json in the data folder's plugins folder or FORMENCODER_PLUGINS): their events, commands, options and any problems with their manifests.", plugin_list),
            c("plugin.run", "Run Plug-in Command", "", p!("plugin" => st(), "command" => st(), "params" => ob()), &["plugin"], false, false, "",
              "Starts one of a plug-in's commands in the background and returns its run id; plugin.result shows its progress and result.", plugin_run),
            c("plugin.result", "Plug-in Run", "", p!("run" => st()), &["run"], false, true, "", "A plug-in command run: running, done with its result, or failed with its error.", plugin_result),
            c("shortcuts.list", "Keyboard Shortcuts", "", p!(), &[], false, true, "", "Every menu command with its shortcut now and its default, and the keys kept for the app itself.", shortcuts_list),
            c("shortcuts.set", "Set Keyboard Shortcut", "", p!("command" => st(), "shortcut" => json!({"type": ["string", "null"], "description": "modifiers and one key, such as Cmd+Shift+E; empty removes it; null restores the default"}), "force" => bo()), &["command"], false, false, "",
              "Changes one command's shortcut. A shortcut another command already uses is refused unless force, which takes it from that command.", shortcuts_set),
            c("shortcuts.reset", "Reset Keyboard Shortcuts", "", p!(), &[], false, false, "", "Puts every shortcut back to its default.", shortcuts_reset),
            c("tools.list", "Delivery Tools", "Edit", p!(), &[], false, true, "",
              "The separate programs formencoder drives for packaged deliverables (bmx for AS-10, AS-11 and P2; asdcplib and OpenJPEG for DCP): version, licence, what each is for and where it was found.", tools_list),
            c("prefs.cleanCache", "Clean Media Cache", "Edit", p!("all" => bo()), &[], false, false, "",
              "Removes the oldest cache files until the cache is under its limit (all: everything not in use by a running encode).", cache_clean),
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
            m.entry(c.menu.to_string()).or_default().push(json!({"id": c.id, "label": c.label, "shortcut": c.shortcut_now()}));
        }
    }
    json!(m)
}
