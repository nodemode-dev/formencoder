use std::path::PathBuf;

use serde_json::{Value, json};

use crate::engine::Engine;
use crate::util::Res;
use crate::{commands, ffmpeg, paths, pipeline, presets, runner, settings, text};

pub struct PreviewJob {
    src: pipeline::Source,
    settings: Value,
    view: String,
    times: Vec<f64>,
    width: u32,
    columns: usize,
    work: PathBuf,
    start: f64,
    duration: f64,
}

impl PreviewJob {
    pub fn from_params(e: &Engine, p: &Value) -> Res<PreviewJob> {
        let (src, s, key) = if !p["output"].is_null() {
            let (i, j) = e.output_ref(&p["output"])?;
            if e.items()[i]["kind"] == "family" {
                return Err("a family source is fetched when it encodes; preview the family app's own viewer until then".into());
            }
            let o = &e.items()[i]["outputs"][j];
            let mut s = settings::normalize(&o["settings"])?;
            if let Some(patch) = p.get("patch").filter(|x| x.is_object()) {
                s = settings::apply_patch(&s, patch)?;
            }
            (commands::source_of(e, i), s, o["id"].as_str().unwrap_or("out").to_string())
        } else if let Some(path) = p["path"].as_str().filter(|x| !x.is_empty()) {
            let path = paths::expand(path);
            let info = ffmpeg::probe(&path, p["frameRate"].as_f64());
            if info["kind"].is_null() || info.get("error").is_some_and(|x| !x.is_null()) {
                return Err(format!("{path} is not media formencoder can read"));
            }
            let base = if p["settings"].is_object() {
                p["settings"].clone()
            } else if let Some(k) = p["preset"].as_str() {
                presets::settings_for(k)?
            } else {
                settings::default(p["format"].as_str().unwrap_or("h264"))?
            };
            let mut s = settings::normalize(&base)?;
            if let Some(patch) = p.get("patch").filter(|x| x.is_object()) {
                s = settings::apply_patch(&s, patch)?;
            }
            let src = pipeline::Source { path: path.clone(), info, interpret: json!({}), range: json!({}), audio_path: None, stitch: vec![] };
            (src, s, crate::util::file_safe(&settings::source_stem(&path)))
        } else {
            return Err("give output (an output id or #n) or path (a media file)".into());
        };
        let (a, b) = pipeline::range_of(&s, &src.info, &src.range)?;
        let duration = if src.stitch.is_empty() { (b - a).max(0.0) } else { src.stitch.iter().map(|(_, i)| i["duration"].as_f64().unwrap_or(0.0)).sum() };
        let view = p["view"].as_str().unwrap_or("output").to_string();
        if view != "output" && view != "source" {
            return Err("view is output or source".into());
        }
        let count = p["count"].as_u64().unwrap_or(0).min(48) as usize;
        let times: Vec<f64> = if let Some(list) = p["times"].as_array() {
            list.iter().filter_map(Value::as_f64).take(48).collect()
        } else if count > 0 {
            (0..count).map(|k| duration * (k as f64 + 0.5) / count as f64).collect()
        } else {
            vec![p["time"].as_f64().unwrap_or(0.0)]
        };
        if times.is_empty() {
            return Err("times is empty".into());
        }
        let width = p["width"].as_u64().unwrap_or(if times.len() > 1 { 360 } else { 960 }).clamp(64, 3840) as u32;
        let columns = p["columns"].as_u64().unwrap_or(if times.len() > 4 { 4 } else { times.len() as u64 }).max(1) as usize;
        let work = paths::sub("cache").join("preview").join(key);
        let start = if src.stitch.is_empty() { a } else { 0.0 };
        Ok(PreviewJob { src, settings: s, view, times, width, columns, work, start, duration })
    }

    pub fn run(&self) -> Res<(Vec<u8>, Value)> {
        let mut frames: Vec<(f64, Vec<u8>)> = Vec::new();
        let mut meta = Value::Null;
        for &t in &self.times {
            let t = t.clamp(0.0, self.duration.max(0.0));
            let png = if self.view == "source" {
                let rate = self.src.interpret["frameRate"].as_f64().or(self.src.info["video"]["fps"].as_f64());
                let path = self.src.info["sequence"]["pattern"].as_str().map(String::from).unwrap_or_else(|| self.src.path.clone());
                ffmpeg::thumbnail(&path, self.start + t, self.width, rate).ok_or_else(|| format!("no source frame at {t:.3}s"))?
            } else {
                let (png, m) = runner::preview(&self.src, &self.settings, t, self.width, &self.work)?;
                if meta.is_null() {
                    meta = m;
                }
                png
            };
            frames.push((t, png));
        }
        let info = json!({
            "view": self.view,
            "times": self.times,
            "duration": self.duration,
            "frames": frames.len(),
            "output": meta,
            "summary": settings::summary(&self.settings, &self.src.info),
        });
        if frames.len() == 1 {
            return Ok((frames.remove(0).1, info));
        }
        Ok((text::contact_sheet(&frames, self.columns), info))
    }
}
