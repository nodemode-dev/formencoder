use std::collections::{BTreeSet, HashMap};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde_json::{Value, json};

use crate::paths;
use crate::util::{num, rate_str};

pub const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "tif", "tiff", "bmp", "tga", "dpx", "exr", "webp", "gif", "jp2", "psd", "dng"];
pub const AUDIO_EXT: &[&str] = &["wav", "aif", "aiff", "mp3", "aac", "m4a", "flac", "ogg", "opus", "wma", "ac3", "eac3", "caf", "bwf"];
pub const VIDEO_EXT: &[&str] = &["mp4", "mov", "m4v", "mkv", "webm", "avi", "mxf", "mts", "m2ts", "ts", "mpg", "mpeg", "m2v", "vob", "wmv", "flv", "3gp", "dv", "ogv", "y4m", "r3d", "braw", "ari"];

#[derive(Default, Clone)]
struct Tools {
    folder: Option<(String, PathBuf)>,
    ffmpeg: String,
    ffprobe: Option<String>,
}

fn state() -> &'static Mutex<Tools> {
    static S: OnceLock<Mutex<Tools>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(resolve(None)))
}

fn caches() -> &'static Mutex<HashMap<String, BTreeSet<String>>> {
    static C: OnceLock<Mutex<HashMap<String, BTreeSet<String>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn host_triple() -> String {
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    if cfg!(target_os = "macos") {
        format!("{arch}-apple-darwin")
    } else if cfg!(windows) {
        format!("{arch}-pc-windows-msvc")
    } else {
        format!("{arch}-unknown-linux-gnu")
    }
}

fn exe(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

fn names(program: &str) -> [String; 2] {
    [exe(program), exe(&format!("{program}-{}", host_triple()))]
}

fn holds(folder: &Path) -> Option<PathBuf> {
    names("ffmpeg").iter().map(|n| folder.join(n)).find(|p| p.is_file())
}

pub fn candidates(custom: Option<&Path>) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    if let Some(c) = custom {
        out.push(("preferences".to_string(), c.to_path_buf()));
    }
    if let Ok(v) = env::var("FORMENCODER_FFMPEG_DIR") {
        if !v.trim().is_empty() {
            out.push(("FORMENCODER_FFMPEG_DIR".to_string(), PathBuf::from(paths::expand(v.trim()))));
        }
    }
    if env::var("FORMENCODER_FROZEN").map(|v| v == "1").unwrap_or(false) {
        if let Ok(exe) = env::current_exe() {
            if let Some(here) = exe.parent() {
                out.push(("app".to_string(), here.to_path_buf()));
                out.push(("app".to_string(), here.join("ffmpeg")));
                out.push(("app".to_string(), here.join("..").join("Resources").join("ffmpeg")));
                out.push(("app".to_string(), here.join("..").join("lib").join("formencoder").join("ffmpeg")));
            }
        }
    }
    out.push(("per-person".to_string(), paths::platform_data("formencoder").join("ffmpeg")));
    out.push(("formcut".to_string(), paths::platform_data("formcut").join("ffmpeg")));
    if let Ok(repo) = env::var("FORMENCODER_REPO") {
        let r = PathBuf::from(repo);
        out.push(("clone".to_string(), r.join("src-tauri").join("ffmpeg")));
        out.push(("clone".to_string(), r.join("src-tauri").join("binaries")));
    }
    out
}

