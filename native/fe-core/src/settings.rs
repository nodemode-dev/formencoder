use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;
use serde_json::{Value, json};

use crate::formats::{self, acodec, strs, vcodec};
use crate::util::{Res, deep_merge, file_safe, fmt_g, local_stamp, set_path};

pub fn effects_default() -> Value {
    json!({
        "lut": {"enabled": false, "path": "", "intensity": 100},
        "sdrConform": {"enabled": false, "brightness": 0, "contrast": 0, "knee": 75, "peak": 1000},
        "imageOverlay": {"enabled": false, "path": "", "position": "bottomRight", "offsetX": 0, "offsetY": 0, "size": 100, "absolute": false, "opacity": 100},
        "nameOverlay": {"enabled": false, "prefix": "", "suffix": "", "source": "fileName", "position": "bottomCenter", "offsetX": 0, "offsetY": 0, "size": 32, "opacity": 100, "color": "#ffffff", "background": 50},
        "textOverlay": {"enabled": false, "text": "", "position": "topCenter", "offsetX": 0, "offsetY": 0, "size": 32, "opacity": 100, "color": "#ffffff", "background": 0},
        "timecodeOverlay": {"enabled": false, "position": "bottomLeft", "offsetX": 0, "offsetY": 0, "size": 32, "opacity": 100, "color": "#ffffff", "background": 50, "source": "media", "start": "00:00:00:00", "offsetFrames": 0, "frameRate": null},
        "timeTuner": {"enabled": false, "targetDuration": null, "percent": 0.0, "skipSlates": 0.0},
        "videoLimiter": {"enabled": false, "min": 0.0, "max": 100.0, "compression": 0.0},
        "loudness": {"enabled": false, "standard": "ebu-r128", "target": -23.0, "tolerance": 1.0, "truePeak": -1.0, "lra": 11.0, "mode": "twopass", "report": true, "reportFolder": "", "limiter": {"enabled": false, "lookahead": 5.0, "release": 50.0}}
    })
}

pub fn loudness_standards() -> Value {
    json!({
        "ebu-r128": {"label": "EBU R128", "target": -23.0, "truePeak": -1.0},
        "atsc-a85": {"label": "ATSC A/85", "target": -24.0, "truePeak": -2.0},
        "itu-bs1770": {"label": "ITU BS.1770-3 (custom target)", "target": null, "truePeak": null},
        "arib-tr-b32": {"label": "ARIB TR-B32", "target": -24.0, "truePeak": -1.0},
        "op59": {"label": "OP-59 (Australia)", "target": -24.0, "truePeak": -2.0},
        "streaming": {"label": "Streaming (-14 LUFS)", "target": -14.0, "truePeak": -1.0},
        "podcast": {"label": "Podcast (-16 LUFS)", "target": -16.0, "truePeak": -1.0},
        "custom": {"label": "Custom", "target": null, "truePeak": null}
    })
}

pub const POSITIONS: &[&str] = &["topLeft", "topCenter", "topRight", "centerLeft", "center", "centerRight", "bottomLeft", "bottomCenter", "bottomRight"];

fn default_flavor(codec: &str) -> Value {
    let pick = match codec {
        "prores" => "hq",
        "dnxhr" => "dnxhr_hq",
        "cineform" => "high",
        "xdcam" => "50",
        "uncompressed" => "v210",
        "tiff" => "lzw",
        "exr" => "zip1",
        _ => return vcodec(codec).get("flavors").and_then(|f| f.get(0)).and_then(|x| x.get(0)).cloned().unwrap_or(Value::Null),
    };
    json!(pick)
}

