use super::*;

pub(super) fn format_list(e: &mut Engine, _: &Value) -> Res {
    let det = encoders::detect(false);
    let st = e.encoder_status.lock().unwrap().clone().unwrap_or(json!({}));
    Ok(json!({"formats": formats::listing(Some(&det)), "hardware": st["hardware"], "ffmpeg": st["ffmpeg"]}))
}

pub(super) fn format_describe(e: &mut Engine, p: &Value) -> Res {
    let mut sopt = None;
    let mut fmt = s(p, "format").map(String::from);
    if let Some(oid) = s(p, "output") {
        let (i, j) = e.output_ref(&json!(oid))?;
        let st = e.items()[i]["outputs"][j]["settings"].clone();
        fmt = st["format"].as_str().map(String::from);
        sopt = Some(st);
    }
    if let Some(st) = p.get("settings").filter(|x| x.is_object()) {
        fmt = st["format"].as_str().map(String::from).or(fmt);
        sopt = Some(st.clone());
    }
    let fmt = fmt.ok_or("pass format, output or settings")?;
    let det = encoders::detect(false);
    let f = formats::get(&fmt)?;
    let mut out = formats::fields(&fmt, sopt.as_ref())?;
    let codecs: serde_json::Map<String, Value> = formats::strs(&f["video"]).iter().map(|c| (c.clone(), json!({"label": formats::vcodec(c)["label"], "encoders": det.video.get(formats::vcodec(c)["family"].as_str().unwrap_or("")).cloned().unwrap_or_default()}))).collect();
    let acodecs: serde_json::Map<String, Value> = formats::strs(&f["audio"]).iter().map(|c| (c.clone(), json!({"label": formats::acodec(c)["label"], "encoders": det.audio.get(formats::acodec(c)["family"].as_str().unwrap_or("")).cloned().unwrap_or_default()}))).collect();
    out["codecs"] = Value::Object(codecs);
    out["audioCodecs"] = Value::Object(acodecs);
    out["effects"] = settings::effects_default();
    out["loudnessStandards"] = settings::loudness_standards();
    out["positions"] = json!(settings::POSITIONS);
    out["scaling"] = json!(formats::SCALING.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["cropProportions"] = json!(pipeline::CROP_PROPORTIONS.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    if let Some(t) = f["tool"].as_str() {
        out["toolStatus"] = crate::tools::listing().as_array().and_then(|a| a.iter().find(|x| x["id"] == t).cloned()).unwrap_or(Value::Null);
    }
    out["timeInterpolation"] = json!(formats::INTERPOLATION.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["captions"] = json!(captions::FORMATS.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>());
    out["defaults"] = settings::default(&fmt)?;
    Ok(out)
}

pub(super) fn format_encoders(e: &mut Engine, p: &Value) -> Res {
    if bv(p, "refresh", false) {
        encoders::detect(true);
        let st = encoders::status();
        *e.encoder_status.lock().unwrap() = Some(st);
    }
    let cur = e.encoder_status.lock().unwrap().clone();
    Ok(cur.unwrap_or_else(encoders::status))
}
