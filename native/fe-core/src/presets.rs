use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde_json::{Value, json};

use crate::settings::{self, normalize};
use crate::util::{Res, deep_merge, new_id, now};
use crate::{formats, paths};

pub const PRESET_FORMAT: &str = "formencoder.preset/1";
pub const EXT: &str = "fepreset";

fn size(w: i64, h: i64) -> Value {
    json!({"matchSource": false, "width": w, "height": h})
}

fn h264(w: Option<(i64, i64)>, fps: Option<f64>, target: f64, peak: f64) -> Value {
    let mut v = json!({"codec": "h264", "profile": "high", "rateControl": "vbr1", "targetBitrate": target, "maxBitrate": peak, "frameRate": fps});
    if let Some((w, h)) = w {
        v = deep_merge(&v, &size(w, h));
    }
    json!({"video": v, "audio": {"codec": "aac", "bitrate": 320, "sampleRate": 48000, "channels": "stereo"}})
}

fn with(base: Value, extra: Value) -> Value {
    deep_merge(&base, &extra)
}

fn p(id: &str, name: &str, category: &str, fmt: &str, patch: Value, description: &str) -> Value {
    json!({"id": format!("system/{id}"), "name": name, "category": category, "group": category, "system": true, "format": fmt, "patch": patch, "description": description})
}