pub fn default(fmt: &str) -> Res {
    let f = formats::get(fmt)?;
    let vlist = strs(&f["video"]);
    let alist = strs(&f["audio"]);
    let vc_id = vlist.first().cloned().unwrap_or_default();
    let ac_id = alist.first().cloned().unwrap_or_default();
    let vc = vcodec(&vc_id);
    let rate = vc["rate"].get(0).cloned().unwrap_or(json!("vbr1"));
    let profile = if vc_id == "h264" { json!("high") } else { vc.get("profiles").and_then(|p| p.get(0)).cloned().unwrap_or(Value::Null) };
    let bit_depth = vc["bitDepths"].get(0).cloned().unwrap_or(json!(8));
    let abitrate = match ac_id.as_str() {
        "aac" | "mp3" | "opus" | "vorbis" => 320,
        "ac3" | "eac3" => 448,
        _ => 256,
    };
    let adepth = if ["pcm", "flac", "alac"].contains(&ac_id.as_str()) { 24 } else { 16 };
    Ok(json!({
        "format": fmt, "preset": null, "presetName": "Custom", "comments": "", "outputName": "{source}",
        "exportVideo": !vlist.is_empty(), "exportAudio": !alist.is_empty() && f.get("noAudio").is_none(),
        "video": {"codec": if vc_id.is_empty() { Value::Null } else { json!(vc_id) }, "flavor": default_flavor(&vc_id), "matchSource": true, "width": null, "height": null, "frameRate": null,
                  "fieldOrder": "progressive", "pixelAspect": "1:1", "profile": profile, "level": "auto", "bitDepth": bit_depth, "chroma": "420", "rateControl": rate,
                  "targetBitrate": 10.0, "maxBitrate": 12.0, "quality": 75, "keyframeDistance": null, "hardware": "auto", "encoder": null, "colorSpace": "rec709",
                  "hdr10": false, "maxCLL": 1000, "maxFALL": 400, "alpha": false, "sequence": false, "startNumber": 0, "loop": true, "dither": "sierra2_4a",
                  "vr": {"enabled": false, "layout": "mono", "hfov": 360, "vfov": 180}},
        "audio": {"codec": if ac_id.is_empty() { Value::Null } else { json!(ac_id) }, "sampleRate": 48000, "channels": "stereo", "bitrate": abitrate, "bitDepth": adepth, "float": false, "routing": []},
        "multiplexer": {"container": f["containers"].get(0).cloned().unwrap_or(Value::Null), "fastStart": true},
        "range": {"mode": "entire", "in": null, "out": null},
        "crop": {"left": 0, "top": 0, "right": 0, "bottom": 0, "proportion": "none", "anchorX": 0.5, "anchorY": 0.5},
        "rotation": 0, "scaling": "fit", "timeInterpolation": "sampling", "maxRenderQuality": false, "maxDepth": false,
        "startTimecode": null, "alphaOnly": false, "maxFileSize": null,
        "effects": effects_default(),
        "captions": {"mode": "none", "source": "auto", "format": "srt", "language": "eng", "size": 36, "color": "#ffffff", "background": 60, "position": "bottom"},
        "metadata": {"mode": "retain", "template": null, "rules": {"keep": [], "drop": []}, "fields": {}, "xmpSidecar": false},
        "publish": []
    }))
}

fn contains(list: &Value, v: &Value) -> bool {
    list.as_array().map(|a| a.contains(v)).unwrap_or(false)
}

fn flavor_ids(codec: &Value) -> Vec<Value> {
    codec.get("flavors").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.get(0).cloned()).collect()).unwrap_or_default()
}

