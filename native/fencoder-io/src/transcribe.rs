use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{Value, json};

use crate::util::Res;
use crate::{ffmpeg, paths, tools};

pub const MODELS: &[(&str, &str)] = &[
    ("tiny", "Tiny (75 MB, fastest)"),
    ("tiny.en", "Tiny, English only"),
    ("base", "Base (142 MB)"),
    ("base.en", "Base, English only"),
    ("small", "Small (466 MB)"),
    ("small.en", "Small, English only"),
    ("medium", "Medium (1.5 GB)"),
    ("large-v3-turbo", "Large v3 Turbo (1.6 GB, most accurate)"),
];

pub const FORMATS: &[&str] = &["srt", "vtt", "txt", "json"];

pub fn models_dir() -> PathBuf {
    match std::env::var("FORMENCODER_MODELS") {
        Ok(v) if !v.trim().is_empty() => PathBuf::from(paths::expand(v.trim())),
        _ => paths::platform_data("formencoder").join("models"),
    }
}

pub fn model_path(name: &str) -> Option<PathBuf> {
    let p = models_dir().join(format!("ggml-{name}.bin"));
    p.is_file().then_some(p)
}

pub fn listing() -> Value {
    Value::Array(MODELS.iter().map(|(id, label)| json!({"id": id, "label": label, "installed": model_path(id).is_some()})).collect())
}

pub fn options(o: &Value) -> Value {
    let t = &o["transcribe"];
    let formats: Vec<String> = t["formats"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).filter(|x| FORMATS.contains(x)).map(String::from).collect()).filter(|v: &Vec<String>| !v.is_empty()).unwrap_or_else(|| vec!["srt".into()]);
    json!({
        "model": t["model"].as_str().filter(|m| MODELS.iter().any(|(k, _)| k == m)).unwrap_or("base"),
        "language": t["language"].as_str().filter(|l| !l.trim().is_empty()).unwrap_or("auto"),
        "translate": t["translate"].as_bool().unwrap_or(false),
        "formats": formats,
        "overwrite": t["overwrite"].as_bool().unwrap_or(false),
    })
}

fn target_base(source: &str, folder: Option<&str>, formats: &[String], overwrite: bool) -> PathBuf {
    let p = Path::new(source);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "speech".into());
    let dir = folder.filter(|f| !f.trim().is_empty()).map(|f| PathBuf::from(paths::expand(f))).unwrap_or_else(|| p.parent().map(Path::to_path_buf).unwrap_or_default());
    let base = dir.join(&stem);
    if overwrite || !formats.iter().any(|e| base.with_extension(e).exists()) {
        return base;
    }
    for i in 1..1000 {
        let cand = dir.join(format!("{stem}_transcript{}", if i == 1 { String::new() } else { format!("_{i}") }));
        if !formats.iter().any(|e| cand.with_extension(e).exists()) {
            return cand;
        }
    }
    base
}

pub fn planned(item: &Value, output: &Value) -> String {
    let opts = options(output);
    let formats: Vec<String> = crate::formats::strs(&opts["formats"]);
    let base = target_base(item["path"].as_str().unwrap_or(""), output["folder"].as_str(), &formats, opts["overwrite"].as_bool().unwrap_or(false));
    base.with_extension(formats.first().map(String::as_str).unwrap_or("srt")).to_string_lossy().into_owned()
}

pub fn run(item: &Value, output: &Value, work: &Path, report: &dyn Fn(f64, &str), stopped: &dyn Fn() -> bool) -> Res {
    let opts = options(output);
    let source = item["path"].as_str().unwrap_or("").to_string();
    let whisper = tools::require("whisper-cli", "Speech to text")?;
    let model_name = opts["model"].as_str().unwrap_or("base").to_string();
    let model = model_path(&model_name).ok_or_else(|| format!("the speech model {model_name} is not downloaded; get it in Preferences > Delivery Tools or with ./formencoder install-tools --model {model_name}"))?;
    let _ = fs::create_dir_all(work);
    let wav = work.join("speech.wav");
    report(0.02, "extracting the speech");
    let mut cmd = ffmpeg::command(&ffmpeg::ffmpeg());
    cmd.args(["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", &source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]).arg(&wav).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    let out = cmd.output().map_err(|e| format!("ffmpeg could not start: {e}"))?;
    if !out.status.success() || !wav.is_file() {
        return Err(format!("ffmpeg could not read the audio of {source}: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("").trim()));
    }
    let formats: Vec<String> = opts["formats"].as_array().unwrap().iter().filter_map(|x| x.as_str().map(String::from)).collect();
    let base = target_base(&source, output["folder"].as_str(), &formats, opts["overwrite"].as_bool().unwrap_or(false));
    if let Some(d) = base.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8);
    let mut args: Vec<String> = vec!["-m".into(), model.to_string_lossy().into_owned(), "-f".into(), wav.to_string_lossy().into_owned(), "-l".into(), opts["language"].as_str().unwrap_or("auto").into(), "-t".into(), threads.to_string(), "-pp".into(), "-of".into(), base.to_string_lossy().into_owned()];
    if opts["translate"].as_bool().unwrap_or(false) {
        args.push("-tr".into());
    }
    for f in &formats {
        args.push(match f.as_str() { "vtt" => "-ovtt", "txt" => "-otxt", "json" => "-oj", _ => "-osrt" }.into());
    }
    report(0.05, &format!("transcribing with the {model_name} model"));
    let mut c = Command::new(&whisper);
    c.args(&args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    let mut child = c.spawn().map_err(|e| format!("whisper-cli could not start: {e}"))?;
    let mut language = String::new();
    let mut tail: Vec<String> = Vec::new();
    if let Some(err) = child.stderr.take() {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            if stopped() {
                let _ = child.kill();
                break;
            }
            if let Some(rest) = line.split("progress =").nth(1) {
                if let Ok(pct) = rest.trim().trim_end_matches('%').trim().parse::<f64>() {
                    report(0.05 + 0.93 * pct / 100.0, &format!("transcribing with the {model_name} model"));
                }
            }
            if let Some(rest) = line.split("auto-detected language:").nth(1) {
                language = rest.split_whitespace().next().unwrap_or("").to_string();
            }
            tail.push(line);
            if tail.len() > 30 {
                tail.remove(0);
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if stopped() {
        return Err("stopped".into());
    }
    if !status.success() {
        return Err(format!("whisper-cli failed: {}", tail.iter().rev().find(|l| l.contains("error") || l.contains("failed")).or(tail.last()).cloned().unwrap_or_default()));
    }
    if language.is_empty() {
        language = opts["language"].as_str().unwrap_or("auto").to_string();
    }
    let files: Vec<String> = formats.iter().map(|e| base.with_extension(e)).filter(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned()).collect();
    if files.is_empty() {
        return Err("whisper-cli finished but wrote no transcript".into());
    }
    let cues = files.iter().find(|f| f.ends_with(".srt") || f.ends_with(".vtt")).and_then(|f| crate::captions::read_file(f).ok()).map(|c| c.len()).unwrap_or(0);
    let bytes: u64 = files.iter().filter_map(|f| fs::metadata(f).ok()).map(|m| m.len()).sum();
    let _ = fs::remove_file(&wav);
    Ok(json!({"path": files[0], "files": files, "count": files.len(), "bytes": bytes, "language": language, "model": model_name, "cues": cues, "notes": [format!("speech to text with whisper.cpp ({model_name}), language {language}")]}))
}