pub fn system() -> &'static Vec<Value> {
    static S: OnceLock<Vec<Value>> = OnceLock::new();
    S.get_or_init(|| {
        vec![
            p("match-source-high", "Match Source - High bitrate", "Web Video", "h264", h264(None, None, 20.0, 24.0), "H.264 at the source's size and rate, VBR 1 pass, about 20 Mb/s."),
            p("match-source-medium", "Match Source - Medium bitrate", "Web Video", "h264", h264(None, None, 10.0, 12.0), "H.264 at the source's size and rate, about 10 Mb/s."),
            p("match-source-adaptive-high", "Match Source - Adaptive High Bitrate", "Web Video", "h264", json!({"video": {"codec": "h264", "rateControl": "quality", "quality": 82}}), "H.264 at constant quality, the bitrate following the picture."),
            p("hevc-match-source-high", "HEVC Match Source - High bitrate", "Web Video", "hevc", json!({"video": {"rateControl": "vbr1", "targetBitrate": 14, "maxBitrate": 18}, "audio": {"codec": "aac", "bitrate": 320}}), ""),
            p("hevc-4k-hdr10", "HEVC 4K HDR10 (Rec. 2100 PQ)", "Web Video", "hevc", json!({"video": with(json!({"profile": "main10", "bitDepth": 10, "colorSpace": "rec2100pq", "hdr10": true, "rateControl": "vbr1", "targetBitrate": 40, "maxBitrate": 50}), size(3840, 2160))}), ""),
            p("av1-match-source", "AV1 Match Source", "Web Video", "av1", json!({"video": {"rateControl": "quality", "quality": 75}, "audio": {"codec": "opus", "bitrate": 192}}), "AV1 needs a hardware AV1 encoder or an ffmpeg with SVT-AV1."),
            p("webm-vp9-1080p", "WebM VP9 1080p", "Web Video", "webm", json!({"video": with(json!({"codec": "vp9", "rateControl": "quality", "quality": 78}), size(1920, 1080)), "audio": {"codec": "opus", "bitrate": 160}}), ""),
            p("webm-vp9-alpha", "WebM VP9 with Alpha", "Web Video", "webm", json!({"video": {"codec": "vp9", "alpha": true, "rateControl": "quality", "quality": 80}, "audio": {"codec": "opus", "bitrate": 160}}), ""),
            p("youtube-1080p", "YouTube 1080p Full HD", "Social Media", "h264", h264(Some((1920, 1080)), None, 16.0, 20.0), ""),
            p("youtube-1440p", "YouTube 1440p 2K QHD", "Social Media", "h264", h264(Some((2560, 1440)), None, 24.0, 30.0), ""),
            p("youtube-2160p", "YouTube 2160p 4K UHD", "Social Media", "h264", h264(Some((3840, 2160)), None, 45.0, 56.0), ""),
            p("youtube-shorts", "YouTube Shorts 1080x1920", "Social Media", "h264", h264(Some((1080, 1920)), None, 16.0, 20.0), ""),
            p("vimeo-1080p", "Vimeo 1080p Full HD", "Social Media", "h264", h264(Some((1920, 1080)), None, 20.0, 24.0), ""),
            p("vimeo-2160p", "Vimeo 2160p 4K UHD", "Social Media", "h264", h264(Some((3840, 2160)), None, 50.0, 60.0), ""),
            p("x-1080p", "X (Twitter) 1080p", "Social Media", "h264", h264(Some((1920, 1080)), None, 8.0, 10.0), ""),
            p("instagram-reels", "Instagram Reels and Stories 1080x1920", "Social Media", "h264", h264(Some((1080, 1920)), Some(30.0), 10.0, 12.0), ""),
            p("instagram-feed-square", "Instagram Feed 1080x1080", "Social Media", "h264", h264(Some((1080, 1080)), Some(30.0), 8.0, 10.0), ""),
            p("tiktok", "TikTok 1080x1920", "Social Media", "h264", h264(Some((1080, 1920)), None, 10.0, 12.0), ""),
            p("facebook-1080p", "Facebook 1080p", "Social Media", "h264", h264(Some((1920, 1080)), None, 10.0, 12.0), ""),
            p("linkedin-1080p", "LinkedIn 1080p", "Social Media", "h264", h264(Some((1920, 1080)), Some(30.0), 8.0, 10.0), ""),
            p("apple-tv-4k", "Apple TV 4K (HEVC)", "Devices", "hevc", json!({"video": with(json!({"rateControl": "vbr1", "targetBitrate": 25, "maxBitrate": 32}), size(3840, 2160)), "audio": {"codec": "aac", "bitrate": 256}}), ""),
            p("iphone-1080p", "Apple iPhone and iPad 1080p", "Devices", "h264", h264(Some((1920, 1080)), None, 10.0, 12.0), ""),
            p("android-1080p", "Android Phone and Tablet 1080p", "Devices", "h264", h264(Some((1920, 1080)), None, 10.0, 12.0), ""),
            p("android-720p", "Android Phone 720p", "Devices", "h264", h264(Some((1280, 720)), None, 5.0, 6.0), ""),
            p("prores-proxy", "Apple ProRes 422 Proxy", "Mezzanine", "prores", json!({"video": {"flavor": "proxy"}}), ""),
            p("prores-lt", "Apple ProRes 422 LT", "Mezzanine", "prores", json!({"video": {"flavor": "lt"}}), ""),
            p("prores-422", "Apple ProRes 422", "Mezzanine", "prores", json!({"video": {"flavor": "422"}}), ""),
            p("prores-hq", "Apple ProRes 422 HQ", "Mezzanine", "prores", json!({"video": {"flavor": "hq"}}), ""),
            p("prores-4444", "Apple ProRes 4444", "Mezzanine", "prores", json!({"video": {"flavor": "4444", "bitDepth": 12}}), ""),
            p("prores-4444-alpha", "Apple ProRes 4444 with Alpha", "Mezzanine", "prores", json!({"video": {"flavor": "4444", "bitDepth": 12, "alpha": true}}), ""),
            p("prores-4444xq", "Apple ProRes 4444 XQ", "Mezzanine", "prores", json!({"video": {"flavor": "4444xq", "bitDepth": 12}}), ""),
            p("dnxhr-lb", "DNxHR LB", "Mezzanine", "quicktime", json!({"video": {"codec": "dnxhr", "flavor": "dnxhr_lb"}}), ""),
            p("dnxhr-sq", "DNxHR SQ", "Mezzanine", "quicktime", json!({"video": {"codec": "dnxhr", "flavor": "dnxhr_sq"}}), ""),
            p("dnxhr-hq", "DNxHR HQ", "Mezzanine", "quicktime", json!({"video": {"codec": "dnxhr", "flavor": "dnxhr_hq"}}), ""),
            p("dnxhr-hqx", "DNxHR HQX 10-bit", "Mezzanine", "quicktime", json!({"video": {"codec": "dnxhr", "flavor": "dnxhr_hqx", "bitDepth": 10}}), ""),
            p("dnxhr-444", "DNxHR 444 10-bit", "Mezzanine", "quicktime", json!({"video": {"codec": "dnxhr", "flavor": "dnxhr_444", "bitDepth": 10}}), ""),
            p("cineform-high", "GoPro CineForm YUV 10-bit", "Mezzanine", "cineform", json!({"video": {"flavor": "high"}}), ""),
            p("cineform-alpha", "GoPro CineForm RGBA 12-bit with Alpha", "Mezzanine", "cineform", json!({"video": {"flavor": "filmscan1", "alpha": true, "bitDepth": 12}}), ""),
            p("animation-alpha", "QuickTime Animation with Alpha", "Mezzanine", "quicktime", json!({"video": {"codec": "qtrle", "alpha": true}}), ""),
            p("uncompressed-10bit", "Uncompressed 10-bit 4:2:2 (v210)", "Mezzanine", "quicktime", json!({"video": {"codec": "uncompressed", "flavor": "v210", "bitDepth": 10}}), ""),
            p("xdcam-hd422-1080i50", "XDCAM HD 422 1080i 25 (50 Mb/s)", "Broadcast", "mxf_op1a", json!({"video": with(json!({"codec": "xdcam", "flavor": "50", "fieldOrder": "tff", "frameRate": 25}), size(1920, 1080)), "audio": {"codec": "pcm", "bitDepth": 24, "channels": "discrete"}}), ""),
            p("xdcam-hd422-1080i5994", "XDCAM HD 422 1080i 29.97 (50 Mb/s)", "Broadcast", "mxf_op1a", json!({"video": with(json!({"codec": "xdcam", "flavor": "50", "fieldOrder": "tff", "frameRate": 29.97}), size(1920, 1080)), "audio": {"codec": "pcm", "bitDepth": 24, "channels": "discrete"}}), ""),
            p("xdcam-hd422-720p50", "XDCAM HD 422 720p 50 (50 Mb/s)", "Broadcast", "mxf_op1a", json!({"video": with(json!({"codec": "xdcam", "flavor": "50", "frameRate": 50}), size(1280, 720)), "audio": {"codec": "pcm", "bitDepth": 24, "channels": "discrete"}}), ""),
            p("dnxhr-hq-mxf", "DNxHR HQ MXF OP1a", "Broadcast", "dnxhr_mxf", json!({"video": {"flavor": "dnxhr_hq"}, "audio": {"codec": "pcm", "bitDepth": 24}}), ""),
            p("dnxhd-145-mxf", "DNxHD 145 MXF OP1a 1080", "Broadcast", "dnxhr_mxf", json!({"video": with(json!({"flavor": "dnxhd_145"}), size(1920, 1080)), "audio": {"codec": "pcm", "bitDepth": 24}}), ""),
            p("prores-hq-mxf", "Apple ProRes 422 HQ MXF OP1a", "Broadcast", "prores_mxf", json!({"video": {"flavor": "hq"}, "audio": {"codec": "pcm", "bitDepth": 24}}), ""),
            p("jpeg2000-mxf", "JPEG 2000 MXF OP1a", "Broadcast", "jpeg2000_mxf", json!({"video": {"rateControl": "quality", "quality": 90}, "audio": {"codec": "pcm", "bitDepth": 24}}), ""),
            p("mpeg2-1080i", "MPEG-2 1080i 29.97 Broadcast", "Broadcast", "mpeg2", json!({"video": with(json!({"rateControl": "cbr", "targetBitrate": 25, "fieldOrder": "tff", "frameRate": 29.97}), size(1920, 1080)), "audio": {"codec": "mp2", "bitrate": 384}}), ""),
            p("h264-broadcast-ebu", "H.264 Broadcast, EBU R128 loudness", "Broadcast", "h264", with(h264(Some((1920, 1080)), None, 30.0, 36.0), json!({"effects": {"loudness": {"enabled": true, "standard": "ebu-r128"}}})), ""),
            p("h264-broadcast-atsc", "H.264 Broadcast, ATSC A/85 loudness", "Broadcast", "h264", with(h264(Some((1920, 1080)), None, 30.0, 36.0), json!({"effects": {"loudness": {"enabled": true, "standard": "atsc-a85"}}})), ""),
            p("mpeg2-dvd-ntsc", "NTSC DV Widescreen DVD", "DVD", "mpeg2_dvd", json!({"video": with(json!({"rateControl": "vbr2", "targetBitrate": 6, "maxBitrate": 8, "frameRate": 29.97, "pixelAspect": "40:33", "fieldOrder": "bff"}), size(720, 480)), "audio": {"codec": "ac3", "bitrate": 224}}), ""),
            p("mpeg2-dvd-pal", "PAL DV Widescreen DVD", "DVD", "mpeg2_dvd", json!({"video": with(json!({"rateControl": "vbr2", "targetBitrate": 6, "maxBitrate": 8, "frameRate": 25, "pixelAspect": "16:11", "fieldOrder": "tff"}), size(720, 576)), "audio": {"codec": "ac3", "bitrate": 224}}), ""),
            p("png-sequence", "PNG Sequence", "Image Sequence", "png", json!({"video": {"sequence": true}}), ""),
            p("png-sequence-alpha", "PNG Sequence with Alpha", "Image Sequence", "png", json!({"video": {"sequence": true, "alpha": true}}), ""),
            p("tiff-sequence-16", "TIFF Sequence 16-bit", "Image Sequence", "tiff", json!({"video": {"sequence": true, "bitDepth": 16}}), ""),
            p("dpx-sequence-10", "DPX Sequence 10-bit", "Image Sequence", "dpx", json!({"video": {"sequence": true, "bitDepth": 10}}), ""),
            p("exr-sequence-half", "OpenEXR Sequence (half float)", "Image Sequence", "exr", json!({"video": {"sequence": true, "bitDepth": 16}}), ""),
            p("jpeg-sequence", "JPEG Sequence", "Image Sequence", "jpeg", json!({"video": {"sequence": true, "rateControl": "quality", "quality": 90}}), ""),
            p("targa-sequence", "Targa Sequence", "Image Sequence", "targa", json!({"video": {"sequence": true}}), ""),
            p("png-still", "PNG Still (first frame of the range)", "Image", "png", json!({"video": {"sequence": false}}), ""),
            p("jpeg-still", "JPEG Still", "Image", "jpeg", json!({"video": {"sequence": false, "rateControl": "quality", "quality": 92}}), ""),
            p("gif-480", "Animated GIF 480 px", "Animated GIF", "gif", json!({"video": {"matchSource": false, "width": 480, "height": null, "frameRate": 15}}), ""),
            p("gif-720", "Animated GIF 720 px", "Animated GIF", "gif", json!({"video": {"matchSource": false, "width": 720, "height": null, "frameRate": 20}}), ""),
            p("wav-48-24", "Waveform Audio 48 kHz 24-bit", "Audio Only", "wav", json!({"audio": {"sampleRate": 48000, "bitDepth": 24}}), ""),
            p("wav-48-16", "Waveform Audio 48 kHz 16-bit", "Audio Only", "wav", json!({"audio": {"sampleRate": 48000, "bitDepth": 16}}), ""),
            p("bwf-ebu", "Broadcast WAV, EBU R128 loudness", "Audio Only", "bwf", json!({"audio": {"sampleRate": 48000, "bitDepth": 24}, "effects": {"loudness": {"enabled": true, "standard": "ebu-r128"}}}), ""),
            p("aiff-48-24", "AIFF 48 kHz 24-bit", "Audio Only", "aiff", json!({"audio": {"sampleRate": 48000, "bitDepth": 24}}), ""),
            p("mp3-320", "MP3 320 kb/s", "Audio Only", "mp3", json!({"audio": {"bitrate": 320, "sampleRate": 48000}}), "MP3 needs an ffmpeg with LAME (the bundled LGPL build has none)."),
            p("mp3-podcast", "MP3 Podcast, -16 LUFS", "Audio Only", "mp3", json!({"audio": {"bitrate": 128, "sampleRate": 44100, "channels": "mono"}, "effects": {"loudness": {"enabled": true, "standard": "podcast"}}}), ""),
            p("aac-256", "AAC Audio 256 kb/s", "Audio Only", "aac", json!({"audio": {"bitrate": 256}}), ""),
            p("aac-streaming", "AAC Streaming, -14 LUFS", "Audio Only", "aac", json!({"audio": {"bitrate": 256}, "effects": {"loudness": {"enabled": true, "standard": "streaming"}}}), ""),
            p("flac-48-24", "FLAC 48 kHz 24-bit", "Audio Only", "flac", json!({"audio": {"sampleRate": 48000, "bitDepth": 24}}), ""),
            p("ogg-opus", "Ogg Opus 160 kb/s", "Audio Only", "ogg", json!({"audio": {"codec": "opus", "bitrate": 160}}), ""),
            p("ffv1-archive", "FFV1 Lossless Archive (Matroska)", "Archive", "matroska", json!({"video": {"codec": "ffv1", "bitDepth": 10}, "audio": {"codec": "flac", "bitDepth": 24}}), ""),
            p("proxy-prores", "ProRes Proxy, quarter size (proxy)", "Proxy", "prores", json!({"video": with(json!({"flavor": "proxy"}), size(960, 540)), "outputName": "{source}_Proxy"}), ""),
            p("proxy-h264-540", "H.264 Proxy 960x540", "Proxy", "h264", with(h264(Some((960, 540)), None, 3.0, 4.0), json!({"outputName": "{source}_Proxy"})), ""),
            p("proxy-h264-720", "H.264 Proxy 1280x720 (formcut)", "Proxy", "h264", with(h264(Some((1280, 720)), None, 5.0, 6.0), json!({"outputName": "{source}_Proxy"})), ""),
            p("proxy-cineform", "CineForm Proxy 1280x720", "Proxy", "cineform", json!({"video": with(json!({"flavor": "low"}), size(1280, 720)), "outputName": "{source}_Proxy"}), ""),
            p("family-formcut-mezzanine", "formcut mezzanine (ProRes 422 HQ)", "Form Family", "prores", json!({"video": {"flavor": "hq"}, "outputName": "{source}_formcut"}), ""),
            p("family-formwav-audio", "formwav session audio (WAV 48 kHz 24-bit)", "Form Family", "wav", json!({"audio": {"bitDepth": 24}, "outputName": "{source}_formwav"}), ""),
            p("family-formvis-stills", "formvis stills (PNG Sequence)", "Form Family", "png", json!({"video": {"sequence": true}, "outputName": "{source}_formvis"}), ""),
        ]
    })
}

