use super::*;

pub(super) fn undo(e: &mut Engine, _: &Value) -> Res {
    e.do_undo()
}

pub(super) fn redo(e: &mut Engine, _: &Value) -> Res {
    e.do_redo()
}

pub(super) fn history(e: &mut Engine, _: &Value) -> Res {
    Ok(json!({"undo": e.undo.iter().map(|u| u.0.clone()).collect::<Vec<_>>(), "redo": e.redo.iter().rev().map(|u| u.0.clone()).collect::<Vec<_>>()}))
}

pub(super) fn ui_action(e: &mut Engine, p: &Value) -> Res {
    let mut ev = p.clone();
    ev["type"] = json!("uiAction");
    e.emit(ev);
    Ok(p.clone())
}

pub(super) fn ui_toast(e: &mut Engine, p: &Value) -> Res {
    let t = s(p, "text").unwrap_or("").to_string();
    e.toast(&t, s(p, "kind").unwrap_or("info"));
    Ok(json!({"shown": t}))
}

pub(super) fn app_capabilities(e: &mut Engine, _: &Value) -> Res {
    let st = e.encoder_status.lock().unwrap().clone().unwrap_or(json!({}));
    Ok(json!({"name": "formencoder", "version": crate::VERSION, "engine": "fe-core (Rust)", "commands": all().len(), "formats": formats::ids().len(), "presets": presets::system().len() + presets::ingest().len(),
              "ffmpeg": st["ffmpeg"], "hardware": st["hardware"], "dataDir": paths::data_dir().to_string_lossy(), "effects": settings::effects_default().as_object().map(|m| m.keys().cloned().collect::<Vec<_>>()),
              "queueExtension": ".fequeue", "presetExtension": format!(".{}", presets::EXT), "time": now()}))
}

pub(super) fn app_status(e: &mut Engine, _: &Value) -> Res {
    let st = e.ui_state();
    let c = &st["counts"];
    let next = if st["items"].as_array().map(|a| a.is_empty()).unwrap_or(true) { "add sources (queue.addSource, or the encode tool)" } else if c["ready"].as_i64().unwrap_or(0) > 0 && !e.running { "start the queue (queue.start)" } else if e.running { "wait for encoding (the wait tool)" } else { "verify outputs (encode.verify)" };
    let enc = encode_status(e, &json!({}))?;
    Ok(json!({"running": st["running"], "paused": st["paused"], "counts": st["counts"], "items": st["items"].as_array().map(|a| a.len()), "watchFolders": st["watch"].as_array().map(|a| a.len()),
              "encoding": enc["encoding"], "ffmpeg": st["ffmpeg"], "hardware": st["hardware"], "selection": st["selection"], "undo": st["undo"], "next": next, "notices": e.notices.iter().rev().take(5).cloned().collect::<Vec<_>>()}))
}