fn which(program: &str) -> Option<String> {
    let path = env::var_os("PATH")?;
    for dir in env::split_paths(&path) {
        let p = dir.join(exe(program));
        if p.is_file() {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    None
}

fn resolve(custom: Option<PathBuf>) -> Tools {
    for (origin, folder) in candidates(custom.as_deref()) {
        if let Some(ff) = holds(&folder) {
            let probe = names("ffprobe").iter().map(|n| folder.join(n)).find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned());
            return Tools { folder: Some((origin, folder)), ffmpeg: ff.to_string_lossy().into_owned(), ffprobe: probe };
        }
    }
    Tools { folder: None, ffmpeg: which("ffmpeg").unwrap_or_else(|| exe("ffmpeg")), ffprobe: which("ffprobe") }
}

pub fn set_custom_dir(dir: Option<&str>) {
    let custom = dir.filter(|d| !d.trim().is_empty()).map(|d| PathBuf::from(paths::expand(d.trim())));
    *state().lock().unwrap() = resolve(custom);
    caches().lock().unwrap().clear();
}

pub fn ffmpeg() -> String {
    state().lock().unwrap().ffmpeg.clone()
}

pub fn ffprobe() -> Option<String> {
    state().lock().unwrap().ffprobe.clone()
}

pub fn origin() -> (String, Option<String>) {
    let t = state().lock().unwrap();
    match &t.folder {
        Some((o, p)) => (o.clone(), Some(p.to_string_lossy().into_owned())),
        None => ("system".to_string(), None),
    }
}

#[cfg_attr(not(windows), allow(unused_mut))]
pub fn command(program: &str) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        let t = state().lock().unwrap();
        if let Some((_, folder)) = &t.folder {
            let mut dirs = vec![folder.clone()];
            if let Ok(rd) = fs::read_dir(folder) {
                for e in rd.flatten() {
                    if e.file_name().to_string_lossy().starts_with("lib-") {
                        dirs.push(e.path());
                    }
                }
            }
            if let Some(p) = env::var_os("PATH") {
                dirs.extend(env::split_paths(&p));
            }
            if let Ok(joined) = env::join_paths(dirs) {
                c.env("PATH", joined);
            }
        }
    }
    c
}

pub fn ff() -> Command {
    command(&ffmpeg())
}

pub fn output(args: &[&str]) -> Option<(i32, String, String)> {
    let out = ff().args(args).stdin(Stdio::null()).output().ok()?;
    Some((out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).into_owned(), String::from_utf8_lossy(&out.stderr).into_owned()))
}

pub fn available() -> bool {
    output(&["-hide_banner", "-version"]).map(|o| o.0 == 0).unwrap_or(false)
}

pub fn version() -> Value {
    let Some((code, out, _)) = output(&["-hide_banner", "-version"]) else { return json!({"found": false}) };
    if code != 0 {
        return json!({"found": false});
    }
    let ver = out.lines().next().and_then(|l| l.split_whitespace().nth(2)).unwrap_or("unknown").to_string();
    let configure = out.lines().find_map(|l| l.strip_prefix("configuration: ")).unwrap_or("").to_string();
    let (orig, folder) = origin();
    json!({
        "found": true, "path": ffmpeg(), "version": ver, "licence": if configure.contains("--enable-gpl") { "GPL" } else { "LGPL" },
        "nonfree": configure.contains("--enable-nonfree"), "origin": orig, "folder": folder, "ffprobe": ffprobe().is_some(),
    })
}

fn table(flag: &str) -> BTreeSet<String> {
    let key = format!("{}|{flag}", ffmpeg());
    if let Some(hit) = caches().lock().unwrap().get(&key) {
        return hit.clone();
    }
    let mut names = BTreeSet::new();
    if let Some((_, out, _)) = output(&["-hide_banner", flag]) {
        for line in out.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            match flag {
                "-filters" => {
                    if parts.len() >= 3 && parts[2].contains("->") {
                        names.insert(parts[1].to_string());
                    }
                }
                "-encoders" => {
                    if parts.len() >= 2 && parts[0].len() == 6 && "VAS".contains(&parts[0][..1]) && parts[1] != "=" {
                        names.insert(parts[1].to_string());
                    }
                }
                "-hwaccels" => {
                    if parts.len() == 1 && !line.contains(':') {
                        names.insert(parts[0].to_string());
                    }
                }
                _ => {}
            }
        }
    }
    caches().lock().unwrap().insert(key, names.clone());
    names
}

pub fn hwaccels_available() -> bool {
    !table("-hwaccels").is_empty()
}

pub fn filters() -> BTreeSet<String> {
    table("-filters")
}

pub fn has_filter(name: &str) -> bool {
    let f = filters();
    f.is_empty() || f.contains(name)
}

pub fn encoders() -> BTreeSet<String> {
    table("-encoders")
}