pub fn ingest() -> Vec<Value> {
    vec![
        json!({"id": "ingest/copy", "name": "Copy (verify size)", "kind": "ingest", "system": true, "category": "Ingest", "group": "Ingest", "verify": "size", "transcode": null}),
        json!({"id": "ingest/copy-md5", "name": "Copy with MD5 verification", "kind": "ingest", "system": true, "category": "Ingest", "group": "Ingest", "verify": "md5", "transcode": null}),
        json!({"id": "ingest/copy-bit", "name": "Copy with bit-by-bit verification", "kind": "ingest", "system": true, "category": "Ingest", "group": "Ingest", "verify": "bit", "transcode": null}),
        json!({"id": "ingest/copy-prores-proxy", "name": "Copy and create ProRes proxies", "kind": "ingest", "system": true, "category": "Ingest", "group": "Ingest", "verify": "md5", "transcode": "system/proxy-prores"}),
        json!({"id": "ingest/copy-h264-proxy", "name": "Copy and create H.264 proxies", "kind": "ingest", "system": true, "category": "Ingest", "group": "Ingest", "verify": "md5", "transcode": "system/proxy-h264-720"}),
    ]
}

pub fn user_dir() -> PathBuf {
    paths::sub("presets")
}

fn read_json(path: &Path) -> Value {
    fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null)
}

