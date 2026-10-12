use std::collections::BTreeMap;
use std::fs;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::thread;

use serde_json::{Value, json};

use crate::{ffmpeg, paths};

pub const VIDEO: &[(&str, &[&str])] = &[
    ("h264", &["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf", "h264_vaapi", "h264_mf", "libx264", "libopenh264"]),
    ("hevc", &["hevc_videotoolbox", "hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_vaapi", "hevc_mf", "libx265"]),
    ("av1", &["av1_nvenc", "av1_qsv", "av1_amf", "av1_vaapi", "libsvtav1", "libaom-av1", "librav1e"]),
    ("vp9", &["vp9_qsv", "vp9_vaapi", "libvpx-vp9"]),
    ("vp8", &["libvpx"]),
    ("prores", &["prores_videotoolbox", "prores_ks", "prores_aw"]),
    ("dnxhd", &["dnxhd"]),
    ("cineform", &["cfhd"]),
    ("mpeg2", &["mpeg2video", "mpeg2_qsv", "mpeg2_vaapi"]),
    ("mpeg4", &["mpeg4"]),
    ("dv", &["dvvideo"]),
    ("mjpeg", &["mjpeg"]),
    ("jpeg2000", &["libopenjpeg", "jpeg2000"]),
    ("ffv1", &["ffv1"]),
    ("qtrle", &["qtrle"]),
    ("uncompressed", &["rawvideo", "v210"]),
    ("png", &["png"]),
    ("tiff", &["tiff"]),
    ("dpx", &["dpx"]),
    ("exr", &["exr"]),
    ("targa", &["targa"]),
    ("bmp", &["bmp"]),
    ("webp", &["libwebp"]),
    ("gif", &["gif"]),
];

pub const AUDIO: &[(&str, &[&str])] = &[
    ("aac", &["aac_at", "libfdk_aac", "aac"]),
    ("mp3", &["libmp3lame", "libshine"]),
    ("opus", &["libopus", "opus"]),
    ("vorbis", &["libvorbis", "vorbis"]),
    ("flac", &["flac"]),
    ("alac", &["alac"]),
    ("ac3", &["ac3"]),
    ("eac3", &["eac3"]),
    ("mp2", &["mp2"]),
    ("pcm", &["pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"]),
];

pub const HARDWARE_SUFFIX: &[&str] = &["_videotoolbox", "_nvenc", "_qsv", "_amf", "_vaapi", "_mf", "_v4l2m2m"];
pub const VAAPI_DEVICE: &str = "/dev/dri/renderD128";

pub const EXTERNAL: &[&str] = &["openh264", "kvazaar", "lame"];

pub fn external() -> Vec<String> {
    let mut out = Vec::new();
    if crate::openh264::library().is_some() {
        out.push("openh264".to_string());
    }
    for p in ["kvazaar", "lame"] {
        if crate::tools::find(p).is_some() {
            out.push(p.to_string());
        }
    }
    out
}

pub fn is_external(name: &str) -> bool {
    EXTERNAL.contains(&name)
}

pub fn is_hardware(name: &str) -> bool {
    HARDWARE_SUFFIX.iter().any(|s| name.ends_with(s))
}

pub fn hardware_io(encoder: &str) -> (Vec<String>, Option<String>) {
    if encoder.ends_with("_vaapi") {
        return (vec!["-vaapi_device".into(), VAAPI_DEVICE.into()], Some("format=nv12,hwupload".into()));
    }
    if encoder.ends_with("_qsv") {
        return (vec!["-init_hw_device".into(), "qsv=hw".into(), "-filter_hw_device".into(), "hw".into()], Some("format=nv12".into()));
    }
    (vec![], None)
}

#[derive(Clone, Default)]
pub struct Detected {
    pub identity: String,
    pub video: BTreeMap<String, Vec<String>>,
    pub audio: BTreeMap<String, Vec<String>>,
}

fn cache() -> &'static Mutex<Option<Detected>> {
    static C: OnceLock<Mutex<Option<Detected>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

fn works(encoder: &str) -> bool {
    let (device, upload) = hardware_io(encoder);
    let pix = if encoder == "prores_videotoolbox" { "p210le" } else if encoder.starts_with("prores") { "yuv422p10le" } else { "yuv420p" };
    let mut args: Vec<String> = vec!["-v".into(), "error".into()];
    args.extend(device);
    args.extend(["-f".into(), "lavfi".into(), "-i".into(), "testsrc2=size=320x240:rate=30:duration=0.1".into(), "-frames:v".into(), "2".into()]);
    match upload {
        Some(u) => args.extend(["-vf".into(), u]),
        None => args.extend(["-pix_fmt".into(), pix.into()]),
    }
    args.extend(["-c:v".into(), encoder.into(), "-f".into(), "null".into(), "-".into()]);
    ffmpeg::ff().args(&args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false)
}