pub fn normalize(settings: &Value) -> Res {
    let fmt = settings["format"].as_str().unwrap_or("h264").to_string();
    let f = formats::get(&fmt)?;
    let mut out = deep_merge(&default(&fmt)?, settings);
    let vlist = &f["video"];
    if !vlist.as_array().map(|a| a.is_empty()).unwrap_or(true) && !contains(vlist, &out["video"]["codec"]) {
        out["video"]["codec"] = vlist[0].clone();
    }
    let vc_id = out["video"]["codec"].as_str().unwrap_or("").to_string();
    let vc = vcodec(&vc_id);
    let flavors = flavor_ids(vc);
    if !flavors.is_empty() && !flavors.contains(&out["video"]["flavor"]) {
        out["video"]["flavor"] = default_flavor(&vc_id);
    }
    if flavors.is_empty() {
        out["video"]["flavor"] = Value::Null;
    }
    if vc.get("rate").is_some() && !contains(&vc["rate"], &out["video"]["rateControl"]) {
        out["video"]["rateControl"] = vc["rate"][0].clone();
    }
    if vc.get("bitDepths").is_some() && !contains(&vc["bitDepths"], &out["video"]["bitDepth"]) {
        out["video"]["bitDepth"] = vc["bitDepths"][0].clone();
    }
    if let Some(p) = vc.get("profiles") {
        if !contains(p, &out["video"]["profile"]) {
            out["video"]["profile"] = if vc_id == "h264" { json!("high") } else { p[0].clone() };
        }
    }
    for key in ["width", "height"] {
        if let Some(x) = out["video"][key].as_f64() {
            out["video"][key] = json!(((x.max(16.0) / 2.0).round() * 2.0) as i64);
        }
    }
    let alist = &f["audio"];
    if alist.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        out["exportAudio"] = json!(false);
    } else if !contains(alist, &out["audio"]["codec"]) {
        out["audio"]["codec"] = alist[0].clone();
    }
    if vlist.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        out["exportVideo"] = json!(false);
    }
    if let Some(cs) = f.get("containers") {
        if !contains(cs, &out["multiplexer"]["container"]) {
            out["multiplexer"]["container"] = cs[0].clone();
        }
    }
    let defaults = effects_default();
    let mut eff = serde_json::Map::new();
    for (name, d) in defaults.as_object().unwrap() {
        eff.insert(name.clone(), deep_merge(d, out["effects"].get(name).unwrap_or(&json!({}))));
    }
    out["effects"] = Value::Object(eff);
    let std = out["effects"]["loudness"]["standard"].as_str().unwrap_or("ebu-r128").to_string();
    let stds = loudness_standards();
    if let Some(sd) = stds.get(&std) {
        if sd["target"].is_number() {
            out["effects"]["loudness"]["target"] = sd["target"].clone();
            out["effects"]["loudness"]["truePeak"] = sd["truePeak"].clone();
        }
    }
    if !["entire", "inout", "custom", "workArea"].contains(&out["range"]["mode"].as_str().unwrap_or("")) {
        out["range"]["mode"] = json!("entire");
    }
    if !formats::SCALING.iter().any(|(k, _)| Some(*k) == out["scaling"].as_str()) {
        out["scaling"] = json!("fit");
    }
    if !formats::INTERPOLATION.iter().any(|(k, _)| Some(*k) == out["timeInterpolation"].as_str()) {
        out["timeInterpolation"] = json!("sampling");
    }
    if !["none", "sidecar", "burnin", "embed"].contains(&out["captions"]["mode"].as_str().unwrap_or("")) {
        out["captions"]["mode"] = json!("none");
    }
    if !out["publish"].is_array() {
        out["publish"] = json!([]);
    }
    out["audio"]["routing"] = normalize_routing(&out["audio"]["routing"]);
    Ok(out)
}

pub const ROUTING_LAYOUTS: &[(&str, usize)] = &[("mono", 1), ("stereo", 2), ("quad", 4), ("5.1", 6), ("7.1", 8)];

pub fn layout_channels(layout: &str) -> usize {
    ROUTING_LAYOUTS.iter().find(|(k, _)| *k == layout).map(|(_, n)| *n).unwrap_or(2)
}

fn normalize_routing(v: &Value) -> Value {
    let tracks = v.as_array().cloned().unwrap_or_default();
    let mut out = Vec::new();
    for t in tracks.into_iter().take(32) {
        let layout = t["layout"].as_str().filter(|l| ROUTING_LAYOUTS.iter().any(|(k, _)| k == l)).unwrap_or("stereo").to_string();
        let n = layout_channels(&layout);
        let given = t["channels"].as_array().cloned().unwrap_or_default();
        let chans: Vec<Value> = (0..n)
            .map(|i| match given.get(i) {
                Some(c) if c.is_object() && c["track"].is_u64() && c["channel"].is_u64() => {
                    json!({"track": c["track"], "channel": c["channel"], "gain": c["gain"].as_f64().unwrap_or(0.0).clamp(-96.0, 24.0)})
                }
                _ => Value::Null,
            })
            .collect();
        out.push(json!({"layout": layout, "channels": chans}));
    }
    Value::Array(out)
}