pub fn aliases() -> serde_json::Map<String, Value> {
    read_json(&user_dir().join("aliases.json")).as_object().cloned().unwrap_or_default()
}

fn save_aliases(m: &serde_json::Map<String, Value>) {
    let _ = fs::write(user_dir().join("aliases.json"), serde_json::to_string_pretty(m).unwrap_or_default());
}

pub fn user_presets() -> Vec<Value> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(user_dir()) else { return out };
    let mut files: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| e == EXT).unwrap_or(false)).collect();
    files.sort();
    for f in files {
        let mut v = read_json(&f);
        if v.is_object() {
            v["system"] = json!(false);
            v["file"] = json!(f.to_string_lossy());
            out.push(v);
        }
    }
    out
}

pub fn groups() -> Vec<String> {
    let mut g: Vec<String> = read_json(&user_dir().join("groups.json")).as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    for p in user_presets() {
        if let Some(name) = p["group"].as_str() {
            g.push(name.to_string());
        }
    }
    g.sort();
    g.dedup();
    g
}

fn system_cache() -> &'static Mutex<HashMap<String, Value>> {
    static C: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn settings_of(p: &Value) -> Value {
    if p["kind"] == "ingest" {
        return json!({});
    }
    if p.get("settings").map(Value::is_object).unwrap_or(false) {
        return normalize(&p["settings"]).unwrap_or(Value::Null);
    }
    let id = p["id"].as_str().unwrap_or("").to_string();
    if let Some(hit) = system_cache().lock().unwrap().get(&id) {
        return hit.clone();
    }
    let fmt = p["format"].as_str().unwrap_or("h264");
    let base = settings::default(fmt).unwrap_or(Value::Null);
    let mut patch = p["patch"].clone();
    patch["format"] = json!(fmt);
    let s = normalize(&deep_merge(&base, &patch)).unwrap_or(Value::Null);
    system_cache().lock().unwrap().insert(id, s.clone());
    s
}

