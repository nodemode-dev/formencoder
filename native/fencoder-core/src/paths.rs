use std::env;
use std::fs;
use std::path::PathBuf;

pub fn home() -> PathBuf {
    env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

pub fn data_dir() -> PathBuf {
    let root = match env::var("FORMENCODER_DATA_DIR") {
        Ok(v) if !v.trim().is_empty() => PathBuf::from(expand(v.trim())),
        _ => home().join("Formencoder"),
    };
    let _ = fs::create_dir_all(&root);
    root
}

pub fn cache_dir() -> PathBuf {
    let custom = crate::prefs::load()["cacheFolder"].as_str().map(|s| s.trim().to_string()).unwrap_or_default();
    let p = if custom.is_empty() { data_dir().join("cache") } else { PathBuf::from(expand(&custom)) };
    let _ = fs::create_dir_all(&p);
    p
}

pub fn sub(name: &str) -> PathBuf {
    if name == "cache" {
        return cache_dir();
    }
    let p = data_dir().join(name);
    let _ = fs::create_dir_all(&p);
    p
}

fn walk(dir: &std::path::Path, out: &mut Vec<(PathBuf, u64, std::time::SystemTime)>) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if let Ok(md) = e.metadata() {
                if md.is_dir() {
                    walk(&p, out);
                } else {
                    out.push((p, md.len(), md.modified().unwrap_or(std::time::UNIX_EPOCH)));
                }
            }
        }
    }
}

pub fn cache_usage() -> (u64, usize) {
    let mut files = Vec::new();
    walk(&cache_dir(), &mut files);
    (files.iter().map(|f| f.1).sum(), files.len())
}

pub fn trim_cache(limit_bytes: u64, keep: &[String]) -> (u64, usize) {
    let mut files = Vec::new();
    walk(&cache_dir(), &mut files);
    files.retain(|(p, _, _)| !keep.iter().any(|k| p.to_string_lossy().contains(k.as_str())));
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.2);
    let (mut freed, mut removed) = (0u64, 0usize);
    for (p, size, _) in files {
        if total <= limit_bytes {
            break;
        }
        if fs::remove_file(&p).is_ok() {
            total -= size;
            freed += size;
            removed += 1;
        }
    }
    (freed, removed)
}

pub fn expand(p: &str) -> String {
    if let Some(rest) = p.strip_prefix("~/") {
        return home().join(rest).to_string_lossy().into_owned();
    }
    if p == "~" {
        return home().to_string_lossy().into_owned();
    }
    p.to_string()
}

pub fn platform_data(app: &str) -> PathBuf {
    if cfg!(target_os = "macos") {
        home().join("Library").join("Application Support").join(app)
    } else if cfg!(windows) {
        env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home().join("AppData").join("Local")).join(app)
    } else {
        env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local").join("share")).join(app)
    }
}