pub fn apply_patch(settings: &Value, patch: &Value) -> Res {
    let empty = serde_json::Map::new();
    let pm = patch.as_object().unwrap_or(&empty);
    let mut nested = serde_json::Map::new();
    let mut flat = Vec::new();
    for (k, v) in pm {
        if k.contains('.') {
            flat.push((k.clone(), v.clone()));
        } else {
            nested.insert(k.clone(), v.clone());
        }
    }
    let nested = Value::Object(nested);
    let mut merged = deep_merge(settings, &nested);
    for (k, v) in &flat {
        set_path(&mut merged, k, v.clone());
    }
    let new_fmt = nested.get("format").and_then(Value::as_str);
    if let Some(nf) = new_fmt {
        if Some(nf) != settings["format"].as_str() {
            let mut fresh = default(nf)?;
            for k in ["range", "crop", "rotation", "scaling", "effects", "captions", "metadata", "publish", "outputName", "comments", "timeInterpolation", "startTimecode", "maxFileSize"] {
                if let Some(v) = merged.get(k) {
                    fresh[k] = v.clone();
                }
            }
            for k in ["video", "audio", "multiplexer"] {
                if let Some(v) = nested.get(k) {
                    fresh[k] = deep_merge(&fresh[k], v);
                }
            }
            for (k, v) in &flat {
                set_path(&mut fresh, k, v.clone());
            }
            merged = fresh;
        }
    }
    let identity_only = pm.keys().all(|k| ["preset", "presetName", "outputName", "comments", "publish", "range"].contains(&k.as_str()));
    if !identity_only && !pm.contains_key("preset") {
        merged["preset"] = Value::Null;
        let prev = settings["presetName"].as_str().unwrap_or("Custom");
        merged["presetName"] = json!(if prev == "Custom" || prev.ends_with("(modified)") { prev.to_string() } else { format!("{prev} (modified)") });
    }
    normalize(&merged)
}

pub fn extension(s: &Value) -> String {
    let fmt = s["format"].as_str().unwrap_or("h264");
    let f = formats::get(fmt).ok();
    if formats::is_image(fmt) {
        return f.and_then(|x| x["ext"].as_str()).unwrap_or("png").to_string();
    }
    let container = s["multiplexer"]["container"].as_str().unwrap_or("");
    if container == "none" {
        return formats::raw_ext(s["video"]["codec"].as_str().unwrap_or("")).to_string();
    }
    if let Some(e) = formats::container_ext(container) {
        return e.to_string();
    }
    f.and_then(|x| x["ext"].as_str()).unwrap_or("mp4").to_string()
}

fn token_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\{(\w+)\}").unwrap())
}

pub fn source_stem(source: &str) -> String {
    if source.contains("%0") {
        let name = Path::new(source).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let head = name.split("%0").next().unwrap_or("").trim_end_matches(['_', '.', '-', ' ']).to_string();
        return if head.is_empty() { "Sequence".into() } else { head };
    }
    Path::new(source).file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Untitled".into())
}

pub fn output_name(s: &Value, source: &str, info: &Value, index: usize, stem_override: Option<&str>) -> String {
    let stem = stem_override.map(String::from).unwrap_or_else(|| source_stem(source));
    let v = &info["video"];
    let width = s["video"]["width"].as_i64().or_else(|| v["width"].as_i64()).map(|x| x.to_string()).unwrap_or_default();
    let height = s["video"]["height"].as_i64().or_else(|| v["height"].as_i64()).map(|x| x.to_string()).unwrap_or_default();
    let fps = s["video"]["frameRate"].as_f64().or_else(|| v["fps"].as_f64()).unwrap_or(0.0);
    let tpl = s["outputName"].as_str().filter(|t| !t.trim().is_empty()).unwrap_or("{source}");
    let name = token_regex().replace_all(tpl, |c: &regex::Captures| match &c[1] {
        "source" => stem.clone(),
        "preset" => file_safe(s["presetName"].as_str().unwrap_or("Custom")),
        "format" => s["format"].as_str().unwrap_or("").to_string(),
        "date" => local_stamp("%Y-%m-%d"),
        "time" => local_stamp("%H%M%S"),
        "width" => width.clone(),
        "height" => height.clone(),
        "fps" => fmt_g(fps),
        "index" => index.to_string(),
        other => format!("{{{other}}}"),
    });
    let mut name = file_safe(&name);
    if name.is_empty() {
        name = stem;
    }
    let ext = extension(s);
    if formats::is_image(s["format"].as_str().unwrap_or("")) && s["video"]["sequence"].as_bool().unwrap_or(false) {
        format!("{name}_%06d.{ext}")
    } else {
        format!("{name}.{ext}")
    }
}