pub fn everything() -> Vec<Value> {
    let al = aliases();
    let mut rows = Vec::new();
    for p in system().iter().cloned().chain(ingest()).chain(user_presets()) {
        let mut row = p.clone();
        if let Value::Object(m) = &mut row {
            m.remove("patch");
        }
        row["settings"] = settings_of(&p);
        row["alias"] = al.get(p["id"].as_str().unwrap_or("")).cloned().unwrap_or(Value::Null);
        rows.push(row);
    }
    rows
}

pub fn find(key: &str) -> Option<Value> {
    if key.is_empty() {
        return None;
    }
    let all = everything();
    let low = key.to_lowercase();
    if let Some(hit) = all.iter().find(|p| p["id"] == json!(key) || p["name"].as_str().map(|n| n.to_lowercase() == low).unwrap_or(false) || p["alias"].as_str().map(|a| a.to_lowercase() == low).unwrap_or(false)) {
        return Some(hit.clone());
    }
    let hits: Vec<&Value> = all.iter().filter(|p| p["name"].as_str().map(|n| n.to_lowercase().contains(&low)).unwrap_or(false)).collect();
    if hits.len() == 1 { Some(hits[0].clone()) } else { None }
}

pub fn require(key: &str) -> Res {
    find(key).ok_or_else(|| format!("no preset {key:?}; preset.list shows them"))
}