pub fn ext_of(path: &str) -> String {
    Path::new(path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

pub fn kind_of(path: &str) -> &'static str {
    let e = ext_of(path);
    if AUDIO_EXT.contains(&e.as_str()) {
        "audio"
    } else if IMAGE_EXT.contains(&e.as_str()) {
        "image"
    } else if VIDEO_EXT.contains(&e.as_str()) {
        "video"
    } else if e == "fvxlink" {
        "link"
    } else {
        "other"
    }
}

pub fn is_media(path: &str) -> bool {
    matches!(kind_of(path), "audio" | "image" | "video")
}

pub fn sequence_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^(.*?)(\d{2,9})(\.[A-Za-z0-9]+)$").unwrap())
}

pub fn sequence_of(path: &str) -> Option<Value> {
    let p = Path::new(path);
    let name = p.file_name()?.to_string_lossy().into_owned();
    if kind_of(path) != "image" {
        return None;
    }
    let caps = sequence_regex().captures(&name)?;
    let (head, digits, ext) = (caps[1].to_string(), caps[2].to_string(), caps[3].to_string());
    let parent = p.parent().unwrap_or(Path::new("."));
    let mut frames: Vec<i64> = Vec::new();
    for e in fs::read_dir(parent).ok()?.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if let Some(c) = sequence_regex().captures(&n) {
            if c[1] == head && c[3] == ext && c[2].len() == digits.len() {
                if let Ok(v) = c[2].parse() {
                    frames.push(v);
                }
            }
        }
    }
    if frames.len() < 2 {
        return None;
    }
    frames.sort();
    let pattern = parent.join(format!("{head}%0{}d{ext}", digits.len())).to_string_lossy().into_owned();
    Some(json!({"pattern": pattern, "first": frames[0], "last": frames[frames.len() - 1], "count": frames.len(), "digits": digits.len(), "head": head, "ext": ext}))
}

fn rate(text: Option<&str>) -> f64 {
    let Some(t) = text else { return 0.0 };
    if let Some((a, b)) = t.split_once('/') {
        let (a, b): (f64, f64) = (a.parse().unwrap_or(0.0), b.parse().unwrap_or(0.0));
        return if b > 0.0 { a / b } else { 0.0 };
    }
    t.parse().unwrap_or(0.0)
}

fn fnum(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn bit_depth(pix: &str, s: &Value) -> i64 {
    if let Some(r) = s.get("bits_per_raw_sample").and_then(|v| v.as_str()).and_then(|v| v.parse().ok()) {
        return r;
    }
    for (needle, d) in [("p16", 16), ("p12", 12), ("p10", 10), ("10le", 10), ("10be", 10), ("12le", 12), ("48le", 16), ("64le", 16), ("f32", 32), ("f16", 16)] {
        if pix.contains(needle) {
            return d;
        }
    }
    8
}

fn chroma(pix: &str) -> &'static str {
    for t in ["444", "422", "420", "411", "440"] {
        if pix.contains(t) {
            return match t {
                "444" => "444",
                "422" => "422",
                "420" => "420",
                "411" => "411",
                _ => "440",
            };
        }
    }
    if ["rgb", "bgr", "gbr", "argb", "abgr"].iter().any(|p| pix.starts_with(p)) {
        "444"
    } else if pix.starts_with("gray") {
        "mono"
    } else {
        "420"
    }
}

fn alpha(pix: &str) -> bool {
    ["yuva", "rgba", "bgra", "argb", "abgr", "gbrap", "ya8", "ya16"].iter().any(|t| pix.contains(t))
}

fn pattern_first(pattern: &str) -> Option<i64> {
    let p = Path::new(pattern);
    let name = p.file_name()?.to_string_lossy().into_owned();
    let (head, rest) = name.split_once("%0")?;
    let (width, ext) = rest.split_once('d')?;
    let width: usize = width.parse().ok()?;
    let parent = p.parent().filter(|x| !x.as_os_str().is_empty()).unwrap_or(Path::new("."));
    fs::read_dir(parent).ok()?.flatten().filter_map(|e| {
        let n = e.file_name().to_string_lossy().into_owned();
        let mid = n.strip_prefix(head)?.strip_suffix(ext)?;
        if mid.len() == width && mid.bytes().all(|b| b.is_ascii_digit()) { mid.parse::<i64>().ok() } else { None }
    }).min()
}