pub fn summary(s: &Value, info: &Value) -> Value {
    let v = &s["video"];
    let a = &s["audio"];
    let src = &info["video"];
    let match_source = v["matchSource"].as_bool().unwrap_or(true);
    let (sw, sh) = if src["width"].as_i64().is_some() && src["height"].as_i64().is_some() {
        let g = crate::pipeline::geometry(info, s, &json!({}));
        let (w, h) = crate::pipeline::output_size(s, &g);
        if match_source { (Some(w as i64), Some(h as i64)) } else { (Some(g.crop_w as i64), Some(g.crop_h as i64)) }
    } else {
        (None, None)
    };
    let (vw, vh) = if match_source { (None, None) } else { (v["width"].as_i64(), v["height"].as_i64()) };
    let even = |x: f64| ((x / 2.0).round() as i64 * 2).max(2);
    let (w, h) = match (vw, vh, sw, sh) {
        (Some(w), None, Some(a), Some(b)) if a > 0 => (Some(w), Some(even(w as f64 * b as f64 / a as f64))),
        (None, Some(h), Some(a), Some(b)) if b > 0 => (Some(even(h as f64 * a as f64 / b as f64)), Some(h)),
        _ => (vw.or(sw), vh.or(sh)),
    };
    let fps = v["frameRate"].as_f64().or_else(|| src["fps"].as_f64());
    let vc = vcodec(v["codec"].as_str().unwrap_or(""));
    let flavor = vc.get("flavors").and_then(Value::as_array).and_then(|fl| fl.iter().find(|x| x[0] == v["flavor"])).and_then(|x| x[1].as_str()).map(String::from);
    let rc = v["rateControl"].as_str().unwrap_or("");
    let brt = match rc {
        "vbr1" | "vbr2" => format!("{}, Target {} Mb/s, Max {} Mb/s", formats::rate_label(rc), fmt_g(v["targetBitrate"].as_f64().unwrap_or(0.0)), fmt_g(v["maxBitrate"].as_f64().unwrap_or(0.0))),
        "cbr" => format!("CBR, {} Mb/s", fmt_g(v["targetBitrate"].as_f64().unwrap_or(0.0))),
        "quality" => format!("Constant quality {}%", v["quality"].as_i64().unwrap_or(75)),
        other => formats::rate_label(other).to_string(),
    };
    let mut video_line = String::new();
    if s["exportVideo"].as_bool().unwrap_or(false) {
        let parts: Vec<String> = vec![
            match (w, h) { (Some(w), Some(h)) => format!("{w}x{h}"), _ => "Same size as source".into() },
            fps.map(|x| format!("{} fps", fmt_g((x * 100.0).round() / 100.0))).unwrap_or_else(|| "Same frame rate as source".into()),
            match v["fieldOrder"].as_str().unwrap_or("") { "progressive" => "Progressive", "tff" => "Upper first", "bff" => "Lower first", _ => "Field order as source" }.into(),
            flavor.unwrap_or_else(|| vc["label"].as_str().unwrap_or("").to_string()),
            brt,
            v["bitDepth"].as_i64().map(|d| format!("{d}-bit")).unwrap_or_default(),
        ];
        video_line = parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join(", ");
    }
    let mut audio_line = String::new();
    if s["exportAudio"].as_bool().unwrap_or(false) {
        if let Some(ac_id) = a["codec"].as_str() {
            let ac = acodec(ac_id);
            let ch = match a["channels"].as_str().unwrap_or("stereo") { "stereo" => "Stereo", "mono" => "Mono", "5.1" => "5.1", "7.1" => "7.1", "source" => "Channels as source", "tracks" => "Tracks as source", "custom" => "Custom routing", _ => "Discrete" };
            let tail = if ac.get("lossy").is_some() { format!("{} kb/s", a["bitrate"].as_i64().unwrap_or(192)) } else { format!("{}-bit", a["bitDepth"].as_i64().unwrap_or(16)) };
            let rate = a["sampleRate"].as_i64().map(|r| format!("{r} Hz")).unwrap_or_else(|| "Same sample rate as source".into());
            audio_line = format!("{}, {}, {}, {}", ac["label"].as_str().unwrap_or(ac_id), rate, ch, tail);
        }
    }
    let effects: Vec<String> = s["effects"].as_object().map(|m| m.iter().filter(|(_, e)| e["enabled"].as_bool().unwrap_or(false)).map(|(k, _)| k.clone()).collect()).unwrap_or_default();
    let publish: Vec<Value> = s["publish"].as_array().map(|a| a.iter().filter(|p| p["enabled"].as_bool().unwrap_or(true)).map(|p| p["type"].clone()).collect()).unwrap_or_default();
    json!({"format": formats::label(s["format"].as_str().unwrap_or("")), "video": video_line, "audio": audio_line, "effects": effects, "captions": s["captions"]["mode"], "publish": publish})
}
