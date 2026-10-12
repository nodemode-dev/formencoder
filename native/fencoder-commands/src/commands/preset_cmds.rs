use super::*;

pub(super) fn preset_list(_: &mut Engine, p: &Value) -> Res {
    let rows = presets::listing(s(p, "query"), s(p, "category"), s(p, "kind"));
    let mut groups: BTreeMap<String, i64> = BTreeMap::new();
    for r in &rows {
        *groups.entry(format!("{}/{}", if r["system"].as_bool().unwrap_or(false) { "System" } else { "User" }, r["group"].as_str().unwrap_or(""))).or_default() += 1;
    }
    Ok(json!({"presets": rows, "groups": groups, "userGroups": presets::groups()}))
}

pub(super) fn preset_get(_: &mut Engine, p: &Value) -> Res {
    let pr = presets::require(s(p, "preset").unwrap_or(""))?;
    let mut row = presets::row(&pr);
    row["settings"] = pr["settings"].clone();
    Ok(row)
}

pub(super) fn preset_create(e: &mut Engine, p: &Value) -> Res {
    let name = s(p, "name").ok_or("pass name")?.to_string();
    let mut settings_v = p["settings"].clone();
    let mut from: Option<(usize, usize)> = None;
    if let Some(oid) = s(p, "fromOutput") {
        let pos = e.output_ref(&json!(oid))?;
        settings_v = e.items()[pos.0]["outputs"][pos.1]["settings"].clone();
        from = Some(pos);
    }
    if !settings_v.is_object() {
        return Err("pass settings or fromOutput".into());
    }
    let made = presets::create(&name, &settings_v, s(p, "group"), s(p, "comment").unwrap_or(""))?;
    if let Some((i, j)) = from {
        let o = &mut e.items_mut()[i]["outputs"][j]["settings"];
        o["preset"] = made["id"].clone();
        o["presetName"] = json!(name);
    }
    Ok(json!({"preset": made["id"], "name": name, "file": made["file"]}))
}

pub(super) fn preset_update(_: &mut Engine, p: &Value) -> Res {
    let pr = presets::require(s(p, "preset").unwrap_or(""))?;
    let merged = if p["settings"].is_object() { Some(settings::apply_patch(&pr["settings"], &p["settings"])?) } else { None };
    let d = presets::update(pr["id"].as_str().unwrap_or(""), s(p, "name"), merged.as_ref(), s(p, "group"), p["comment"].as_str())?;
    Ok(json!({"preset": d["id"], "name": d["name"]}))
}

pub(super) fn preset_delete(_: &mut Engine, p: &Value) -> Res {
    let r = presets::delete(s(p, "preset").unwrap_or(""))?;
    Ok(json!({"deleted": r["deleted"]}))
}

pub(super) fn preset_duplicate(_: &mut Engine, p: &Value) -> Res {
    let m = presets::duplicate(s(p, "preset").unwrap_or(""), s(p, "name"))?;
    Ok(json!({"preset": m["id"], "name": m["name"]}))
}

pub(super) fn preset_group(_: &mut Engine, p: &Value) -> Res {
    Ok(json!({"groups": presets::new_group(s(p, "name").unwrap_or("Group"))?}))
}

pub(super) fn preset_alias(_: &mut Engine, p: &Value) -> Res {
    presets::set_alias(s(p, "preset").unwrap_or(""), s(p, "alias"))
}

pub(super) fn preset_import(_: &mut Engine, p: &Value) -> Res {
    let m = presets::import_file(s(p, "path").unwrap_or(""), s(p, "group"))?;
    Ok(json!({"preset": m["id"], "name": m["name"], "notes": m["notes"]}))
}

pub(super) fn preset_export(_: &mut Engine, p: &Value) -> Res {
    presets::export(s(p, "preset").unwrap_or(""), s(p, "path").unwrap_or(""))
}

pub(super) fn preset_reveal(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"folder": presets::user_dir().to_string_lossy()}))
}