pub fn probe(path: &str, frame_rate: Option<f64>) -> Value {
    let p = Path::new(path);
    let mut seq: Option<Value> = None;
    if path.contains("%0") {
        seq = Some(json!({"pattern": path, "first": pattern_first(path).unwrap_or(0)}));
    } else if kind_of(path) == "image" && frame_rate.is_some() {
        seq = sequence_of(path);
    }
    let mut info = json!({
        "path": path, "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        "size": fs::metadata(p).map(|m| m.len()).unwrap_or(0), "kind": kind_of(path), "duration": 0.0, "bitrate": 0,
        "container": "", "video": null, "audio": [], "subtitles": [], "timecode": null, "tags": {},
    });
    let mut pre: Vec<String> = Vec::new();
    let mut target = path.to_string();
    if let Some(sq) = &seq {
        target = sq["pattern"].as_str().unwrap_or(path).to_string();
        pre = vec!["-f".into(), "image2".into(), "-framerate".into(), rate_str(frame_rate.unwrap_or(25.0)), "-start_number".into(), sq.get("first").and_then(Value::as_i64).unwrap_or(0).to_string()];
        info["kind"] = json!("sequence");
        info["sequence"] = sq.clone();
    }
    let mut data: Option<Value> = None;
    if let Some(probe_bin) = ffprobe() {
        let mut c = command(&probe_bin);
        c.args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"]).args(&pre).arg(&target).stdin(Stdio::null());
        if let Ok(out) = c.output() {
            if out.status.success() {
                data = serde_json::from_slice(&out.stdout).ok();
            } else {
                let err = String::from_utf8_lossy(&out.stderr);
                info["error"] = json!(err.lines().last().unwrap_or("unreadable").trim());
            }
        }
    }
    if data.is_none() {
        data = probe_by_ffmpeg(&target, &pre);
        if data.is_some() {
            if let Value::Object(m) = &mut info {
                m.remove("error");
            }
        } else {
            if info.get("error").is_none() {
                info["error"] = json!("ffmpeg could not read this file");
            }
            return info;
        }
    }
    let data = data.unwrap_or(Value::Null);
    let fmt = &data["format"];
    info["container"] = fmt.get("format_name").cloned().unwrap_or(json!(""));
    info["duration"] = num(fnum(fmt.get("duration").unwrap_or(&Value::Null)));
    info["bitrate"] = json!(fnum(fmt.get("bit_rate").unwrap_or(&Value::Null)) as i64);
    let mut tags = serde_json::Map::new();
    if let Some(Value::Object(t)) = fmt.get("tags") {
        for (k, v) in t {
            tags.insert(k.to_lowercase(), v.clone());
        }
    }
    if let Some(tc) = tags.get("timecode") {
        info["timecode"] = tc.clone();
    }
    info["tags"] = Value::Object(tags);
    let mut audio = Vec::new();
    let mut subs = Vec::new();
    for s in data["streams"].as_array().cloned().unwrap_or_default() {
        let kind = s["codec_type"].as_str().unwrap_or("");
        let stags: serde_json::Map<String, Value> = s.get("tags").and_then(Value::as_object).map(|m| m.iter().map(|(k, v)| (k.to_lowercase(), v.clone())).collect()).unwrap_or_default();
        let attached = s.get("disposition").and_then(|d| d.get("attached_pic")).and_then(Value::as_i64).unwrap_or(0) == 1;
        if kind == "video" && info["video"].is_null() && !attached {
            let pix = s["pix_fmt"].as_str().unwrap_or("").to_string();
            let mut fps = rate(s["avg_frame_rate"].as_str());
            if fps <= 0.0 || fps > 1000.0 {
                fps = rate(s["r_frame_rate"].as_str());
            }
            if seq.is_some() {
                fps = frame_rate.unwrap_or(25.0);
            }
            let mut rotation = 0;
            for sd in s.get("side_data_list").and_then(Value::as_array).cloned().unwrap_or_default() {
                if let Some(r) = sd.get("rotation") {
                    rotation = fnum(r) as i64;
                }
            }
            if let Some(r) = stags.get("rotate") {
                rotation = fnum(r) as i64;
            }
            let transfer = s["color_transfer"].as_str().unwrap_or("").to_string();
            let mut frames = fnum(&s["nb_frames"]) as i64;
            let mut duration = fnum(&s["duration"]);
            if duration <= 0.0 {
                duration = info["duration"].as_f64().unwrap_or(0.0);
            }
            if let Some(sq) = &seq {
                if let Some(c) = sq.get("count").and_then(Value::as_i64) {
                    frames = c;
                    duration = c as f64 / fps.max(1.0);
                }
            } else if frames == 0 && duration > 0.0 && fps > 0.0 {
                frames = (duration * fps).round() as i64;
            }
            let sar = s["sample_aspect_ratio"].as_str().filter(|v| *v != "0:1" && *v != "N/A").unwrap_or("1:1").to_string();
            let hdr = match transfer.as_str() {
                "smpte2084" => "pq",
                "arib-std-b67" => "hlg",
                _ => "none",
            };
            info["video"] = json!({
                "index": s["index"], "codec": s["codec_name"], "profile": s["profile"], "width": s["width"], "height": s["height"],
                "fps": num((fps * 100000.0).round() / 100000.0), "rate": s["avg_frame_rate"], "pixFmt": pix, "bitDepth": bit_depth(&pix, &s), "chroma": chroma(&pix),
                "alpha": alpha(&pix) || stags.get("alpha_mode").and_then(Value::as_str) == Some("1"), "fieldOrder": s["field_order"].as_str().unwrap_or("progressive"),
                "sar": sar, "dar": s["display_aspect_ratio"], "colorPrimaries": s["color_primaries"], "colorTransfer": transfer, "colorSpace": s["color_space"],
                "colorRange": s["color_range"], "hdr": hdr, "bitrate": fnum(&s["bit_rate"]) as i64, "frames": frames, "duration": num(duration), "rotation": rotation,
            });
            if info["timecode"].is_null() {
                if let Some(tc) = stags.get("timecode") {
                    info["timecode"] = tc.clone();
                }
            }
            if seq.is_some() {
                info["duration"] = num(duration);
            }
        } else if kind == "audio" {
            let raw = fnum(&s["bits_per_raw_sample"]) as i64;
            let depth = if raw > 0 { raw } else { s["bits_per_sample"].as_i64().unwrap_or(0) };
            audio.push(json!({
                "index": s["index"], "codec": s["codec_name"], "sampleRate": fnum(&s["sample_rate"]) as i64, "channels": s["channels"].as_i64().unwrap_or(0),
                "layout": s["channel_layout"].as_str().unwrap_or(""), "bitrate": fnum(&s["bit_rate"]) as i64,
                "bitDepth": depth,
                "language": stags.get("language"), "duration": num(fnum(&s["duration"])),
            }));
        } else if kind == "subtitle" {
            subs.push(json!({"index": s["index"], "codec": s["codec_name"], "language": stags.get("language")}));
        } else if kind == "data" && info["timecode"].is_null() {
            if let Some(tc) = stags.get("timecode") {
                info["timecode"] = tc.clone();
            }
        }
    }
    info["audio"] = Value::Array(audio);
    info["subtitles"] = Value::Array(subs);
    if info["kind"] == "other" {
        info["kind"] = json!(if !info["video"].is_null() { "video" } else if info["audio"].as_array().map(|a| !a.is_empty()).unwrap_or(false) { "audio" } else { "other" });
    }
    let no_audio = info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true);
    if info["kind"] == "video" && no_audio && info["video"]["frames"].as_i64().unwrap_or(0) <= 1 && info["duration"].as_f64().unwrap_or(0.0) <= 0.05 {
        info["kind"] = json!("image");
    }
    if info["kind"] == "image" && !info["video"].is_null() {
        info["video"]["frames"] = json!(1);
    }
    info
}

