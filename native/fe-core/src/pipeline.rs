use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use regex::Regex;
use serde_json::{Value, json};

use crate::captions::{self, Cue};
use crate::formats::{self, acodec, vcodec};
use crate::settings::loudness_standards;
use crate::text::{self, Rgba, Timecode};
use crate::util::{Res, rate_str};
use crate::{colour, encoders, ffmpeg};

#[derive(Clone, Default)]
pub struct Source {
    pub path: String,
    pub info: Value,
    pub interpret: Value,
    pub range: Value,
    pub audio_path: Option<String>,
    pub stitch: Vec<(String, Value)>,
}

#[derive(Clone, Default)]
pub struct Measured {
    pub loudness: Option<Value>,
    pub tuner_frames: Vec<i64>,
}

#[derive(Clone, Default)]
pub struct Plan {
    pub passes: Vec<Vec<String>>,
    pub output: String,
    pub extra_outputs: Vec<String>,
    pub duration: f64,
    pub frames: i64,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    pub encoder: Option<String>,
    pub audio_encoder: Option<String>,
    pub timecode: Option<Timecode>,
    pub notes: Vec<String>,
    pub sidecars: Vec<(String, String)>,
    pub loudness: Option<Value>,
    pub in_point: f64,
    pub tuner_factor: f64,
}

