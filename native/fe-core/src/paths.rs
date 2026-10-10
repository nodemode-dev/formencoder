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

pub fn sub(name: &str) -> PathBuf {
    let p = data_dir().join(name);
    let _ = fs::create_dir_all(&p);
    p
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