fn probe_by_ffmpeg(target: &str, pre: &[String]) -> Option<Value> {
    let mut args: Vec<String> = vec!["-hide_banner".into()];
    args.extend_from_slice(pre);
    args.push("-i".into());
    args.push(target.into());
    let out = ff().args(&args).stdin(Stdio::null()).output().ok()?;
    let text = String::from_utf8_lossy(&out.stderr).into_owned();
    if text.contains("Invalid data") || text.contains("No such file") {
        return None;
    }
    let dur_re = Regex::new(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)").ok()?;
    let stream_re = Regex::new(r"Stream #\d+:(\d+)[^:]*: (Video|Audio|Subtitle): (.*)").ok()?;
    let mut fmt = serde_json::Map::new();
    if let Some(c) = dur_re.captures(&text) {
        let secs = c[1].parse::<f64>().unwrap_or(0.0) * 3600.0 + c[2].parse::<f64>().unwrap_or(0.0) * 60.0 + c[3].parse::<f64>().unwrap_or(0.0);
        fmt.insert("duration".into(), json!(secs.to_string()));
    }
    let mut streams = Vec::new();
    for c in stream_re.captures_iter(&text) {
        let rest = c[3].to_string();
        let codec = rest.split([',', ' ']).next().unwrap_or("").to_string();
        let mut s = json!({"index": c[1].parse::<i64>().unwrap_or(0), "codec_type": c[2].to_lowercase(), "codec_name": codec});
        if &c[2] == "Video" {
            if let Some(m) = Regex::new(r"(\d{2,5})x(\d{2,5})").ok()?.captures(&rest) {
                s["width"] = json!(m[1].parse::<i64>().unwrap_or(0));
                s["height"] = json!(m[2].parse::<i64>().unwrap_or(0));
            }
            if let Some(m) = Regex::new(r"([\d.]+) fps").ok()?.captures(&rest) {
                s["avg_frame_rate"] = json!(m[1].to_string());
            }
            if let Some(m) = Regex::new(r"\b(yuv\w+|rgb\w+|bgr\w+|gbr\w+|nv12|p010le|gray\w*)\b").ok()?.captures(&rest) {
                s["pix_fmt"] = json!(m[1].to_string());
            }
        } else if &c[2] == "Audio" {
            if let Some(m) = Regex::new(r"(\d+) Hz").ok()?.captures(&rest) {
                s["sample_rate"] = json!(m[1].to_string());
            }
            let (ch, layout) = if rest.contains("stereo") { (2, "stereo") } else if rest.contains("mono") { (1, "mono") } else if rest.contains("5.1") { (6, "5.1") } else { (2, "") };
            s["channels"] = json!(ch);
            s["channel_layout"] = json!(layout);
        }
        streams.push(s);
    }
    if streams.is_empty() {
        return None;
    }
    Some(json!({"format": Value::Object(fmt), "streams": streams}))
}