pub fn settings_for(key: &str) -> Res {
    let p = require(key)?;
    if p["kind"] == "ingest" {
        return Err(format!("{} is an ingest preset; use ingest.copy", p["name"].as_str().unwrap_or("")));
    }
    let mut s = p["settings"].clone();
    s["preset"] = p["id"].clone();
    s["presetName"] = p["name"].clone();
    Ok(s)
}

pub fn row(p: &Value) -> Value {
    let s = &p["settings"];
    let v = &s["video"];
    let has_settings = s.get("format").is_some();
    let summ = if has_settings { settings::summary(s, &Value::Null) } else { json!({}) };
    let frame = if !has_settings { String::new() } else if v["matchSource"].as_bool().unwrap_or(true) || v["width"].is_null() { "Match source".into() } else { format!("{}x{}", v["width"], v["height"].as_i64().map(|h| h.to_string()).unwrap_or_else(|| "auto".into())) };
    let rate = if !has_settings { String::new() } else { v["frameRate"].as_f64().map(crate::util::fmt_g).unwrap_or_else(|| "Match source".into()) };
    let target = match v["rateControl"].as_str() {
        Some("vbr1" | "vbr2" | "cbr") => format!("{} Mb/s", crate::util::fmt_g(v["targetBitrate"].as_f64().unwrap_or(0.0))),
        Some("quality") => "Quality".into(),
        _ => String::new(),
    };
    json!({"id": p["id"], "name": p["name"], "group": p["group"], "category": p["category"], "system": p["system"].as_bool().unwrap_or(false), "kind": p["kind"].as_str().unwrap_or("encode"),
           "format": s.get("format").cloned().unwrap_or(p["format"].clone()), "formatLabel": summ.get("format").cloned().unwrap_or(json!("Ingest")), "alias": p["alias"],
           "frameSize": frame, "frameRate": rate, "targetRate": target, "comment": p.get("description").filter(|d| d.as_str().map(|x| !x.is_empty()).unwrap_or(false)).or(p.get("comment")).cloned().unwrap_or(json!("")),
           "summary": summ, "transcode": p.get("transcode").cloned().unwrap_or(Value::Null), "verify": p.get("verify").cloned().unwrap_or(Value::Null)})
}

pub fn listing(query: Option<&str>, category: Option<&str>, kind: Option<&str>) -> Vec<Value> {
    let mut rows: Vec<Value> = everything().iter().map(row).collect();
    if let Some(q) = query.filter(|q| !q.is_empty()) {
        let q = q.to_lowercase();
        rows.retain(|r| ["name", "formatLabel", "group", "alias", "comment"].iter().any(|k| r[*k].as_str().map(|x| x.to_lowercase().contains(&q)).unwrap_or(false)));
    }
    if let Some(c) = category.filter(|c| !c.is_empty()) {
        let c = c.to_lowercase();
        rows.retain(|r| r["category"].as_str().map(|x| x.to_lowercase() == c).unwrap_or(false) || r["group"].as_str().map(|x| x.to_lowercase() == c).unwrap_or(false));
    }
    if let Some(k) = kind {
        rows.retain(|r| r["kind"] == json!(k));
    }
    rows
}

fn slug(name: &str) -> String {
    let s: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let s = s.split('-').filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-");
    let s: String = s.chars().take(48).collect();
    if s.is_empty() { "preset".into() } else { s }
}

fn file_for(id: &str) -> PathBuf {
    user_dir().join(format!("{}.{EXT}", id.split_once('/').map(|x| x.1).unwrap_or(id)))
}

pub fn create(name: &str, settings: &Value, group: Option<&str>, comment: &str) -> Res {
    let id = format!("user/{}-{}", slug(name), &new_id("")[..6]);
    let mut s = normalize(settings)?;
    s["preset"] = json!(id);
    s["presetName"] = json!(name);
    let data = json!({"format": PRESET_FORMAT, "id": id, "name": name, "group": group.unwrap_or("User Presets"), "category": "User", "comment": comment, "kind": "encode",
                      "created": now(), "modified": now(), "settings": s});
    let path = file_for(&id);
    fs::write(&path, serde_json::to_string_pretty(&data).unwrap_or_default()).map_err(|e| e.to_string())?;
    let mut out = data;
    out["file"] = json!(path.to_string_lossy());
    Ok(out)
}