impl Plan {
    pub fn command_line(&self) -> String {
        self.passes.iter().map(|p| p.iter().map(|a| shell_quote(a)).collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n")
    }
}

fn shell_quote(a: &str) -> String {
    if a.chars().all(|c| c.is_ascii_alphanumeric() || "-_./:=+,@%".contains(c)) && !a.is_empty() { a.to_string() } else { format!("'{}'", a.replace('\'', "'\\''")) }
}

fn even(n: f64) -> u32 {
    (((n / 2.0).round() * 2.0) as i64).max(2) as u32
}

pub struct Geometry {
    pub w: u32,
    pub h: u32,
    pub crop_w: u32,
    pub crop_h: u32,
    pub crop: (u32, u32, u32, u32),
    pub sar: f64,
    pub fps: f64,
}

fn n(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}

pub fn geometry(info: &Value, s: &Value, interp: &Value) -> Geometry {
    let v = &info["video"];
    let (mut w, mut h) = (n(&v["width"]) as u32, n(&v["height"]) as u32);
    let rot = ((v["rotation"].as_i64().unwrap_or(0).abs() + interp["rotation"].as_i64().unwrap_or(0) + s["rotation"].as_i64().unwrap_or(0)) % 360 + 360) % 360;
    if rot == 90 || rot == 270 {
        std::mem::swap(&mut w, &mut h);
    }
    let c = &s["crop"];
    let (cl, ct, cr, cb) = (n(&c["left"]).max(0.0) as u32, n(&c["top"]).max(0.0) as u32, n(&c["right"]).max(0.0) as u32, n(&c["bottom"]).max(0.0) as u32);
    let crop_w = w.saturating_sub(cl + cr).max(16);
    let crop_h = h.saturating_sub(ct + cb).max(16);
    let sar_text = interp["pixelAspect"].as_str().or(v["sar"].as_str()).unwrap_or("1:1");
    let sar = sar_text.split_once(':').and_then(|(a, b)| Some(a.parse::<f64>().ok()? / b.parse::<f64>().ok().filter(|x| *x > 0.0)?)).unwrap_or(1.0);
    let fps = interp["frameRate"].as_f64().or(v["fps"].as_f64()).filter(|x| *x > 0.0).unwrap_or(25.0);
    Geometry { w, h, crop_w, crop_h, crop: (cl, ct, cr, cb), sar, fps }
}

pub fn output_size(s: &Value, g: &Geometry) -> (u32, u32) {
    let v = &s["video"];
    if s["format"] == "mpeg2_dvd" {
        let pal = (v["frameRate"].as_f64().unwrap_or(g.fps) - 25.0).abs() < 0.5;
        return (720, if pal { 576 } else { 480 });
    }
    let display_w = g.crop_w as f64 * g.sar;
    let (wv, hv) = (v["width"].as_f64(), v["height"].as_f64());
    if v["matchSource"].as_bool().unwrap_or(true) || s["scaling"] == "matchWidth" || (wv.is_none() && hv.is_none()) {
        return (even(g.crop_w as f64), even(g.crop_h as f64));
    }
    match (wv, hv) {
        (Some(w), None) => (even(w), even(w * g.crop_h as f64 / display_w.max(1.0))),
        (None, Some(h)) => (even(h * display_w / g.crop_h as f64), even(h)),
        (Some(w), Some(h)) => (even(w), even(h)),
        _ => (even(g.crop_w as f64), even(g.crop_h as f64)),
    }
}

pub fn out_fps(s: &Value, g: &Geometry, info: &Value) -> f64 {
    if let Some(r) = s["video"]["frameRate"].as_f64().filter(|r| *r > 0.0) {
        return r;
    }
    if info["kind"] == "image" {
        return 25.0;
    }
    g.fps
}

pub fn range_of(s: &Value, info: &Value, item_range: &Value) -> Res<(f64, f64)> {
    let total = n(&info["duration"]);
    let r = &s["range"];
    let mode = r["mode"].as_str().unwrap_or("entire");
    let custom = matches!(mode, "custom" | "inout" | "workArea");
    if mode == "entire" && item_range["in"].is_null() && item_range["out"].is_null() {
        return Ok((0.0, total));
    }
    let a = if custom && !r["in"].is_null() { r["in"].as_f64() } else { item_range["in"].as_f64() }.unwrap_or(0.0).max(0.0);
    let mut b = if custom && !r["out"].is_null() { r["out"].as_f64() } else { item_range["out"].as_f64() }.unwrap_or(total);
    if total > 0.0 {
        b = b.min(total);
    }
    if b <= a && total > 0.0 {
        return Err(format!("the source range ends ({b:.3}s) before it starts ({a:.3}s)"));
    }
    Ok((a, b))
}

fn quality_crf(q: f64, lo: f64, hi: f64) -> i64 {
    let q = q.clamp(0.0, 100.0);
    (lo + (hi - lo) * (1.0 - q / 100.0) * 0.62 + (hi - lo) * 0.05).round() as i64
}

fn bits(mbps: f64) -> String {
    format!("{:.0}k", mbps.max(0.05) * 1000.0)
}

pub fn pick_pix_fmt(codec: &str, encoder: &str, s: &Value) -> Option<String> {
    let v = &s["video"];
    let depth = v["bitDepth"].as_i64().unwrap_or(8);
    let alpha = v["alpha"].as_bool().unwrap_or(false) && !s["alphaOnly"].as_bool().unwrap_or(false);
    let chroma = v["chroma"].as_str().unwrap_or("420");
    let flavor = v["flavor"].as_str().unwrap_or("");
    let p = |x: &str| Some(x.to_string());
    match codec {
        "prores" => {
            if encoder == "prores_videotoolbox" {
                return p(if flavor.starts_with("4444") { "p416le" } else { "p210le" });
            }
            if flavor.starts_with("4444") { p(if alpha { "yuva444p10le" } else { "yuv444p10le" }) } else { p("yuv422p10le") }
        }
        "dnxhr" => p(match flavor { "dnxhr_444" => "yuv444p10le", "dnxhr_hqx" | "dnxhd_220x" => "yuv422p10le", _ => "yuv422p" }),
        "cineform" => p(if alpha { "gbrap12le" } else if flavor.starts_with("filmscan") { "gbrp12le" } else { "yuv422p10le" }),
        "xdcam" => p(if flavor == "35" { "yuv420p" } else { "yuv422p" }),
        "mpeg2" => p(if v["profile"] == "422" { "yuv422p" } else { "yuv420p" }),
        "qtrle" => p(if alpha { "argb" } else { "rgb24" }),
        "uncompressed" => p(match flavor { "v210" => "yuv422p10le", "rgb24" => "rgb24", "rgba" => "rgba", _ => "uyvy422" }),
        "ffv1" => p(if alpha { "yuva444p10le" } else { match depth { 8 => "yuv422p", 12 => "yuv422p12le", 16 => "yuv444p16le", _ => "yuv422p10le" } }),
        "png" => p(if depth >= 16 { if alpha { "rgba64be" } else { "rgb48be" } } else if alpha { "rgba" } else { "rgb24" }),
        "tiff" => p(if depth >= 16 { if alpha { "rgba64le" } else { "rgb48le" } } else if alpha { "rgba" } else { "rgb24" }),
        "dpx" => p(if alpha { if depth >= 16 { "rgba64le" } else { "rgba" } } else { match depth { 8 => "rgb24", 12 => "gbrp12le", 16 => "rgb48le", _ => "gbrp10le" } }),
        "exr" => p(if alpha { "gbrapf32le" } else { "gbrpf32le" }),
        "targa" => p(if alpha { "bgra" } else { "bgr24" }),
        "bmp" => p("bgr24"),
        "jpeg" => p("yuvj444p"),
        "mjpeg" => p("yuvj422p"),
        "webp" => p(if alpha { "yuva420p" } else { "yuv420p" }),
        "jpeg2000" => p(match depth { 10 => "yuv422p10le", 12 => "rgb48le", _ => if alpha { "rgba" } else { "rgb24" } }),
        "gif" => None,
        "vp9" | "vp8" => p(if alpha { "yuva420p" } else if depth == 10 && codec == "vp9" { "yuv420p10le" } else { "yuv420p" }),
        "h264" | "hevc" | "av1" => {
            if encoders::is_hardware(encoder) {
                if encoder.ends_with("_vaapi") {
                    return None;
                }
                if depth == 10 {
                    if chroma == "422" && encoders::four_two_two(encoder) {
                        return p("p210le");
                    }
                    return p(encoders::ten_bit(encoder).unwrap_or("p010le"));
                }
                return p(if encoder.ends_with("_videotoolbox") || encoder.ends_with("_mf") { "yuv420p" } else { "nv12" });
            }
            if depth == 10 { p(if chroma == "422" { "yuv422p10le" } else { "yuv420p10le" }) } else { p(if chroma == "422" { "yuv422p" } else { "yuv420p" }) }
        }
        "mpeg4" => p("yuv420p"),
        _ => None,
    }
}

fn sv(list: &[&str]) -> Vec<String> {
    list.iter().map(|x| x.to_string()).collect()
}

fn video_codec_args(codec: &str, encoder: &str, s: &Value, fps: f64, w: u32, h: u32, pass_no: u8, passlog: &str, notes: &mut Vec<String>) -> Vec<String> {
    let v = &s["video"];
    let rc = v["rateControl"].as_str().unwrap_or("vbr1");
    let target = v["targetBitrate"].as_f64().unwrap_or(10.0);
    let peak = v["maxBitrate"].as_f64().unwrap_or(target).max(target);
    let q = v["quality"].as_f64().unwrap_or(75.0);
    let hq = s["maxRenderQuality"].as_bool().unwrap_or(false);
    let hard = encoders::is_hardware(encoder);
    let mut a: Vec<String> = sv(&["-c:v", encoder]);
    let mut push = |x: &[&str]| a.extend(x.iter().map(|y| y.to_string()));
    let (tb, pb, pb2, tb2) = (bits(target), bits(peak), bits(peak * 2.0), bits(target * 2.0));
    match codec {
        "h264" | "hevc" => {
            if encoder == "libx264" || encoder == "libx265" {
                push(&["-preset", if hq { "slow" } else { "medium" }]);
                if rc == "quality" {
                    push(&["-crf", &(quality_crf(q, 0.0, 51.0) + if encoder == "libx265" { 2 } else { 0 }).to_string()]);
                } else if rc == "cbr" {
                    push(&["-b:v", &tb, "-minrate", &tb, "-maxrate", &tb, "-bufsize", &tb2]);
                    if encoder == "libx264" {
                        push(&["-x264-params", "nal-hrd=cbr"]);
                    }
                } else {
                    push(&["-b:v", &tb, "-maxrate", &pb, "-bufsize", &pb2]);
                    if rc == "vbr2" && pass_no > 0 {
                        if encoder == "libx264" {
                            push(&["-pass", &pass_no.to_string(), "-passlogfile", passlog]);
                        } else {
                            push(&["-x265-params", &format!("pass={pass_no}:stats={passlog}.log")]);
                        }
                    }
                }
                let prof = v["profile"].as_str().unwrap_or("");
                if encoder == "libx264" && ["baseline", "main", "high", "high10", "high422"].contains(&prof) {
                    push(&["-profile:v", prof]);
                }
                if encoder == "libx265" && ["main", "main10", "main422-10"].contains(&prof) {
                    push(&["-profile:v", prof]);
                }
            } else if encoder == "libopenh264" {
                push(&["-b:v", &tb, "-maxrate", &pb]);
            } else if encoder.ends_with("_videotoolbox") {
                match rc {
                    "quality" => push(&["-q:v", &(q.clamp(1.0, 100.0) as i64).to_string()]),
                    "cbr" => push(&["-b:v", &tb, "-constant_bit_rate", "1"]),
                    _ => push(&["-b:v", &tb, "-maxrate", &pb, "-bufsize", &pb2]),
                }
                push(&["-allow_sw", "1"]);
                let prof = v["profile"].as_str().unwrap_or("");
                if codec == "h264" && ["baseline", "main", "high"].contains(&prof) {
                    push(&["-profile:v", prof]);
                }
                if codec == "hevc" && v["bitDepth"].as_i64() == Some(10) {
                    push(&["-profile:v", "main10"]);
                }
            } else if encoder.ends_with("_nvenc") {
                push(&["-preset", if hq { "p6" } else { "p4" }]);
                match rc {
                    "quality" => push(&["-rc", "vbr", "-cq", &quality_crf(q, 0.0, 51.0).to_string(), "-b:v", "0"]),
                    "cbr" => push(&["-rc", "cbr", "-b:v", &tb]),
                    _ => {
                        push(&["-rc", "vbr", "-b:v", &tb, "-maxrate", &pb, "-bufsize", &pb2]);
                        if rc == "vbr2" {
                            push(&["-multipass", "fullres"]);
                        }
                    }
                }
            } else if encoder.ends_with("_qsv") {
                if rc == "quality" { push(&["-global_quality", &quality_crf(q, 0.0, 51.0).to_string()]) } else { push(&["-b:v", &tb, "-maxrate", if rc == "cbr" { &tb } else { &pb }]) }
            } else if encoder.ends_with("_amf") {
                match rc {
                    "quality" => {
                        let qp = quality_crf(q, 0.0, 51.0).to_string();
                        push(&["-rc", "cqp", "-qp_i", &qp, "-qp_p", &qp]);
                    }
                    "cbr" => push(&["-rc", "cbr", "-b:v", &tb]),
                    _ => push(&["-rc", "vbr_peak", "-b:v", &tb, "-maxrate", &pb]),
                }
            } else if encoder.ends_with("_vaapi") {
                match rc {
                    "quality" => push(&["-rc_mode", "CQP", "-qp", &quality_crf(q, 0.0, 51.0).to_string()]),
                    "cbr" => push(&["-rc_mode", "CBR", "-b:v", &tb]),
                    _ => push(&["-rc_mode", "VBR", "-b:v", &tb, "-maxrate", &pb]),
                }
            } else if encoder.ends_with("_mf") {
                match rc {
                    "quality" => push(&["-rate_control", "quality", "-quality", &(q as i64).to_string()]),
                    "cbr" => push(&["-rate_control", "cbr", "-b:v", &tb]),
                    _ => push(&["-rate_control", "pc_vbr", "-b:v", &tb]),
                }
            }
            if rc == "vbr2" && hard && !encoder.ends_with("_nvenc") {
                notes.push(format!("{encoder} encodes in one pass; VBR 2 pass asks for software encoding"));
            }
            let level = v["level"].as_str().unwrap_or("auto");
            if level != "auto" && (encoder == "libx264" || encoder == "libx265" || (hard && !encoder.ends_with("_videotoolbox"))) {
                push(&["-level:v", level]);
            }
        }
        "av1" => {
            if encoder == "libsvtav1" {
                push(&["-preset", if hq { "6" } else { "8" }]);
                if rc == "quality" { push(&["-crf", &quality_crf(q, 0.0, 63.0).to_string()]) } else { push(&["-b:v", &tb]) }
            } else if encoder == "libaom-av1" {
                push(&["-cpu-used", "4", "-row-mt", "1"]);
                if rc == "quality" { push(&["-crf", &quality_crf(q, 0.0, 63.0).to_string(), "-b:v", "0"]) } else { push(&["-b:v", &tb]) }
            } else if encoder.ends_with("_nvenc") {
                if rc == "quality" { push(&["-rc", "vbr", "-cq", &quality_crf(q, 0.0, 51.0).to_string(), "-b:v", "0"]) } else { push(&["-rc", "vbr", "-b:v", &tb, "-maxrate", &pb]) }
            } else if rc == "quality" {
                push(&["-global_quality", &quality_crf(q, 0.0, 51.0).to_string()]);
            } else {
                push(&["-b:v", &tb]);
            }
        }
        "vp9" | "vp8" => {
            if encoder.starts_with("libvpx") {
                push(&["-deadline", "good", "-cpu-used", if hq { "1" } else { "3" }, "-row-mt", "1"]);
                match rc {
                    "quality" => push(&["-crf", &quality_crf(q, 4.0, 63.0).to_string(), "-b:v", "0"]),
                    "cbr" => push(&["-b:v", &tb, "-minrate", &tb, "-maxrate", &tb]),
                    _ => {
                        push(&["-b:v", &tb, "-maxrate", &pb]);
                        if rc == "vbr2" && pass_no > 0 {
                            push(&["-pass", &pass_no.to_string(), "-passlogfile", passlog]);
                        }
                    }
                }
                if v["alpha"].as_bool().unwrap_or(false) {
                    push(&["-auto-alt-ref", "0"]);
                }
            } else {
                push(&["-b:v", &tb]);
            }
        }
        "prores" => {
            let flavor = v["flavor"].as_str().unwrap_or("hq");
            if encoder == "prores_videotoolbox" {
                push(&["-profile:v", match flavor { "proxy" => "proxy", "lt" => "lt", "422" => "standard", "4444" => "4444", "4444xq" => "xq", _ => "hq" }]);
            } else {
                let prof = match flavor { "proxy" => "0", "lt" => "1", "422" => "2", "4444" => "4", "4444xq" => "5", _ => "3" };
                push(&["-profile:v", prof, "-vendor", "apl0"]);
                if v["alpha"].as_bool().unwrap_or(false) && flavor.starts_with("4444") && encoder == "prores_ks" {
                    push(&["-alpha_bits", "16"]);
                }
            }
        }
        "dnxhr" => {
            let flavor = v["flavor"].as_str().unwrap_or("dnxhr_hq");
            if flavor.starts_with("dnxhr") {
                push(&["-profile:v", flavor]);
            } else {
                let base = match flavor { "dnxhd_36" => 36, "dnxhd_220" | "dnxhd_220x" => 220, _ => 145 };
                let pal = (fps - 25.0).abs() < 0.1 || (fps - 50.0).abs() < 0.1;
                let rate = if pal { match base { 145 => 120, 220 => 185, x => x } } else { base };
                push(&["-profile:v", "dnxhd", "-b:v", &format!("{rate}M")]);
                if w != 1920 || h != 1080 {
                    notes.push("DNxHD needs a 1920x1080 frame; set the frame size to 1920x1080".into());
                }
            }
        }
        "cineform" => {
            let qv = match v["flavor"].as_str().unwrap_or("high") { "low" => "low", "medium" => "medium", "filmscan1" => "film1", "filmscan2" => "film2", "filmscan3" => "film3+", _ => "high" };
            push(&["-quality", qv]);
        }
        "xdcam" => {
            let rate = if v["flavor"].as_str() == Some("35") { "35M" } else { "50M" };
            push(&["-b:v", rate, "-minrate", rate, "-maxrate", rate, "-bufsize", "17825792", "-rc_init_occupancy", "17825792", "-g", "12", "-bf", "2", "-intra_vlc", "1", "-non_linear_quant", "1", "-qmin", "1", "-qmax", "12", "-dc", "10", "-lmin", "QP2LAMBDA", "-ps", "1", "-sc_threshold", "1000000000"]);
        }
        "mpeg2" => {
            if rc == "cbr" {
                push(&["-b:v", &tb, "-minrate", &tb, "-maxrate", &tb, "-bufsize", &tb]);
            } else {
                push(&["-b:v", &tb, "-maxrate", &pb, "-bufsize", if s["format"] == "mpeg2_dvd" { "1835k" } else { &pb }]);
                if rc == "vbr2" && pass_no > 0 {
                    push(&["-pass", &pass_no.to_string(), "-passlogfile", passlog]);
                }
            }
            if v["profile"] == "422" {
                push(&["-profile:v", "0", "-level:v", "2"]);
            }
        }
        "mpeg4" => {
            if rc == "quality" {
                push(&["-q:v", &((31.0 - q * 0.3).round().clamp(1.0, 31.0) as i64).to_string()]);
            } else {
                push(&["-b:v", &tb, "-maxrate", &pb]);
                if rc == "vbr2" && pass_no > 0 {
                    push(&["-pass", &pass_no.to_string(), "-passlogfile", passlog]);
                }
            }
        }
        "mjpeg" | "jpeg" => push(&["-q:v", &((31.0 - q * 0.29).round().clamp(1.0, 31.0) as i64).to_string()]),
        "jpeg2000" => {
            if encoder == "libopenjpeg" {
                push(&["-compression_level", &(((100.0 - q) / 4.0).round().clamp(0.0, 30.0) as i64).to_string()]);
            } else if q >= 100.0 {
                push(&["-pred", "dwt53"]);
            } else {
                push(&["-q:v", &((31.0 - q * 0.3).round().clamp(1.0, 31.0) as i64).to_string()]);
            }
        }
        "tiff" => push(&["-compression_algo", match v["flavor"].as_str().unwrap_or("lzw") { "none" => "raw", "deflate" => "deflate", "packbits" => "packbits", _ => "lzw" }]),
        "exr" => push(&["-compression", match v["flavor"].as_str().unwrap_or("zip1") { "none" => "0", "rle" => "1", "zip16" => "3", _ => "2" }, "-format", if v["bitDepth"].as_i64() == Some(32) { "2" } else { "1" }]),
        "ffv1" => push(&["-level", "3", "-g", "1", "-slicecrc", "1", "-slices", "16"]),
        "webp" => push(&["-quality", &(q as i64).to_string(), "-loop", "0"]),
        "uncompressed" => {
            if v["flavor"].as_str() == Some("v210") {
                a[1] = "v210".into();
            }
        }
        _ => {}
    }
    if let Some(kd) = v["keyframeDistance"].as_i64() {
        if ["h264", "hevc", "av1", "vp9", "vp8", "mpeg2", "mpeg4"].contains(&codec) {
            a.extend(sv(&["-g", &kd.to_string()]));
        }
    }
    a
}

fn audio_codec_args(s: &Value) -> Res<(Vec<String>, String)> {
    let a = &s["audio"];
    let codec = a["codec"].as_str().unwrap_or("aac");
    let depth = a["bitDepth"].as_i64().unwrap_or(16);
    if codec == "pcm" {
        let big = s["format"] == "aiff";
        let enc = if a["float"].as_bool().unwrap_or(false) && depth == 32 {
            if big { "pcm_f32be".to_string() } else { "pcm_f32le".to_string() }
        } else {
            format!("{}{}", match depth { 24 => "pcm_s24", 32 => "pcm_s32", _ => "pcm_s16" }, if big { "be" } else { "le" })
        };
        return Ok((sv(&["-c:a", &enc]), enc));
    }
    let ac = acodec(codec);
    let family = ac["family"].as_str().unwrap_or(codec);
    let enc = encoders::choose_audio(family).ok_or_else(|| format!("no {} encoder in this ffmpeg; choose another audio codec or point Preferences > FFmpeg at a build that has one", ac["label"].as_str().unwrap_or(codec)))?;
    let mut out = sv(&["-c:a", &enc]);
    if ac.get("lossy").is_some() {
        out.extend(sv(&["-b:a", &format!("{}k", a["bitrate"].as_i64().unwrap_or(192))]));
    }
    if codec == "flac" {
        out.extend(sv(&["-sample_fmt", if depth > 16 { "s32" } else { "s16" }]));
        if depth == 24 {
            out.extend(sv(&["-bits_per_raw_sample", "24"]));
        }
    }
    if codec == "alac" {
        out.extend(sv(&["-sample_fmt", if depth > 16 { "s32p" } else { "s16p" }]));
    }
    if enc == "opus" || enc == "vorbis" {
        out.extend(sv(&["-strict", "-2"]));
    }
    Ok((out, enc))
}

pub fn input_args(src_path: &str, info: &Value, interp: &Value, a: f64, dur: f64, fps_hint: f64) -> Vec<String> {
    let mut args = Vec::new();
    if info["kind"] == "sequence" {
        let seq = &info["sequence"];
        let rate = interp["frameRate"].as_f64().or(info["video"]["fps"].as_f64()).unwrap_or(25.0);
        args.extend(sv(&["-f", "image2", "-framerate", &rate_str(rate), "-start_number", &seq["first"].as_i64().unwrap_or(0).to_string()]));
        if a > 0.0 {
            args.extend(sv(&["-ss", &format!("{a:.6}")]));
        }
        args.extend(sv(&["-i", seq["pattern"].as_str().unwrap_or(src_path)]));
        return args;
    }
    if info["kind"] == "image" {
        return sv(&["-loop", "1", "-framerate", &rate_str(fps_hint), "-t", &format!("{dur:.6}"), "-i", src_path]);
    }
    if a > 0.0 {
        args.extend(sv(&["-ss", &format!("{a:.6}")]));
    }
    args.extend(sv(&["-t", &format!("{dur:.6}"), "-i", src_path]));
    args
}

pub fn measure_loudness(inputs: &[String], afilter: &str) -> Option<Value> {
    let mut args = sv(&["-hide_banner", "-nostats"]);
    args.extend_from_slice(inputs);
    args.extend(sv(&["-filter_complex", afilter, "-map", "[aout]", "-f", "null", "-"]));
    let out = ffmpeg::ff().args(&args).stdin(Stdio::null()).output().ok()?;
    let text = String::from_utf8_lossy(&out.stderr);
    let i = text.rfind('{')?;
    let j = text.rfind('}')?;
    if j < i {
        return None;
    }
    serde_json::from_str(&text[i..=j]).ok()
}

pub fn measure_file(path: &str) -> Value {
    let Ok(out) = ffmpeg::ff().args(["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]).stdin(Stdio::null()).output() else { return json!({}) };
    let text = String::from_utf8_lossy(&out.stderr);
    let summary = text.rfind("Summary:").map(|i| &text[i..]).unwrap_or("");
    let mut m = serde_json::Map::new();
    for (k, pat) in [("integrated", r"I:\s+(-?[\d.]+) LUFS"), ("lra", r"LRA:\s+(-?[\d.]+) LU"), ("truePeak", r"Peak:\s+(-?[\d.]+) dBFS")] {
        if let Some(c) = Regex::new(pat).unwrap().captures(summary) {
            if let Ok(v) = c[1].parse::<f64>() {
                m.insert(k.into(), json!(v));
            }
        }
    }
    Value::Object(m)
}

pub fn tuner_frames(path: &str, start: f64, dur: f64, fps: f64, change: i64, skip: f64) -> Vec<i64> {
    let vf = format!("fps={},scale=160:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", rate_str(fps));
    let Ok(out) = ffmpeg::ff().args(["-hide_banner", "-nostats", "-ss", &format!("{start:.6}"), "-i", path, "-t", &format!("{dur:.6}"), "-map", "0:v:0", "-vf", &vf, "-f", "null", "-"]).stdin(Stdio::null()).output() else { return Vec::new() };
    let text = String::from_utf8_lossy(&out.stdout);
    let values: Vec<f64> = Regex::new(r"YAVG=([\d.]+)").unwrap().captures_iter(&text).filter_map(|c| c[1].parse().ok()).collect();
    if values.is_empty() || change <= 0 {
        return Vec::new();
    }
    let first = ((skip * fps) as usize).max(1);
    let mut ranked: Vec<usize> = (first..values.len()).collect();
    ranked.sort_by(|a, b| values[*a].partial_cmp(&values[*b]).unwrap_or(std::cmp::Ordering::Equal));
    let spacing = (values.len() / change.max(1) as usize / 3).max(2);
    let mut chosen: Vec<usize> = Vec::new();
    for &i in &ranked {
        if chosen.len() as i64 >= change {
            break;
        }
        if chosen.iter().all(|t| (*t as i64 - i as i64).unsigned_abs() as usize >= spacing) {
            chosen.push(i);
        }
    }
    for &i in &ranked {
        if chosen.len() as i64 >= change {
            break;
        }
        if !chosen.contains(&i) {
            chosen.push(i);
        }
    }
    chosen.sort();
    chosen.into_iter().map(|x| x as i64).collect()
}

fn sum_terms(idx: &[i64], f: &str) -> String {
    if idx.is_empty() { "0".into() } else { idx.iter().map(|k| format!("{f}(n,{k})")).collect::<Vec<_>>().join("+") }
}

pub struct BuildOptions<'a> {
    pub preview_at: Option<f64>,
    pub preview_width: Option<u32>,
    pub still_duration: f64,
    pub threads: i64,
    pub measured: &'a Measured,
}

pub fn tuner_factor(s: &Value, dur: f64) -> f64 {
    let t = &s["effects"]["timeTuner"];
    if !t["enabled"].as_bool().unwrap_or(false) || dur <= 0.0 {
        return 1.0;
    }
    let f = if let Some(target) = t["targetDuration"].as_f64() { target / dur } else { 1.0 + t["percent"].as_f64().unwrap_or(0.0) / 100.0 };
    f.clamp(0.9, 1.1)
}

pub fn loudness_targets(s: &Value) -> (f64, f64, f64) {
    let l = &s["effects"]["loudness"];
    let std = l["standard"].as_str().unwrap_or("ebu-r128");
    let stds = loudness_standards();
    let sd = &stds[std];
    let target = sd["target"].as_f64().unwrap_or_else(|| l["target"].as_f64().unwrap_or(-23.0));
    let tp = sd["truePeak"].as_f64().unwrap_or_else(|| l["truePeak"].as_f64().unwrap_or(-1.0));
    (target, tp, l["lra"].as_f64().unwrap_or(11.0))
}

fn write_png(img: &Rgba, path: &Path) -> Res<PathBuf> {
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    fs::write(path, img.png()).map_err(|e| e.to_string())?;
    Ok(path.to_path_buf())
}

fn caption_frame(cues: &[Cue], at: f64, w: u32, h: u32, size: f64, color: &str, bg: f64, top: bool) -> Option<Rgba> {
    let cue = cues.iter().find(|c| c.start <= at && at < c.end)?;
    Some(caption_image(&cue.text, w, h, size, color, bg, top))
}

fn caption_image(text_value: &str, w: u32, h: u32, size: f64, color: &str, bg: f64, top: bool) -> Rgba {
    let mut frame = Rgba::new(w, h);
    let mut sz = size;
    let mut b = text::text_box(text_value, sz, color, 100.0, bg, false);
    while b.w as f64 > w as f64 * 0.94 && sz > 8.0 {
        sz *= 0.9;
        b = text::text_box(text_value, sz, color, 100.0, bg, false);
    }
    let x = ((w as i64 - b.w as i64) / 2).max(0);
    let y = if top { (h as f64 * 0.08) as i64 } else { (h as i64 - b.h as i64 - (h as f64 * 0.08) as i64).max(0) };
    frame.paste(&b, x, y);
    frame
}

fn caption_concat(cues: &[Cue], end: f64, folder: &Path, w: u32, h: u32, size: f64, color: &str, bg: f64, top: bool) -> Res<Option<PathBuf>> {
    fs::create_dir_all(folder).map_err(|e| e.to_string())?;
    let blank = write_png(&Rgba::new(w, h), &folder.join("blank.png"))?;
    let mut entries: Vec<(PathBuf, f64)> = Vec::new();
    let mut cursor = 0.0;
    for (i, c) in cues.iter().filter(|c| c.end > 0.0 && c.start < end).enumerate() {
        let (a, b) = (c.start.max(0.0), c.end.min(end));
        if a > cursor {
            entries.push((blank.clone(), a - cursor));
        }
        let path = write_png(&caption_image(&c.text, w, h, size, color, bg, top), &folder.join(format!("cue_{i:05}.png")))?;
        entries.push((path, b - a));
        cursor = b;
    }
    if entries.is_empty() {
        return Ok(None);
    }
    if end > cursor {
        entries.push((blank, end - cursor));
    }
    let mut lines = vec!["ffconcat version 1.0".to_string()];
    for (p, d) in &entries {
        lines.push(format!("file '{}'", p.to_string_lossy().replace('\\', "/").replace('\'', "'\\''")));
        lines.push(format!("duration {:.4}", d.max(0.001)));
    }
    lines.push(format!("file '{}'", entries.last().unwrap().0.to_string_lossy().replace('\\', "/").replace('\'', "'\\''")));
    let listing = folder.join("captions.ffconcat");
    fs::write(&listing, lines.join("\n") + "\n").map_err(|e| e.to_string())?;
    Ok(Some(listing))
}

pub fn missing_encoder(label: &str) -> String {
    format!("no {label} encoder works in this ffmpeg on this computer. The bundled LGPL ffmpeg encodes H.264 and HEVC only through the GPU's own encoder; choose another codec, or point Preferences > FFmpeg at a build that has one (format.encoders lists what this machine has)")
}

pub fn build(src: &Source, s: &Value, output: &str, work: &Path, opt: &BuildOptions) -> Res<Plan> {
    let info = &src.info;
    let fmt = formats::get(s["format"].as_str().unwrap_or("h264"))?;
    let fmt_id = s["format"].as_str().unwrap_or("h264");
    let mut plan = Plan { output: output.into(), ..Default::default() };
    let _ = fs::create_dir_all(work);
    let fmt_video = !fmt["video"].as_array().map(|a| a.is_empty()).unwrap_or(true);
    let fmt_audio = !fmt["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true);
    let src_has_audio = !info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) || src.audio_path.is_some() || src.stitch.iter().any(|(_, i)| !i["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true));
    let preview = opt.preview_at.is_some();
    let has_video = !info["video"].is_null() && s["exportVideo"].as_bool().unwrap_or(true) && fmt_video;
    let has_audio = src_has_audio && s["exportAudio"].as_bool().unwrap_or(true) && fmt_audio && !preview;
    if formats::is_audio_only(fmt_id) && !src_has_audio {
        return Err(format!("{} has no audio for an audio-only format", info["name"].as_str().unwrap_or(&src.path)));
    }
    if !has_video && !has_audio && !preview {
        return Err("nothing to export: the source has no stream this format can carry, or Export Video and Export Audio are both off".into());
    }
    let mut g = geometry(info, s, &src.interpret);
    let (w, h) = if has_video || preview { output_size(s, &g) } else { (0, 0) };
    let fps = out_fps(s, &g, info);
    let (mut a, mut b) = range_of(s, info, &src.range)?;
    if !src.stitch.is_empty() {
        a = 0.0;
        b = src.stitch.iter().map(|(_, i)| n(&i["duration"])).sum();
    }
    if info["kind"] == "image" && b - a <= 0.0 {
        b = a + opt.still_duration;
    }
    let dur = (b - a).max(0.0);
    plan.in_point = a;
    let eff = &s["effects"];
    let factor = if preview { 1.0 } else { tuner_factor(s, dur) };
    let tuner = &opt.measured.tuner_frames;
    let tuner_mode = if tuner.is_empty() { "" } else if factor < 1.0 { "drop" } else { "add" };
    if (factor - 1.0).abs() > 1e-6 {
        plan.notes.push(format!("Time Tuner: {dur:.3}s to {:.3}s, {} frames {} where the picture changes least", dur * factor, tuner.len(), if factor < 1.0 { "removed" } else { "added" }));
    }
    plan.tuner_factor = factor;
    let out_dur = dur * factor;
    plan.duration = out_dur;
    plan.fps = fps;
    plan.width = w;
    plan.height = h;
    plan.frames = if has_video { ((out_dur * fps).round() as i64).max(1) } else { 0 };
    let mut inputs: Vec<String> = Vec::new();
    let mut graph: Vec<String> = Vec::new();
    let mut n_in: usize;
    let mut vlabel = "[0:v:0]".to_string();
    let mut alabel = "[0:a:0]".to_string();
    let r = rate_str(fps);
    if !src.stitch.is_empty() {
        for (p, i) in &src.stitch {
            inputs.extend(input_args(p, i, &Value::Null, 0.0, n(&i["duration"]).max(0.04), fps));
        }
        n_in = src.stitch.len();
        let mut segs = String::new();
        for (k, (_, i)) in src.stitch.iter().enumerate() {
            let d = n(&i["duration"]).max(0.04);
            if !i["video"].is_null() {
                graph.push(format!("[{k}:v:0]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={r},format=yuv444p[sv{k}]"));
            } else {
                graph.push(format!("color=c=black:s={w}x{h}:r={r}:d={d:.3},format=yuv444p[sv{k}]"));
            }
            if !i["audio"].as_array().map(|x| x.is_empty()).unwrap_or(true) {
                graph.push(format!("[{k}:a:0]aresample=48000,aformat=channel_layouts=stereo:sample_fmts=fltp[sa{k}]"));
            } else {
                graph.push(format!("anullsrc=r=48000:cl=stereo,atrim=0:{d:.3}[sa{k}]"));
            }
            segs.push_str(&format!("[sv{k}][sa{k}]"));
        }
        graph.push(format!("{segs}concat=n={}:v=1:a=1[stv][sta]", src.stitch.len()));
        vlabel = "[stv]".into();
        alabel = "[sta]".into();
        g = Geometry { w, h, crop_w: w, crop_h: h, crop: (0, 0, 0, 0), sar: 1.0, fps };
    } else {
        if let Some(pt) = opt.preview_at {
            let t = a + pt.clamp(0.0, (dur - 1.0 / fps.max(1.0)).max(0.0));
            if info["kind"] == "sequence" {
                let seq = &info["sequence"];
                let rate = src.interpret["frameRate"].as_f64().or(info["video"]["fps"].as_f64()).unwrap_or(25.0);
                inputs.extend(sv(&["-f", "image2", "-framerate", &rate_str(rate), "-start_number", &(seq["first"].as_i64().unwrap_or(0) + (t * rate) as i64).to_string(), "-i", seq["pattern"].as_str().unwrap_or(&src.path)]));
            } else if info["kind"] == "image" {
                inputs.extend(sv(&["-i", &src.path]));
            } else {
                inputs.extend(sv(&["-ss", &format!("{t:.6}"), "-i", &src.path]));
            }
        } else {
            inputs.extend(input_args(&src.path, info, &src.interpret, a, dur, fps));
        }
        n_in = 1;
        if let Some(ap) = &src.audio_path {
            if !preview {
                inputs.extend(sv(&["-ss", &format!("{a:.6}"), "-t", &format!("{dur:.6}"), "-i", ap]));
                alabel = format!("[{n_in}:a:0]");
                n_in += 1;
            }
        }
    }
    let interp = &src.interpret;
    let mut label = vlabel.clone();
    if has_video || preview {
        let mut chain: Vec<String> = Vec::new();
        if src.stitch.is_empty() {
            if let Some(fr) = interp["frameRate"].as_f64() {
                if info["kind"] == "video" {
                    chain.push(format!("setpts=N/({}*TB)", rate_str(fr)));
                }
            }
            if let Some(fo) = interp["fieldOrder"].as_str().filter(|x| *x == "tff" || *x == "bff") {
                chain.push(format!("setfield={fo}"));
            }
            match ((interp["rotation"].as_i64().unwrap_or(0) + s["rotation"].as_i64().unwrap_or(0)) % 360 + 360) % 360 {
                90 => chain.push("transpose=1".into()),
                180 => chain.push("hflip,vflip".into()),
                270 => chain.push("transpose=2".into()),
                _ => {}
            }
            match interp["alpha"].as_str() {
                Some("ignore") => chain.push("format=yuv444p".into()),
                Some("invert") => chain.push("format=rgba,lutrgb=a=negval".into()),
                _ => {}
            }
            let src_field = info["video"]["fieldOrder"].as_str().unwrap_or("progressive");
            if ["tt", "bb", "tb", "bt", "tff", "bff"].contains(&src_field) && s["video"]["fieldOrder"].as_str().unwrap_or("progressive") == "progressive" {
                chain.push(if ffmpeg::has_filter("bwdif") { "bwdif=mode=send_frame".into() } else { "yadif".into() });
            }
            let (cl, ct, cr, cb) = g.crop;
            if cl + ct + cr + cb > 0 {
                chain.push(format!("crop={}:{}:{cl}:{ct}", g.crop_w, g.crop_h));
            }
            let flags = if s["maxRenderQuality"].as_bool().unwrap_or(false) { "lanczos+accurate_rnd+full_chroma_int" } else { "bicubic" };
            let square = s["video"]["pixelAspect"].as_str() == Some("1:1");
            let anamorphic = (g.sar - 1.0).abs() > 0.001 && square;
            if anamorphic {
                chain.push(format!("scale=iw*sar:ih:flags={flags},setsar=1"));
            }
            if (w, h) != (g.crop_w, g.crop_h) || anamorphic {
                chain.push(match s["scaling"].as_str().unwrap_or("fit") {
                    "stretch" => format!("scale={w}:{h}:flags={flags}"),
                    "fill" => format!("scale={w}:{h}:force_original_aspect_ratio=increase:flags={flags},crop={w}:{h}"),
                    "fitBlack" => format!("scale='min({w},iw)':'min({h},ih)':force_original_aspect_ratio=decrease:flags={flags},pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black"),
                    _ => format!("scale={w}:{h}:force_original_aspect_ratio=decrease:flags={flags},pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black"),
                });
            }
            if !preview && info["kind"] != "image" {
                if tuner_mode == "drop" {
                    chain.push(format!("fps={r}"));
                    chain.push(format!("select='not({})',setpts=N/({r}*TB)", sum_terms(tuner, "eq")));
                } else if tuner_mode == "add" {
                    chain.push(format!("fps={r}"));
                    chain.push(format!("setpts=(N+{})/({r}*TB)", sum_terms(tuner, "gte")));
                    chain.push(format!("fps={r}"));
                } else if (fps - g.fps).abs() > 0.001 || interp["frameRate"].is_number() {
                    match s["timeInterpolation"].as_str().unwrap_or("sampling") {
                        "blending" if ffmpeg::has_filter("framerate") => chain.push(format!("framerate=fps={r}")),
                        "opticalFlow" if ffmpeg::has_filter("minterpolate") => chain.push(format!("minterpolate=fps={r}:mi_mode=mci:mc_mode=aobmc:vsbmc=1")),
                        _ => chain.push(format!("fps={r}")),
                    }
                }
            }
            if let Some(px) = s["video"]["pixelAspect"].as_str().filter(|x| *x != "source") {
                chain.push(format!("setsar={}", px.replace(':', "/")));
            }
        }
        let lut_on = eff["lut"]["enabled"].as_bool().unwrap_or(false);
        let sdr_on = eff["sdrConform"]["enabled"].as_bool().unwrap_or(false);
        if s["maxDepth"].as_bool().unwrap_or(false) && (lut_on || sdr_on) {
            chain.push("format=gbrpf32le".into());
        }
        if sdr_on {
            let hdr = info["video"]["hdr"].as_str().unwrap_or("none");
            if hdr == "pq" || hdr == "hlg" {
                let sc = &eff["sdrConform"];
                let lut = colour::sdr_conform_lut(hdr, n(&sc["knee"]).max(1.0), n(&sc["peak"]).max(100.0), n(&sc["brightness"]), n(&sc["contrast"]))?;
                chain.push(format!("scale=in_color_matrix=bt2020:in_range=tv:out_range=pc,format=gbrpf32le,lut3d=file='{}':interp=tetrahedral", colour::esc(&lut)));
            } else {
                plan.notes.push("SDR Conform skipped: the source is not HDR (PQ or HLG)".into());
            }
        }
        if !chain.is_empty() {
            graph.push(format!("{vlabel}{}[vbase]", chain.join(",")));
            label = "[vbase]".into();
        }
        if lut_on {
            let lut = colour::resolve(eff["lut"]["path"].as_str().unwrap_or("")).ok_or_else(|| format!("the LUT {:?} was not found (lut.list shows the installed ones)", eff["lut"]["path"]))?;
            let intensity = n(&eff["lut"]["intensity"]).clamp(0.0, 100.0);
            if intensity >= 99.5 {
                graph.push(format!("{label}lut3d=file='{}':interp=tetrahedral[vlut]", colour::esc(&lut)));
            } else {
                let k = intensity / 100.0;
                graph.push(format!("{label}split[lutA][lutB];[lutB]lut3d=file='{}':interp=tetrahedral[lutC];[lutA][lutC]blend=all_expr='A*(1-{k:.4})+B*{k:.4}'[vlut]", colour::esc(&lut)));
            }
            label = "[vlut]".into();
        }
        let tspace = s["video"]["colorSpace"].as_str().unwrap_or("rec709");
        let sspace = colour::source_space(&info["video"]);
        if let (Some(t), Some(sn)) = (colour::colorspace_name(tspace), colour::colorspace_name(sspace)) {
            if t != sn && !sdr_on && ffmpeg::has_filter("colorspace") {
                graph.push(format!("{label}format=yuv444p10le,colorspace=all={t}:iall={sn}[vcs]"));
                label = "[vcs]".into();
            }
        }
        let lim = &eff["videoLimiter"];
        if lim["enabled"].as_bool().unwrap_or(false) {
            let lo = n(&lim["min"]).max(-7.5) / 100.0;
            let hi = n(&lim["max"]).min(120.0) / 100.0;
            let comp = n(&lim["compression"]).clamp(0.0, 30.0) / 100.0;
            let y = if comp > 0.0 {
                let knee = hi - comp;
                format!("clip(if(gt(val,minval+(maxval-minval)*{knee:.4}),minval+(maxval-minval)*({knee:.4}+{comp:.4}*(1-exp(-(val-(minval+(maxval-minval)*{knee:.4}))/((maxval-minval)*{comp:.4})))),val),minval+(maxval-minval)*{lo:.4},minval+(maxval-minval)*{hi:.4})")
            } else {
                format!("clip(val,minval+(maxval-minval)*{lo:.4},minval+(maxval-minval)*{hi:.4})")
            };
            graph.push(format!("{label}format=yuv444p10le,lutyuv=y='{y}':u='clip(val,minval,maxval)':v='clip(val,minval,maxval)'[vlim]"));
            label = "[vlim]".into();
        }
        let mut k = 0;
        let mut overlay = |inputs: &mut Vec<String>, graph: &mut Vec<String>, label: &mut String, n_in: &mut usize, png: &Path, scale: f64, position: &str, ox: f64, oy: f64, opacity: f64| {
            inputs.extend(sv(&["-loop", "1", "-i", &png.to_string_lossy()]));
            let idx = *n_in;
            *n_in += 1;
            let (x, y) = text::position_expr(position, ox, oy, w, h);
            let sc = if (scale - 1.0).abs() > 0.001 { format!("scale=iw*{scale:.4}:ih*{scale:.4},") } else { String::new() };
            let fade = if opacity < 100.0 { format!(",colorchannelmixer=aa={:.3}", (opacity / 100.0).clamp(0.0, 1.0)) } else { String::new() };
            graph.push(format!("[{idx}:v]{sc}format=rgba{fade}[ov{k}]"));
            graph.push(format!("{label}[ov{k}]overlay=x={x}:y={y}:shortest=1:format=auto[vo{k}]"));
            *label = format!("[vo{k}]");
            k += 1;
        };
        let io = &eff["imageOverlay"];
        if io["enabled"].as_bool().unwrap_or(false) {
            let p = PathBuf::from(crate::paths::expand(io["path"].as_str().unwrap_or("")));
            if !p.is_file() {
                return Err(format!("the overlay image {:?} was not found", io["path"]));
            }
            let size = n(&io["size"]).max(1.0);
            let scale = if io["absolute"].as_bool().unwrap_or(false) { size / 100.0 } else { size / 100.0 * h as f64 / 1080.0 };
            overlay(&mut inputs, &mut graph, &mut label, &mut n_in, &p, scale, io["position"].as_str().unwrap_or("bottomRight"), n(&io["offsetX"]), n(&io["offsetY"]), io["opacity"].as_f64().unwrap_or(100.0));
        }
        let no = &eff["nameOverlay"];
        if no["enabled"].as_bool().unwrap_or(false) {
            let src_name = Path::new(&src.path).file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            let out_name = Path::new(output).file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            let stem = |x: &str| Path::new(x).file_stem().map(|y| y.to_string_lossy().into_owned()).unwrap_or_default();
            let base = match no["source"].as_str().unwrap_or("fileName") {
                "fileNameNoExt" => stem(&src_name),
                "outputName" => out_name.clone(),
                "outputNameNoExt" => stem(&out_name),
                "none" => String::new(),
                _ => src_name.clone(),
            };
            let t = format!("{}{}{}", no["prefix"].as_str().unwrap_or(""), base, no["suffix"].as_str().unwrap_or(""));
            if !t.trim().is_empty() {
                let img = text::text_box(&t, n(&no["size"]).max(6.0) * h as f64 / 1080.0, no["color"].as_str().unwrap_or("#ffffff"), 100.0, n(&no["background"]), false);
                let p = write_png(&img, &work.join("name_overlay.png"))?;
                overlay(&mut inputs, &mut graph, &mut label, &mut n_in, &p, 1.0, no["position"].as_str().unwrap_or("bottomCenter"), n(&no["offsetX"]), n(&no["offsetY"]), no["opacity"].as_f64().unwrap_or(100.0));
            }
        }
        let to = &eff["textOverlay"];
        if to["enabled"].as_bool().unwrap_or(false) && !to["text"].as_str().unwrap_or("").trim().is_empty() {
            let img = text::text_box(to["text"].as_str().unwrap_or(""), n(&to["size"]).max(6.0) * h as f64 / 1080.0, to["color"].as_str().unwrap_or("#ffffff"), 100.0, n(&to["background"]), false);
            let p = write_png(&img, &work.join("text_overlay.png"))?;
            overlay(&mut inputs, &mut graph, &mut label, &mut n_in, &p, 1.0, to["position"].as_str().unwrap_or("topCenter"), n(&to["offsetX"]), n(&to["offsetY"]), to["opacity"].as_f64().unwrap_or(100.0));
        }
        let tc = &eff["timecodeOverlay"];
        if tc["enabled"].as_bool().unwrap_or(false) {
            let tc_fps = tc["frameRate"].as_f64().filter(|x| *x > 0.0).unwrap_or(fps);
            let mut start = if tc["source"] == "generate" {
                text::parse_timecode(tc["start"].as_str().unwrap_or("00:00:00:00"), tc_fps)
            } else {
                let media = info["timecode"].as_str().or(s["startTimecode"].as_str()).unwrap_or("00:00:00:00");
                let secs = text::parse_timecode(media, g.fps) as f64 / g.fps.max(1.0) + a;
                (secs * tc_fps).round() as i64
            };
            start += tc["offsetFrames"].as_i64().unwrap_or(0);
            let writer = Timecode::new(start, plan.frames, tc_fps, n(&tc["size"]).max(6.0) * h as f64 / 1080.0, tc["color"].as_str().unwrap_or("#ffffff"), tc["opacity"].as_f64().unwrap_or(100.0), n(&tc["background"]));
            let (x, y) = text::position_expr(tc["position"].as_str().unwrap_or("bottomLeft"), n(&tc["offsetX"]), n(&tc["offsetY"]), w, h);
            if let Some(pt) = opt.preview_at {
                let p = write_png(&writer.frame((pt * tc_fps).round() as i64), &work.join("timecode_preview.png"))?;
                overlay(&mut inputs, &mut graph, &mut label, &mut n_in, &p, 1.0, tc["position"].as_str().unwrap_or("bottomLeft"), n(&tc["offsetX"]), n(&tc["offsetY"]), 100.0);
            } else {
                inputs.extend(writer.input_args());
                let idx = n_in;
                n_in += 1;
                graph.push(format!("{label}[{idx}:v]overlay=x={x}:y={y}:eof_action=repeat:format=auto[vtc]"));
                label = "[vtc]".into();
                plan.timecode = Some(writer);
            }
        }
        let cap = &s["captions"];
        let mut cues: Vec<Cue> = Vec::new();
        if cap["mode"].as_str().unwrap_or("none") != "none" {
            let (raw, _) = captions::resolve(&src.path, info, cap["source"].as_str())?;
            cues = captions::shift(&raw, a, Some(b), factor);
            if cues.is_empty() {
                plan.notes.push("captions: no caption file or caption stream was found for this source".into());
            }
        }
        let csize = n(&cap["size"]).max(8.0) * h as f64 / 1080.0;
        let ccolor = cap["color"].as_str().unwrap_or("#ffffff").to_string();
        let cbg = cap["background"].as_f64().unwrap_or(60.0);
        let ctop = cap["position"] == "top";
        if cap["mode"] == "burnin" && !cues.is_empty() {
            if let Some(pt) = opt.preview_at {
                if let Some(img) = caption_frame(&cues, pt, w, h, csize, &ccolor, cbg, ctop) {
                    let p = write_png(&img, &work.join("caption_preview.png"))?;
                    overlay(&mut inputs, &mut graph, &mut label, &mut n_in, &p, 1.0, "topLeft", -text::margin(w, h), -text::margin(w, h), 100.0);
                }
            } else if let Some(listing) = caption_concat(&cues, out_dur, &work.join("captions"), w, h, csize, &ccolor, cbg, ctop)? {
                inputs.extend(sv(&["-f", "concat", "-safe", "0", "-i", &listing.to_string_lossy()]));
                let idx = n_in;
                n_in += 1;
                graph.push(format!("[{idx}:v]format=rgba,setpts=PTS-STARTPTS[capv]"));
                graph.push(format!("{label}[capv]overlay=0:0:eof_action=pass:format=auto[vcap]"));
                label = "[vcap]".into();
            }
        }
        if s["alphaOnly"].as_bool().unwrap_or(false) {
            graph.push(format!("{label}format=rgba,alphaextract[valpha]"));
            label = "[valpha]".into();
        }
        if !preview && cap["mode"] == "sidecar" && !cues.is_empty() {
            let f = cap["format"].as_str().unwrap_or("srt");
            plan.sidecars.push((sidecar_path(output, captions::sidecar_ext(f)), captions::write(&cues, f, cap["language"].as_str().unwrap_or("en"))));
        }
        if !preview && cap["mode"] == "embed" && !cues.is_empty() {
            let container = s["multiplexer"]["container"].as_str().unwrap_or("");
            if ["mp4", "mov", "mkv", "webm"].contains(&container) {
                let ext = if container == "webm" { "vtt" } else { "srt" };
                let sub = work.join(format!("embed.{ext}"));
                fs::write(&sub, captions::write(&cues, ext, "en")).map_err(|e| e.to_string())?;
                inputs.extend(sv(&["-i", &sub.to_string_lossy()]));
                plan.sidecars.push(("embed".into(), format!("{n_in}|{}", match container { "mkv" => "srt", "webm" => "webvtt", _ => "mov_text" })));
            } else {
                plan.notes.push(format!("captions cannot be embedded in {}; a sidecar file was written instead", if container.is_empty() { fmt_id } else { container }));
                let f = cap["format"].as_str().unwrap_or("srt");
                plan.sidecars.push((sidecar_path(output, captions::sidecar_ext(f)), captions::write(&cues, f, cap["language"].as_str().unwrap_or("en"))));
            }
        }
    }
    if preview {
        let pw = opt.preview_width.unwrap_or(w);
        let tail = if pw != w { format!("scale={pw}:-2") } else { "null".into() };
        graph.push(format!("{label}{tail},format=rgb24[vout]"));
        let mut cmd = sv(&[&ffmpeg::ffmpeg(), "-hide_banner", "-v", "error"]);
        cmd.extend(inputs);
        cmd.extend(sv(&["-filter_complex", &graph.join(";"), "-map", "[vout]", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"]));
        plan.passes = vec![cmd];
        return Ok(plan);
    }
    let vcodec_id = s["video"]["codec"].as_str().unwrap_or("").to_string();
    let mut hw_pre: Vec<String> = Vec::new();
    let mut encoder = String::new();
    if has_video {
        let vc = vcodec(&vcodec_id);
        if vcodec_id == "gif" {
            encoder = "gif".into();
        } else {
            let family = vc["family"].as_str().unwrap_or("");
            let hwpref = s["video"]["hardware"].as_str().unwrap_or("auto");
            let mut chosen = s["video"]["encoder"].as_str().filter(|e| !e.is_empty()).map(String::from).or_else(|| encoders::choose(family, hwpref));
            if s["video"]["rateControl"] == "vbr2" && hwpref != "on" {
                if let Some(c) = &chosen {
                    if encoders::is_hardware(c) && !c.ends_with("_nvenc") {
                        if let Some(soft) = encoders::choose(family, "off") {
                            chosen = Some(soft);
                        }
                    }
                }
            }
            encoder = chosen.ok_or_else(|| missing_encoder(vc["label"].as_str().unwrap_or(&vcodec_id)))?;
        }
        plan.encoder = Some(encoder.clone());
        let (pre, upload) = if encoders::is_hardware(&encoder) { encoders::hardware_io(&encoder) } else { (vec![], None) };
        hw_pre = pre;
        if vcodec_id == "gif" {
            let dither = s["video"]["dither"].as_str().unwrap_or("sierra2_4a");
            graph.push(format!("{label}split[g1][g2];[g1]palettegen=stats_mode=diff[gp];[g2][gp]paletteuse=dither={dither}[vout]"));
        } else {
            let mut tail: Vec<String> = Vec::new();
            if let Some(px) = pick_pix_fmt(&vcodec_id, &encoder, s) {
                tail.push(format!("format={px}"));
            }
            if let Some(u) = upload {
                tail.push(u);
            }
            graph.push(format!("{label}{}[vout]", if tail.is_empty() { "null".to_string() } else { tail.join(",") }));
        }
    }
    let mut audio_maps: Vec<String> = Vec::new();
    let mut a_out_args: Vec<String> = Vec::new();
    if has_audio {
        let ach = s["audio"]["channels"].as_str().unwrap_or("stereo");
        let mut rate = s["audio"]["sampleRate"].as_i64();
        let src_audio = info["audio"].as_array().map(|x| x.len()).unwrap_or(0);
        let mut chain: Vec<String> = Vec::new();
        if (factor - 1.0).abs() > 1e-6 {
            chain.push(format!("atempo={:.6}", 1.0 / factor));
        }
        let layout = match ach { "mono" => Some("mono"), "stereo" => Some("stereo"), "5.1" => Some("5.1"), "7.1" => Some("7.1"), _ => None };
        if let Some(l) = layout {
            chain.push(format!("aformat=channel_layouts={l}"));
        }
        let loud = &eff["loudness"];
        if loud["enabled"].as_bool().unwrap_or(false) {
            let (target, tp, lra) = loudness_targets(s);
            if let Some(m) = &opt.measured.loudness {
                chain.push(format!("loudnorm=I={target}:TP={tp}:LRA={lra}:measured_I={}:measured_TP={}:measured_LRA={}:measured_thresh={}:offset={}:linear=true", m["input_i"].as_str().unwrap_or("-23"), m["input_tp"].as_str().unwrap_or("-1"), m["input_lra"].as_str().unwrap_or("7"), m["input_thresh"].as_str().unwrap_or("-33"), m["target_offset"].as_str().unwrap_or("0")));
            } else {
                chain.push(format!("loudnorm=I={target}:TP={tp}:LRA={lra}"));
            }
            let lim = &loud["limiter"];
            if lim["enabled"].as_bool().unwrap_or(false) {
                chain.push(format!("alimiter=limit={:.4}:attack={:.2}:release={:.1}:level=disabled", 10f64.powf(tp / 20.0), lim["lookahead"].as_f64().unwrap_or(5.0), lim["release"].as_f64().unwrap_or(50.0)));
            }
            plan.loudness = Some(json!({"standard": loud["standard"], "target": target, "truePeak": tp, "measured": opt.measured.loudness, "report": loud["report"].as_bool().unwrap_or(true), "reportFolder": loud["reportFolder"]}));
            if rate.is_none() {
                rate = Some(48000);
            }
        }
        if let Some(rv) = rate {
            chain.push(format!("aresample={rv}"));
        }
        let plain = src.stitch.is_empty() && src.audio_path.is_none();
        if ach == "tracks" && src_audio > 1 && plain {
            for i in 0..src_audio {
                audio_maps.extend(sv(&["-map", &format!("0:a:{i}")]));
            }
        } else if ach == "discrete" && src_audio > 1 && plain {
            let ins: String = (0..src_audio).map(|i| format!("[0:a:{i}]")).collect();
            graph.push(format!("{ins}amerge=inputs={src_audio}{}[aout]", if chain.is_empty() { String::new() } else { format!(",{}", chain.join(",")) }));
            audio_maps.extend(sv(&["-map", "[aout]"]));
        } else {
            graph.push(format!("{alabel}{}[aout]", if chain.is_empty() { "anull".to_string() } else { chain.join(",") }));
            audio_maps.extend(sv(&["-map", "[aout]"]));
        }
        let (args, enc) = audio_codec_args(s)?;
        a_out_args = args;
        plan.audio_encoder = Some(enc);
    }
    if !src.stitch.is_empty() && !has_audio {
        graph.push("[sta]anullsink".into());
    }
    if !src.stitch.is_empty() && !has_video {
        graph.push("[stv]nullsink".into());
    }
    let container = s["multiplexer"]["container"].as_str().unwrap_or("").to_string();
    let mut common: Vec<String> = Vec::new();
    let meta = &s["metadata"];
    if meta["mode"] == "clear" {
        common.extend(sv(&["-map_metadata", "-1"]));
    } else if src.stitch.is_empty() {
        common.extend(sv(&["-map_metadata", "0"]));
    }
    if let Some(fields) = meta["fields"].as_object() {
        for (k, v) in fields {
            let val = match v { Value::String(x) => x.clone(), Value::Null => String::new(), other => other.to_string() };
            if !val.is_empty() {
                common.extend(sv(&["-metadata", &format!("{k}={val}")]));
            }
        }
    }
    common.extend(sv(&["-metadata", "encoder=formencoder"]));
    let image = formats::is_image(fmt_id);
    if has_video && !image {
        if let Some(tcs) = s["startTimecode"].as_str().filter(|x| !x.is_empty()) {
            if ["mov", "mp4", "mxf", ""].contains(&container.as_str()) {
                common.extend(sv(&["-timecode", &text::format_timecode(text::parse_timecode(tcs, fps), fps)]));
            }
        } else if let Some(tcs) = info["timecode"].as_str() {
            if container == "mov" || container == "mxf" {
                let secs = text::parse_timecode(tcs, g.fps) as f64 / g.fps.max(1.0) + a;
                common.extend(sv(&["-timecode", &text::format_timecode((secs * fps).round() as i64, fps)]));
            }
        }
    }
    if has_video {
        common.extend(colour::tag_args(s["video"]["colorSpace"].as_str().unwrap_or("rec709"), &info["video"]));
        let fo = s["video"]["fieldOrder"].as_str().unwrap_or("progressive");
        if (fo == "tff" || fo == "bff") && ["h264", "hevc", "mpeg2", "xdcam", "prores", "dnxhr"].contains(&vcodec_id.as_str()) {
            common.extend(sv(&["-flags", "+ildct+ilme", "-top", if fo == "tff" { "1" } else { "0" }, "-field_order", if fo == "tff" { "tt" } else { "bb" }]));
        }
        if s["video"]["hdr10"].as_bool().unwrap_or(false) {
            if vcodec_id == "hevc" && s["video"]["colorSpace"] == "rec2100pq" && encoder == "libx265" {
                let cll = format!("{},{}", s["video"]["maxCLL"].as_i64().unwrap_or(1000), s["video"]["maxFALL"].as_i64().unwrap_or(400));
                common.extend(sv(&["-x265-params", &format!("hdr10=1:repeat-headers=1:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll={cll}")]));
            } else {
                plan.notes.push(format!("HDR10 mastering metadata is written by libx265; {encoder} gets the PQ and Rec. 2020 tags only"));
            }
        }
    }
    let mut mux: Vec<String> = Vec::new();
    if (container == "mp4" || container == "mov") && s["multiplexer"]["fastStart"].as_bool().unwrap_or(true) {
        mux.extend(sv(&["-movflags", "+faststart"]));
    }
    if (container == "mp4" || container == "mov") && vcodec_id == "hevc" && has_video {
        mux.extend(sv(&["-tag:v", "hvc1"]));
    }
    if fmt_id == "bwf" {
        mux.extend(sv(&["-write_bext", "1", "-rf64", "auto"]));
    }
    if fmt_id == "wav" {
        mux.extend(sv(&["-rf64", "auto"]));
    }
    if fmt_id == "gif" {
        mux.extend(sv(&["-loop", if s["video"]["loop"].as_bool().unwrap_or(true) { "0" } else { "-1" }]));
    }
    if fmt_id == "mpeg2_dvd" {
        mux.extend(sv(&["-f", "dvd"]));
    } else if !image {
        if let Some(m) = formats::muxer(&container) {
            mux.extend(sv(&["-f", m]));
        }
    }
    let mut sub_maps: Vec<String> = Vec::new();
    plan.sidecars.retain(|(p, v)| {
        if p == "embed" {
            if let Some((idx, codec)) = v.split_once('|') {
                sub_maps.extend(sv(&["-map", &format!("{idx}:s:0"), "-c:s", codec, "-metadata:s:s:0", "language=eng"]));
            }
            false
        } else {
            true
        }
    });
    let mut image_args: Vec<String> = Vec::new();
    if image {
        if s["video"]["sequence"].as_bool().unwrap_or(false) {
            image_args.extend(sv(&["-start_number", &s["video"]["startNumber"].as_i64().unwrap_or(0).to_string(), "-f", "image2"]));
        } else {
            image_args.extend(sv(&["-frames:v", "1", "-update", "1", "-f", "image2"]));
        }
    }
    let threads = if opt.threads > 0 { sv(&["-threads", &opt.threads.to_string()]) } else { vec![] };
    let mut base = sv(&[&ffmpeg::ffmpeg(), "-hide_banner"]);
    if plan.timecode.is_none() {
        base.push("-nostdin".into());
    }
    base.extend(sv(&["-y", "-progress", "pipe:1", "-nostats", "-loglevel", "warning"]));
    base.extend(hw_pre);
    base.extend(inputs.clone());
    let fc = if graph.is_empty() { vec![] } else { sv(&["-filter_complex", &graph.join(";")]) };
    let passlog = work.join("pass").to_string_lossy().into_owned();
    let maps_v = if has_video { sv(&["-map", "[vout]"]) } else { vec![] };
    let two = has_video && s["video"]["rateControl"] == "vbr2" && ["libx264", "libx265", "libvpx-vp9", "libvpx", "mpeg2video", "mpeg4"].contains(&encoder.as_str());
    let mut notes = Vec::new();
    let vargs1 = if has_video { video_codec_args(&vcodec_id, &encoder, s, fps, w, h, if two { 1 } else { 0 }, &passlog, &mut notes) } else { vec![] };
    plan.notes.extend(notes);
    let mut rate_args = if has_video && !image && fmt_id != "gif" { sv(&["-r", &r]) } else { vec![] };
    if fmt_id == "mpeg2_dvd" && has_video {
        rate_args.extend(sv(&["-target", if (fps - 25.0).abs() < 0.5 { "pal-dvd" } else { "ntsc-dvd" }]));
    }
    let mut elementary_audio = None;
    if container == "none" && has_audio && has_video {
        let ext = match s["audio"]["codec"].as_str().unwrap_or("aac") { "ac3" => "ac3", "eac3" => "eac3", "mp3" => "mp3", _ => "aac" };
        let p = Path::new(output).with_extension(ext).to_string_lossy().into_owned();
        plan.extra_outputs.push(p.clone());
        elementary_audio = Some(p);
    }
    let vargs = if two {
        let mut p1 = base.clone();
        p1.extend(fc.clone());
        p1.extend(maps_v.clone());
        p1.extend(vargs1.clone());
        p1.extend(rate_args.clone());
        p1.extend(audio_maps.clone());
        if !audio_maps.is_empty() {
            p1.extend(sv(&["-c:a", "pcm_s16le"]));
        }
        p1.extend(sv(&["-f", "null", "-"]));
        plan.passes.push(p1);
        let mut ignore = Vec::new();
        video_codec_args(&vcodec_id, &encoder, s, fps, w, h, 2, &passlog, &mut ignore)
    } else {
        vargs1
    };
    let mut fin = base;
    fin.extend(fc);
    fin.extend(maps_v);
    fin.extend(vargs);
    fin.extend(rate_args);
    if container == "none" && has_video {
        let raw = match vcodec_id.as_str() { "h264" => "h264", "hevc" => "hevc", "mpeg2" => "mpeg2video", "av1" => "obu", _ => "rawvideo" };
        fin.extend(common);
        fin.extend(sv(&["-f", raw, output]));
        if let Some(ea) = elementary_audio {
            fin.extend(audio_maps);
            fin.extend(a_out_args);
            fin.push(ea);
        }
    } else {
        fin.extend(audio_maps);
        fin.extend(a_out_args);
        fin.extend(sub_maps);
        fin.extend(threads);
        fin.extend(common);
        fin.extend(mux);
        fin.extend(image_args);
        fin.push(output.into());
    }
    plan.passes.push(fin);
    Ok(plan)
}

pub fn loudness_measure_inputs(src: &Source, s: &Value) -> Option<(Vec<String>, String)> {
    if !src.stitch.is_empty() {
        return None;
    }
    let info = &src.info;
    let (a, b) = range_of(s, info, &src.range).ok()?;
    let dur = (b - a).max(0.0);
    let factor = tuner_factor(s, dur);
    let g = geometry(info, s, &src.interpret);
    let fps = out_fps(s, &g, info);
    let mut inputs = input_args(&src.path, info, &src.interpret, a, dur, fps);
    let mut alabel = "[0:a:0]".to_string();
    if let Some(ap) = &src.audio_path {
        inputs.extend(sv(&["-ss", &format!("{a:.6}"), "-t", &format!("{dur:.6}"), "-i", ap]));
        alabel = "[1:a:0]".into();
    }
    let mut chain = Vec::new();
    if (factor - 1.0).abs() > 1e-6 {
        chain.push(format!("atempo={:.6}", 1.0 / factor));
    }
    if let Some(l) = match s["audio"]["channels"].as_str().unwrap_or("stereo") { "mono" => Some("mono"), "stereo" => Some("stereo"), "5.1" => Some("5.1"), "7.1" => Some("7.1"), _ => None } {
        chain.push(format!("aformat=channel_layouts={l}"));
    }
    let (target, tp, lra) = loudness_targets(s);
    chain.push(format!("loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json"));
    Some((inputs, format!("{alabel}{}[aout]", chain.join(","))))
}

pub fn sidecar_path(output: &str, ext: &str) -> String {
    let clean = output.replace("_%06d", "");
    Path::new(&clean).with_extension(ext).to_string_lossy().into_owned()
}

pub fn estimate(s: &Value, info: &Value, item_range: &Value) -> Value {
    let v = &s["video"];
    let g = geometry(info, s, &Value::Null);
    let (a, b) = range_of(s, info, item_range).unwrap_or((0.0, n(&info["duration"])));
    let mut dur = (b - a).max(0.0);
    if dur <= 0.0 && info["kind"] == "image" {
        dur = 5.0;
    }
    let (w, h) = if info["video"].is_null() { (0, 0) } else { output_size(s, &g) };
    let fps = out_fps(s, &g, info);
    let codec = v["codec"].as_str().unwrap_or("");
    let mut kv = 0.0;
    if s["exportVideo"].as_bool().unwrap_or(false) && !info["video"].is_null() {
        match v["rateControl"].as_str().unwrap_or("") {
            "cbr" | "vbr1" | "vbr2" => kv = n(&v["targetBitrate"]) * 1000.0,
            _ => {
                let px = (w as f64 * h as f64 * fps).max(1.0);
                let flavor = v["flavor"].as_str().unwrap_or("");
                let bpp = match codec {
                    "prores" => match flavor { "proxy" => 0.75, "lt" => 1.7, "422" => 2.45, "4444" => 5.5, "4444xq" => 8.3, _ => 3.7 },
                    "dnxhr" => match flavor { "dnxhr_lb" => 0.73, "dnxhr_sq" => 2.3, "dnxhr_444" => 7.0, _ => 3.5 },
                    "cineform" => 2.2,
                    "uncompressed" => 20.0,
                    "qtrle" => 6.0,
                    "ffv1" => 7.0,
                    "png" => 9.0,
                    "tiff" => 12.0,
                    "dpx" => 30.0,
                    "exr" => 24.0,
                    "targa" | "bmp" => 24.0,
                    "jpeg" => 1.2,
                    "mjpeg" => 1.6,
                    "jpeg2000" => 2.5,
                    "webp" => 0.6,
                    "gif" => 0.9,
                    "h264" | "hevc" | "av1" | "vp9" | "vp8" | "mpeg4" => {
                        let base = match codec { "h264" => 0.11, "hevc" => 0.075, "av1" => 0.08, "vp9" => 0.1, "vp8" => 0.13, _ => 0.18 };
                        base * (0.4 + n(&v["quality"]) / 60.0)
                    }
                    _ => 0.0,
                };
                kv = px * bpp / 1000.0;
                if codec == "xdcam" {
                    kv = if flavor == "35" { 35000.0 } else { 50000.0 };
                }
                if formats::is_image(s["format"].as_str().unwrap_or("")) && !v["sequence"].as_bool().unwrap_or(false) {
                    dur = 1.0 / fps.max(1.0);
                }
            }
        }
    }
    let mut ka = 0.0;
    if s["exportAudio"].as_bool().unwrap_or(false) && !info["audio"].as_array().map(|x| x.is_empty()).unwrap_or(true) {
        if let Some(ac_id) = s["audio"]["codec"].as_str() {
            let ac = acodec(ac_id);
            let ch = match s["audio"]["channels"].as_str().unwrap_or("stereo") { "mono" => 1.0, "stereo" => 2.0, "5.1" => 6.0, "7.1" => 8.0, _ => n(&info["audio"][0]["channels"]).max(2.0) };
            let rate = s["audio"]["sampleRate"].as_f64().unwrap_or_else(|| n(&info["audio"][0]["sampleRate"]).max(48000.0));
            ka = if ac.get("lossy").is_some() { n(&s["audio"]["bitrate"]).max(64.0) } else { rate * ch * n(&s["audio"]["bitDepth"]).max(16.0) / 1000.0 * if ac_id == "flac" || ac_id == "alac" { 0.6 } else { 1.0 } };
        }
    }
    let bytes = (kv + ka) * 1000.0 / 8.0 * dur;
    json!({"bytes": bytes as i64, "videoKbps": kv.round(), "audioKbps": ka.round(), "seconds": (dur * 1000.0).round() / 1000.0, "width": w, "height": h, "fps": fps})
}

pub fn cap_bitrate(s: &mut Value, info: &Value, max_mb: f64, item_range: &Value) {
    let est = estimate(s, info, item_range);
    let secs = n(&est["seconds"]);
    if secs <= 0.0 {
        return;
    }
    let budget = max_mb * 8.0 * 1000.0 / secs - n(&est["audioKbps"]);
    let rc = s["video"]["rateControl"].as_str().unwrap_or("").to_string();
    if ["vbr1", "vbr2", "cbr"].contains(&rc.as_str()) && budget > 0.0 {
        let cap = budget / 1000.0 * 0.97;
        if n(&s["video"]["targetBitrate"]) > cap {
            s["video"]["targetBitrate"] = json!((cap * 1000.0).round() / 1000.0);
            let peak = n(&s["video"]["maxBitrate"]).min(cap * 1.2);
            s["video"]["maxBitrate"] = json!((peak.max(cap) * 1000.0).round() / 1000.0);
        }
    }
}

pub fn unique_path(path: &str) -> String {
    let p = Path::new(path);
    if path.contains("%0") || !p.exists() {
        return path.to_string();
    }
    let stem = p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default();
    for i in 1..10000 {
        let cand = p.with_file_name(format!("{stem}_{i}{ext}"));
        if !cand.exists() {
            return cand.to_string_lossy().into_owned();
        }
    }
    path.to_string()
}
