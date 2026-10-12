use super::*;

pub(super) fn family_queue(e: &mut Engine, p: &Value) -> Res {
    let spec = p["spec"].clone();
    let app = spec["app"].as_str().ok_or("spec.app is required")?.to_string();
    let kind = match app.as_str() { "formwav" => "audio", "formvis" => "image", _ => "video" };
    let w = spec["width"].clone();
    let info = json!({"kind": kind, "duration": spec["duration"].as_f64().unwrap_or(0.0), "video": if w.is_number() { json!({"width": w, "height": spec["height"], "fps": spec["frameRate"]}) } else { Value::Null }, "audio": if app == "formwav" { json!([{"codec": "pcm", "sampleRate": 48000, "channels": 2}]) } else { json!([]) }});
    let key = spec["descriptor"].as_str().map(String::from).unwrap_or_else(|| format!("{app}:{}", spec["id"].as_str().map(String::from).unwrap_or_else(|| spec["id"].to_string())));
    let mut it = e.new_item(&key, &info, Some("family"));
    it["name"] = json!(format!("{} ({app})", spec["name"].as_str().unwrap_or("source")));
    it["family"] = spec.clone();
    let mut q = p.clone();
    if s(p, "preset").is_none() && s(p, "format").is_none() && !p["settings"].is_object() && p["outputs"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        q["preset"] = json!(match app.as_str() { "formwav" => "system/wav-48-24", "formvis" => "system/png-still", _ => "system/match-source-high" });
    }
    it["outputs"] = json!(outputs_spec(e, &q, s(p, "folder"))?);
    let res = json!({"item": it["id"], "output": it["outputs"][0]["id"], "name": it["name"]});
    e.items_mut().push(it);
    if bv(p, "start", false) {
        e.start_queue("family");
    }
    Ok(res)
}

pub(super) fn family_resolved(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").ok_or("pass output")?;
    let job = e.jobs.get(oid).ok_or("that output is not waiting for family media")?;
    let r = if let Some(err) = s(p, "error") { Err(err.to_string()) } else { Ok(p["media"].clone()) };
    job.shared.lock().unwrap().family = Some(r);
    Ok(json!({"output": oid}))
}

pub(super) fn publish_result(e: &mut Engine, p: &Value) -> Res {
    let oid = s(p, "output").ok_or("pass output")?.to_string();
    let rt = e.runtime.entry(oid.clone()).or_insert_with(|| json!({}));
    rt["publish"] = p["results"].clone();
    rt["publishPending"] = json!(false);
    let failed = p["results"].as_array().map(|a| a.iter().any(|r| !r["ok"].as_bool().unwrap_or(false))).unwrap_or(false);
    if failed {
        e.toast("A publish destination failed; the Encoding log has the reason", "error");
    }
    Ok(json!({"output": oid}))
}