pub fn write_back(data: &Value) -> Res<()> {
    let mut clean = data.clone();
    if let Value::Object(m) = &mut clean {
        for k in ["file", "system", "alias"] {
            m.remove(k);
        }
    }
    let id = data["id"].as_str().ok_or("preset without id")?;
    fs::write(file_for(id), serde_json::to_string_pretty(&clean).unwrap_or_default()).map_err(|e| e.to_string())
}

pub fn update(key: &str, name: Option<&str>, settings: Option<&Value>, group: Option<&str>, comment: Option<&str>) -> Res {
    let p = require(key)?;
    if p["system"].as_bool().unwrap_or(false) {
        return Err(format!("{} is a system preset; Save A Copy (preset.duplicate) to change it", p["name"].as_str().unwrap_or("")));
    }
    let mut data = read_json(Path::new(p["file"].as_str().unwrap_or("")));
    if let Some(n) = name {
        data["name"] = json!(n);
    }
    if let Some(s) = settings {
        data["settings"] = normalize(s)?;
    }
    if let Some(g) = group {
        data["group"] = json!(g);
    }
    if let Some(c) = comment {
        data["comment"] = json!(c);
    }
    data["settings"]["preset"] = data["id"].clone();
    data["settings"]["presetName"] = data["name"].clone();
    data["modified"] = json!(now());
    write_back(&data)?;
    Ok(data)
}

pub fn delete(key: &str) -> Res {
    let p = require(key)?;
    if p["system"].as_bool().unwrap_or(false) {
        return Err(format!("{} is a system preset and cannot be deleted", p["name"].as_str().unwrap_or("")));
    }
    let _ = fs::remove_file(p["file"].as_str().unwrap_or(""));
    let mut al = aliases();
    if al.remove(p["id"].as_str().unwrap_or("")).is_some() {
        save_aliases(&al);
    }
    Ok(json!({"deleted": p["id"], "preset": p}))
}

pub fn duplicate(key: &str, name: Option<&str>) -> Res {
    let p = require(key)?;
    if p["kind"] == "ingest" {
        return Err("ingest presets are not duplicated".into());
    }
    let group = if p["system"].as_bool().unwrap_or(false) { None } else { p["group"].as_str() };
    let name = name.map(String::from).unwrap_or_else(|| format!("{} copy", p["name"].as_str().unwrap_or("Preset")));
    create(&name, &p["settings"], group, p["description"].as_str().or(p["comment"].as_str()).unwrap_or(""))
}