fn identity() -> String {
    let path = ffmpeg::ffmpeg();
    match fs::metadata(&path) {
        Ok(m) => format!("{path}|{}|{:?}|{}|{}", m.len(), m.modified().ok(), VIDEO.len(), external().join(",")),
        Err(_) => path,
    }
}

pub fn detect(refresh: bool) -> Detected {
    if !refresh {
        if let Some(d) = cache().lock().unwrap().clone() {
            return d;
        }
    }
    let ident = identity();
    let record = paths::data_dir().join("encoders.json");
    if !refresh {
        if let Ok(text) = fs::read_to_string(&record) {
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                if v["identity"] == json!(ident) {
                    let d = Detected { identity: ident.clone(), video: parse_map(&v["video"]), audio: parse_map(&v["audio"]) };
                    *cache().lock().unwrap() = Some(d.clone());
                    return d;
                }
            }
        }
    }
    let listed = ffmpeg::encoders();
    let mut probe: Vec<String> = VIDEO.iter().flat_map(|(_, opts)| opts.iter()).filter(|n| listed.contains(**n) && (is_hardware(n) || n.starts_with("lib") || n.starts_with("prores"))).map(|n| n.to_string()).collect();
    probe.sort();
    probe.dedup();
    let handles: Vec<_> = probe.iter().cloned().map(|n| thread::spawn(move || (n.clone(), works(&n)))).collect();
    let results: BTreeMap<String, bool> = handles.into_iter().filter_map(|h| h.join().ok()).collect();
    let mut video = BTreeMap::new();
    for (codec, opts) in VIDEO {
        video.insert(codec.to_string(), opts.iter().filter(|n| listed.contains(**n) && *results.get(**n).unwrap_or(&true)).map(|n| n.to_string()).collect());
    }
    let mut audio = BTreeMap::new();
    for (codec, opts) in AUDIO {
        audio.insert(codec.to_string(), opts.iter().filter(|n| listed.contains(**n)).map(|n| n.to_string()).collect());
    }
    let ext = external();
    for (name, family, is_video) in [("openh264", "h264", true), ("kvazaar", "hevc", true), ("lame", "mp3", false)] {
        if ext.iter().any(|e| e == name) {
            let map = if is_video { &mut video } else { &mut audio };
            map.entry(family.to_string()).or_insert_with(Vec::new).push(name.to_string());
        }
    }
    let d = Detected { identity: ident.clone(), video, audio };
    let _ = fs::write(&record, serde_json::to_string_pretty(&json!({"identity": ident, "video": d.video, "audio": d.audio})).unwrap_or_default());
    *cache().lock().unwrap() = Some(d.clone());
    d
}

fn parse_map(v: &Value) -> BTreeMap<String, Vec<String>> {
    v.as_object().map(|m| m.iter().map(|(k, x)| (k.clone(), x.as_array().map(|a| a.iter().filter_map(|y| y.as_str().map(String::from)).collect()).unwrap_or_default())).collect()).unwrap_or_default()
}

pub fn choose(family: &str, hardware: &str) -> Option<String> {
    let d = detect(false);
    let opts = d.video.get(family).cloned().unwrap_or_default();
    match hardware {
        "off" => opts.iter().find(|o| !is_hardware(o)).cloned(),
        "on" => opts.iter().find(|o| is_hardware(o)).cloned().or_else(|| opts.first().cloned()),
        _ => opts.first().cloned(),
    }
}

pub fn choose_audio(family: &str) -> Option<String> {
    detect(false).audio.get(family).and_then(|o| o.first().cloned())
}

pub fn ten_bit(encoder: &str) -> Option<&'static str> {
    match encoder {
        "libx265" | "libsvtav1" | "libaom-av1" | "libvpx-vp9" | "libx264" => Some("yuv420p10le"),
        "hevc_videotoolbox" | "hevc_nvenc" | "hevc_qsv" | "hevc_amf" | "av1_nvenc" | "av1_qsv" | "av1_amf" => Some("p010le"),
        "hevc_vaapi" => Some("p010"),
        _ => None,
    }
}

pub fn four_two_two(encoder: &str) -> bool {
    matches!(encoder, "libx264" | "libx265" | "hevc_videotoolbox")
}

pub fn status() -> Value {
    let d = detect(false);
    let video: serde_json::Map<String, Value> = d.video.iter().map(|(c, o)| (c.clone(), json!({"available": !o.is_empty(), "encoder": o.first(), "all": o, "hardware": o.iter().filter(|x| is_hardware(x)).collect::<Vec<_>>()}))).collect();
    let audio: serde_json::Map<String, Value> = d.audio.iter().map(|(c, o)| (c.clone(), json!({"available": !o.is_empty(), "encoder": o.first(), "all": o}))).collect();
    let mut hw: Vec<String> = d.video.values().flatten().filter(|x| is_hardware(x)).cloned().collect();
    hw.sort();
    hw.dedup();
    json!({"ffmpeg": ffmpeg::version(), "video": video, "audio": audio, "hardware": hw})
}
