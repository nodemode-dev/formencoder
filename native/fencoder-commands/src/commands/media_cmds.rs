use super::*;

pub(super) fn metadata_templates(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"templates": metadata::list_templates(), "categories": metadata::CATEGORIES.iter().map(|(id, label, _)| json!([id, label])).collect::<Vec<_>>()}))
}

pub(super) fn metadata_save_template(e: &mut Engine, p: &Value) -> Res {
    let fields = if let Some(oid) = s(p, "fromOutput") {
        let (i, j) = e.output_ref(&json!(oid))?;
        e.items()[i]["outputs"][j]["settings"]["metadata"]["fields"].clone()
    } else {
        p["fields"].clone()
    };
    metadata::save_template(s(p, "name").unwrap_or(""), &fields)
}

pub(super) fn metadata_delete_template(_: &mut Engine, p: &Value) -> Res {
    metadata::delete_template(s(p, "name").unwrap_or(""))
}

pub(super) fn media_roots(_: &mut Engine, _: &Value) -> Res {
    let home = paths::home();
    let mut roots = vec![json!({"name": "Home", "path": home.to_string_lossy()})];
    for n in ["Desktop", "Movies", "Videos", "Music", "Pictures", "Downloads", "Documents"] {
        let pth = home.join(n);
        if pth.is_dir() {
            roots.push(json!({"name": n, "path": pth.to_string_lossy()}));
        }
    }
    let mut vols = |base: &Path| {
        if let Ok(rd) = fs::read_dir(base) {
            for en in rd.flatten() {
                if en.path().is_dir() {
                    roots.push(json!({"name": en.file_name().to_string_lossy(), "path": en.path().to_string_lossy(), "volume": true}));
                }
            }
        }
    };
    if cfg!(target_os = "macos") {
        vols(Path::new("/Volumes"));
    } else if cfg!(windows) {
        for d in b'A'..=b'Z' {
            let pth = format!("{}:\\", d as char);
            if Path::new(&pth).exists() {
                roots.push(json!({"name": format!("{}:", d as char), "path": pth, "volume": true}));
            }
        }
    } else {
        vols(Path::new("/media"));
        vols(Path::new("/mnt"));
    }
    roots.push(json!({"name": "formencoder Output", "path": paths::sub("Output").to_string_lossy()}));
    Ok(json!({"roots": roots}))
}

pub(super) fn card(name: &str) -> Option<&'static str> {
    Some(match name.to_uppercase().as_str() {
        "PRIVATE" => "AVCHD or XAVC card",
        "CONTENTS" => "P2 card",
        "BPAV" => "XDCAM EX card",
        "XDROOT" => "XDCAM card",
        "DCIM" => "Camera card",
        "CLIPS001" => "Canon XF card",
        "M4ROOT" => "Sony card",
        _ => return None,
    })
}

pub(super) fn media_browse(_: &mut Engine, p: &Value) -> Res {
    let root = PathBuf::from(paths::expand(s(p, "path").ok_or("pass path")?));
    if !root.is_dir() {
        return Err(format!("no folder at {}", root.display()));
    }
    let filter = s(p, "filter").unwrap_or("media");
    let query = s(p, "query").map(|q| q.to_lowercase());
    let mut entries: Vec<PathBuf> = fs::read_dir(&root).map_err(|x| format!("cannot read {}: {x}", root.display()))?.flatten().map(|en| en.path()).collect();
    entries.sort_by_key(|x| (!x.is_dir(), x.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default()));
    let mut rows = Vec::new();
    let mut seen_seq: Vec<String> = Vec::new();
    for pth in entries {
        let name = pth.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.starts_with('.') || query.as_ref().map(|q| !name.to_lowercase().contains(q)).unwrap_or(false) {
            continue;
        }
        if pth.is_dir() {
            rows.push(json!({"name": name, "path": pth.to_string_lossy(), "dir": true, "card": card(&name)}));
            continue;
        }
        let kind = ffmpeg::kind_of(&name);
        if filter == "media" && !matches!(kind, "video" | "audio" | "image" | "link") {
            continue;
        }
        if matches!(filter, "video" | "audio" | "image") && kind != filter {
            continue;
        }
        let md = fs::metadata(&pth).ok();
        let size = md.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = md.and_then(|m| m.modified().ok()).and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64()).unwrap_or(0.0);
        if kind == "image" {
            if let Some(c) = ffmpeg::sequence_regex().captures(&name) {
                let key = format!("{}|{}|{}", &c[1], c[2].len(), &c[3]);
                if seen_seq.contains(&key) {
                    continue;
                }
                if let Some(seq) = ffmpeg::sequence_of(&pth.to_string_lossy()) {
                    seen_seq.push(key);
                    rows.push(json!({"name": format!("{}[{}-{}]{}", &c[1], seq["first"], seq["last"], &c[3]), "path": pth.to_string_lossy(), "dir": false, "kind": "sequence", "frames": seq["count"], "size": size, "modified": modified}));
                    continue;
                }
            }
        }
        let mut row = json!({"name": name, "path": pth.to_string_lossy(), "dir": false, "kind": kind, "size": size, "modified": modified});
        if bv(p, "probe", false) && (kind == "video" || kind == "audio") {
            let info = ffmpeg::probe(&pth.to_string_lossy(), None);
            row["duration"] = info["duration"].clone();
            row["width"] = info["video"]["width"].clone();
            row["height"] = info["video"]["height"].clone();
            row["fps"] = info["video"]["fps"].clone();
            row["codec"] = info["video"]["codec"].clone();
        }
        rows.push(row);
        if rows.len() >= 5000 {
            break;
        }
    }
    Ok(json!({"path": root.to_string_lossy(), "parent": root.parent().map(|x| x.to_string_lossy().into_owned()), "entries": rows}))
}

pub(super) fn media_probe(_: &mut Engine, p: &Value) -> Res {
    let path = paths::expand(s(p, "path").ok_or("pass path")?);
    let mut info = ffmpeg::probe(&path, p["frameRate"].as_f64());
    if bv(p, "loudness", false) && !info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        info["loudness"] = pipeline::measure_file(&path);
    }
    Ok(info)
}

pub(super) fn captions_read(_: &mut Engine, p: &Value) -> Res {
    let cues = captions::read_file(&paths::expand(s(p, "path").ok_or("pass path")?))?;
    Ok(json!({"cues": cues.iter().take(2000).map(|c| c.json()).collect::<Vec<_>>(), "count": cues.len()}))
}

pub(super) fn captions_convert(_: &mut Engine, p: &Value) -> Res {
    let src = paths::expand(s(p, "path").ok_or("pass path")?);
    let to = s(p, "to").unwrap_or("srt");
    let cues = captions::read_file(&src)?;
    let target = s(p, "output").map(paths::expand).unwrap_or_else(|| Path::new(&src).with_extension(captions::sidecar_ext(to)).to_string_lossy().into_owned());
    fs::write(&target, captions::write(&cues, to, "en")).map_err(|x| x.to_string())?;
    Ok(json!({"path": target, "cues": cues.len()}))
}

pub(super) fn lut_list(_: &mut Engine, _: &Value) -> Res {
    Ok(json!({"luts": colour::listing(), "folder": colour::lut_dir().to_string_lossy()}))
}

pub(super) fn lut_install(_: &mut Engine, p: &Value) -> Res {
    colour::install(s(p, "path").ok_or("pass path")?)
}