pub fn new_group(name: &str) -> Res {
    let mut g = groups();
    g.push(name.to_string());
    g.sort();
    g.dedup();
    fs::write(user_dir().join("groups.json"), serde_json::to_string_pretty(&g).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(json!(g))
}

pub fn set_alias(key: &str, alias: Option<&str>) -> Res {
    let p = require(key)?;
    let mut al = aliases();
    let id = p["id"].as_str().unwrap_or("").to_string();
    match alias.filter(|a| !a.is_empty()) {
        Some(a) => {
            al.insert(id.clone(), json!(a));
        }
        None => {
            al.remove(&id);
        }
    }
    save_aliases(&al);
    Ok(json!({"id": id, "alias": alias}))
}

pub fn export(key: &str, path: &str) -> Res {
    let p = require(key)?;
    let mut out = PathBuf::from(paths::expand(path));
    if out.extension().map(|e| e != EXT).unwrap_or(true) {
        out.set_extension(EXT);
    }
    let data = json!({"format": PRESET_FORMAT, "id": p["id"], "name": p["name"], "group": p["group"], "comment": p.get("comment").or(p.get("description")).cloned().unwrap_or(json!("")),
                      "kind": p["kind"].as_str().unwrap_or("encode"), "settings": p["settings"]});
    fs::write(&out, serde_json::to_string_pretty(&data).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(json!({"path": out.to_string_lossy()}))
}

pub fn import_file(path: &str, group: Option<&str>) -> Res {
    let src = PathBuf::from(paths::expand(path));
    let text = fs::read_to_string(&src).map_err(|e| format!("cannot read {path}: {e}"))?;
    let stem = src.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Imported".into());
    if src.extension().map(|e| e.to_string_lossy().to_lowercase() == "epr").unwrap_or(false) || text.trim_start().starts_with('<') {
        let (name, settings, notes) = parse_epr(&text, &stem)?;
        let mut made = create(&name, &settings, Some(group.unwrap_or("Imported")), &format!("Imported from {}. {notes}", src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()))?;
        made["notes"] = json!(notes);
        return Ok(made);
    }
    let data: Value = serde_json::from_str(&text).map_err(|e| format!("not a preset file: {e}"))?;
    let settings = if data.get("settings").is_some() { data["settings"].clone() } else { data.clone() };
    create(data["name"].as_str().unwrap_or(&stem), &settings, Some(group.or(data["group"].as_str()).unwrap_or("Imported")), data["comment"].as_str().unwrap_or(""))
}

const EPR_FORMATS: &[(&str, &str)] = &[
    ("jpeg 2000 mxf op1a", "jpeg2000_mxf"), ("wraptor dcp", "jpeg2000_mxf"), ("gopro cineform", "cineform"), ("waveform audio", "wav"), ("animated gif", "gif"), ("apple prores", "prores"),
    ("aac audio", "aac"), ("mxf op1a", "mxf_op1a"), ("quicktime", "quicktime"), ("openexr", "exr"), ("mpeg-2", "mpeg2"), ("mpeg2", "mpeg2"), ("mpeg4", "mpeg4"), ("h.264", "h264"), ("h264", "h264"),
    ("hevc", "hevc"), ("h.265", "hevc"), ("dnxhr", "dnxhr_mxf"), ("prores", "prores"), ("targa", "targa"), ("tiff", "tiff"), ("jpeg", "jpeg"), ("png", "png"), ("dpx", "dpx"), ("bmp", "bmp"),
    ("aiff", "aiff"), ("mp3", "mp3"), ("avi", "avi"), ("gif", "gif"),
];

pub fn parse_epr(text: &str, fallback: &str) -> Res<(String, Value, String)> {
    if !text.contains('<') {
        return Err("not a readable .epr preset".into());
    }
    let tag = |t: &str| Regex::new(&format!(r"(?s)<{t}[^>]*>(.*?)</{t}>")).ok().and_then(|r| r.captures(text).map(|c| c[1].trim().to_string())).filter(|x| !x.is_empty());
    let name = tag("PresetName").or_else(|| tag("Name")).unwrap_or_else(|| fallback.to_string());
    let mut fmt = "h264".to_string();
    let hint = ["ExporterName", "ExporterFileType", "FileType", "FormatName"].iter().find_map(|t| tag(t)).unwrap_or_default().to_lowercase();
    let lower = text.to_lowercase();
    let head: String = lower.chars().take(6000).collect();
    for (k, v) in EPR_FORMATS {
        if hint.contains(k) {
            fmt = v.to_string();
            break;
        }
    }
    if hint.is_empty() {
        for (k, v) in EPR_FORMATS {
            if head.contains(k) {
                fmt = v.to_string();
                break;
            }
        }
    }
    let pair = Regex::new(r"(?s)<ParamIdentifier>([^<]*)</ParamIdentifier>.*?<ParamValue>([^<]*)</ParamValue>").unwrap();
    let mut params: Vec<(String, String)> = Vec::new();
    for c in pair.captures_iter(text) {
        params.push((c[1].trim().to_string(), c[2].trim().to_string()));
    }
    let numv = |keys: &[&str]| -> Option<f64> { params.iter().find(|(k, v)| keys.iter().any(|x| k.to_lowercase().contains(&x.to_lowercase())) && v.parse::<f64>().is_ok()).and_then(|(_, v)| v.parse().ok()) };
    let mut s = settings::default(&fmt)?;
    let mut found = Vec::new();
    if let (Some(w), Some(h)) = (numv(&["VideoWidth"]), numv(&["VideoHeight"])) {
        if w > 15.0 && h > 15.0 {
            s["video"]["matchSource"] = json!(false);
            s["video"]["width"] = json!(w as i64);
            s["video"]["height"] = json!(h as i64);
            found.push(format!("frame size {}x{}", w as i64, h as i64));
        }
    }
    if let Some(fps) = numv(&["VideoFPS", "FrameRate"]) {
        let rate = if fps < 1000.0 { fps } else { 254_016_000_000.0 / fps };
        if (1.0..=240.0).contains(&rate) {
            s["video"]["frameRate"] = json!((rate * 1000.0).round() / 1000.0);
            found.push(format!("frame rate {rate:.3}"));
        }
    }
    if let Some(t) = numv(&["TargetBitrate"]) {
        s["video"]["targetBitrate"] = json!(if t < 1000.0 { t } else { t / 1_000_000.0 });
        found.push("target bitrate".into());
    }
    if let Some(m) = numv(&["MaxBitrate"]) {
        s["video"]["maxBitrate"] = json!(if m < 1000.0 { m } else { m / 1_000_000.0 });
    }
    if let Some(r) = numv(&["AudioRatePerSecond", "SampleRate"]) {
        if r > 1000.0 {
            s["audio"]["sampleRate"] = json!(r as i64);
            found.push(format!("sample rate {}", r as i64));
        }
    }
    let notes = format!("Read: format {}{}. Other parameters take formencoder's defaults.", formats::label(&fmt), if found.is_empty() { String::new() } else { format!(", {}", found.join(", ")) });
    Ok((name, normalize(&s)?, notes))
}