pub fn light(info: &Value) -> Value {
    let mut out = serde_json::Map::new();
    for k in ["path", "name", "size", "kind", "duration", "bitrate", "container", "video", "audio", "subtitles", "timecode", "sequence", "error", "tags"] {
        if let Some(v) = info.get(k) {
            out.insert(k.to_string(), v.clone());
        }
    }
    Value::Object(out)
}

pub fn thumbnail(path: &str, at: f64, width: u32, frame_rate: Option<f64>) -> Option<Vec<u8>> {
    let mut args: Vec<String> = vec!["-v".into(), "error".into(), "-hide_banner".into()];
    if path.contains("%0") {
        args.extend(["-f".into(), "image2".into(), "-framerate".into(), rate_str(frame_rate.unwrap_or(25.0))]);
    } else if kind_of(path) != "image" {
        args.extend(["-ss".into(), format!("{:.3}", at.max(0.0))]);
    }
    args.extend(["-i".into(), path.into(), "-frames:v".into(), "1".into(), "-vf".into(), format!("scale={width}:-2:flags=bilinear"), "-f".into(), "image2pipe".into(), "-c:v".into(), "png".into(), "-".into()]);
    let out = ff().args(&args).stdin(Stdio::null()).output().ok()?;
    if out.status.success() && !out.stdout.is_empty() { Some(out.stdout) } else { None }
}
