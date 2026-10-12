use super::*;

pub(super) fn encode_status(e: &mut Engine, _: &Value) -> Res {
    let mut rows = Vec::new();
    for (oid, job) in &e.jobs {
        let rt = e.runtime.get(oid).cloned().unwrap_or(json!({}));
        let name = e.output_pos(oid).map(|(i, _)| e.items()[i]["name"].clone()).unwrap_or(Value::Null);
        rows.push(json!({"output": oid, "item": job.item_id, "name": name, "status": rt["status"], "progress": rt["progress"], "eta": rt["eta"], "elapsed": rt["elapsed"], "fps": rt["fps"], "speed": rt["speed"], "path": rt["path"], "encoder": rt["encoder"], "message": rt["message"], "outTime": rt["outTime"]}));
    }
    Ok(json!({"running": e.running, "paused": e.paused, "encoding": rows, "counts": e.counts()}))
}

pub(super) fn outputs_report(e: &mut Engine, p: &Value) -> Res {
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

pub(super) fn estimate(e: &mut Engine, p: &Value) -> Res {
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

pub(super) fn command_line(e: &mut Engine, p: &Value) -> Res {
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
    let package = crate::wrap::kind(&s0);
    let target = package.map(|k| crate::wrap::essence_path(k, &work)).unwrap_or_else(|| out.clone());
    let mut plan = pipeline::build(&src, &s0, &target, &work, &opt)?;
    if let Some(k) = package {
        let by = if k == "dcp" { "OpenJPEG (DCI JPEG 2000) and asdcp-wrap, then formencoder writes the CPL, PKL and ASSETMAP" } else { "bmx (bmxtranswrap)" };
        plan.notes.push(format!("ffmpeg writes the essence to the job folder; {by} packages it at {out}"));
    }
    Ok(json!({"command": plan.command_line(), "encoder": plan.encoder, "audioEncoder": plan.audio_encoder, "notes": plan.notes, "width": plan.width, "height": plan.height, "fps": plan.fps, "duration": plan.duration, "output": out, "package": package}))
}

pub(super) fn verify(e: &mut Engine, p: &Value) -> Res {
    let mut sopt: Option<Value> = None;
    let mut path = s(p, "path").map(String::from);
    let mut rt = json!({});
    let mut src_audio = true;
    if let Some(oid) = s(p, "output") {
        let (i, j) = e.output_ref(&json!(oid))?;
        let it = &e.items()[i];
        src_audio = it["kind"] == "family" || it["stitch"].is_array() || it["info"]["audio"].as_array().map(|a| !a.is_empty()).unwrap_or(true);
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
    let package = sopt.as_ref().and_then(crate::wrap::kind);
    let files: Vec<String> = rt["files"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    if let Some(k) = package {
        probe_path = crate::wrap::picture_file(k, &path, &files).ok_or("the package's picture file was not found")?;
    }
    let info = ffmpeg::probe(&probe_path, None);
    let v = &info["video"];
    let mut checks: Vec<Value> = Vec::new();
    if let Some(s0) = &sopt {
        let fmt = s0["format"].as_str().unwrap_or("");
        if s0["exportVideo"].as_bool().unwrap_or(false) && rt["width"].is_number() {
            let pad = pipeline::fixed_raster(s0).map(|r| r.pad_top as i64).unwrap_or(0);
            let want_h = json!(rt["height"].as_i64().unwrap_or(0) + pad);
            checks.push(json!({"check": "frame size", "want": format!("{}x{}", rt["width"], want_h), "got": format!("{}x{}", v["width"], v["height"]), "ok": v["width"] == rt["width"] && v["height"] == want_h}));
        }
        if s0["exportVideo"].as_bool().unwrap_or(false) && rt["fps"].is_number() && !formats::is_image(fmt) && fmt != "gif" {
            let ok = (v["fps"].as_f64().unwrap_or(0.0) - rt["fps"].as_f64().unwrap_or(0.0)).abs() < 0.02;
            checks.push(json!({"check": "frame rate", "want": rt["fps"], "got": v["fps"], "ok": ok}));
        }
        let elementary = s0["multiplexer"]["container"] == "none" && package.is_none();
        if rt["duration"].as_f64().unwrap_or(0.0) > 0.0 && !formats::is_image(fmt) && !elementary {
            let want = rt["duration"].as_f64().unwrap_or(0.0);
            let got = info["duration"].as_f64().unwrap_or(0.0);
            let tol = (2.0 / rt["fps"].as_f64().unwrap_or(25.0).max(1.0)).max(0.15);
            checks.push(json!({"check": "duration", "want": (want * 1000.0).round() / 1000.0, "got": (got * 1000.0).round() / 1000.0, "ok": (got - want).abs() < tol}));
        }
        if s0["exportVideo"].as_bool().unwrap_or(false) {
            let codec = s0["video"]["codec"].as_str().unwrap_or("");
            let want = match codec { "dnxhr" => "dnxhd", "cineform" => "cfhd", "xdcam" | "mpeg2" | "imx" => "mpeg2video", "dvcprohd" => "dvvideo", "dcp_j2k" => "jpeg2000", "jpeg" | "mjpeg" => "mjpeg", "uncompressed" => if s0["video"]["flavor"] == "v210" { "v210" } else { "rawvideo" }, other => other };
            checks.push(json!({"check": "video codec", "want": want, "got": v["codec"], "ok": v["codec"] == json!(want)}));
        }
        if let Some(k) = package {
            checks.extend(crate::wrap::verify(k, s0, &path, &files));
        }
        if crate::credentials::wanted(s0) && crate::credentials::supported(&probe_path) {
            let c = crate::credentials::check(&probe_path);
            let got = if c["present"].as_bool().unwrap_or(false) { format!("{} manifest{}", c["generator"].as_str().unwrap_or("a"), c["issues"].as_array().filter(|a| !a.is_empty()).map(|a| format!(" ({})", a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))).unwrap_or_default()) } else { "none".into() };
            checks.push(json!({"check": "Content Credentials", "want": "a valid formencoder manifest", "got": got, "ok": c["valid"].as_bool().unwrap_or(false) && c["generator"] == "formencoder"}));
        }
        if s0["exportAudio"].as_bool().unwrap_or(false) && src_audio && !matches!(package, Some("p2" | "dcp")) {
            if let Some(ac) = s0["audio"]["codec"].as_str() {
                let side = if elementary { files.iter().find(|f| **f != probe_path).map(|f| ffmpeg::probe(f, None)) } else { None };
                let a = side.as_ref().unwrap_or(&info)["audio"].get(0).cloned().unwrap_or(Value::Null);
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
    let vr_found = crate::vr::read(&probe_path);
    if let Some(s0) = &sopt {
        if crate::vr::wanted(s0) {
            checks.push(json!({"check": "VR metadata", "want": "spherical", "got": if vr_found.is_some() { "spherical" } else { "none" }, "ok": vr_found.is_some()}));
        }
    }
    let mut out = json!({"path": path, "probe": info, "checks": checks, "vr": vr_found});
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
