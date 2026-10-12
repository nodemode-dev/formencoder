use super::*;

pub(super) fn ingest(e: &mut Engine, p: &Value) -> Res {
    let dest = paths::expand(s(p, "destination").ok_or("pass destination")?);
    let verify = s(p, "verify").unwrap_or("md5").to_string();
    let mut added = Vec::new();
    let list: Vec<String> = p["paths"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(paths::expand)).collect()).unwrap_or_default();
    if list.is_empty() {
        return Err("pass paths".into());
    }
    let transcode = match s(p, "preset") {
        Some(pr) => {
            let row = presets::require(pr)?;
            if row["kind"] == "ingest" { row["transcode"].as_str().map(String::from) } else { row["id"].as_str().map(String::from) }
        }
        None => None,
    };
    let verify = match s(p, "preset").and_then(|pr| presets::find(pr)) { Some(r) if r["kind"] == "ingest" && s(p, "verify").is_none() => r["verify"].as_str().unwrap_or(&verify).to_string(), _ => verify };
    for path in list {
        let src = PathBuf::from(&path);
        if !src.exists() {
            return Err(format!("no file or folder at {path}"));
        }
        let info = if src.is_file() { ffmpeg::probe(&path, None) } else { json!({"kind": "folder", "duration": 0}) };
        let mut it = e.new_item(&path, &info, Some("ingest"));
        let mut copy = e.make_output(None, None, Some("h264"), None, None, "copy")?;
        copy["destination"] = json!(dest);
        copy["verify"] = json!(verify);
        let mut outs = vec![copy];
        if let (Some(t), true) = (&transcode, src.is_file()) {
            outs.push(e.make_output(None, Some(t), None, Some(s(p, "transcodeFolder").unwrap_or(&dest)), None, "encode")?);
        }
        it["outputs"] = json!(outs);
        added.push(it["id"].clone());
        e.items_mut().push(it);
    }
    if bv(p, "start", false) {
        e.start_queue("ingest");
    }
    Ok(json!({"items": added}))
}

pub(super) fn proxies(e: &mut Engine, p: &Value) -> Res {
    let preset = s(p, "preset").unwrap_or("system/proxy-h264-720").to_string();
    let mut added = Vec::new();
    for f in path_list(p, "paths")? {
        let info = ffmpeg::probe(&f, None);
        let mut it = e.new_item(&f, &info, None);
        let folder = s(p, "folder").map(String::from).unwrap_or_else(|| Path::new(&f).parent().unwrap_or(Path::new(".")).join("Proxies").to_string_lossy().into_owned());
        it["outputs"] = json!([e.make_output(None, Some(&preset), None, Some(&folder), None, "encode")?]);
        it["proxy"] = json!(true);
        added.push(json!({"item": it["id"], "output": it["outputs"][0]["id"]}));
        e.items_mut().push(it);
    }
    if bv(p, "start", false) {
        e.start_queue("proxy");
    }
    Ok(json!({"added": added}))
}

pub(super) fn analyze(e: &mut Engine, p: &Value) -> Res {
    let mut added = Vec::new();
    for f in path_list(p, "paths")? {
        let info = ffmpeg::probe(&f, None);
        let mut it = e.new_item(&f, &info, None);
        it["outputs"] = json!([e.make_output(None, None, Some("h264"), None, None, "analysis")?]);
        added.push(it["id"].clone());
        e.items_mut().push(it);
    }
    if bv(p, "start", true) {
        e.start_queue("analysis");
    }
    Ok(json!({"items": added}))
}

pub(super) fn transcribe(e: &mut Engine, p: &Value) -> Res {
    let mut added = Vec::new();
    let spec = json!({"model": p["model"], "language": p["language"], "translate": p["translate"], "formats": p["formats"], "overwrite": p["overwrite"]});
    let opts = crate::transcribe::options(&json!({"transcribe": spec}));
    if crate::transcribe::model_path(opts["model"].as_str().unwrap_or("base")).is_none() {
        return Err(format!("the speech model {} is not downloaded; get it in Preferences > Delivery Tools or with ./formencoder install-tools --model {}", opts["model"].as_str().unwrap_or(""), opts["model"].as_str().unwrap_or("")));
    }
    for f in path_list(p, "paths")? {
        let info = ffmpeg::probe(&f, None);
        if info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
            return Err(format!("{f} has no audio to transcribe"));
        }
        let mut it = e.new_item(&f, &info, None);
        let mut o = e.make_output(None, None, Some("h264"), s(p, "folder"), None, "transcribe")?;
        o["transcribe"] = opts.clone();
        added.push(json!({"item": it["id"], "output": o["id"]}));
        it["outputs"] = json!([o]);
        e.items_mut().push(it);
    }
    if bv(p, "start", true) {
        e.start_queue("transcribe");
    }
    Ok(json!({"added": added, "options": opts}))
}

pub(super) fn transcribe_models(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"models": crate::transcribe::listing(), "folder": crate::transcribe::models_dir().to_string_lossy(), "formats": crate::transcribe::FORMATS, "whisper": crate::tools::find("whisper-cli").map(|p| p.to_string_lossy().into_owned())}))
}
