use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{Value, json};

use crate::paths;
use crate::util::Res;

pub struct Tool {
    pub id: &'static str,
    pub label: &'static str,
    pub programs: &'static [&'static str],
    pub version: &'static str,
    pub licence: &'static str,
    pub source: &'static str,
    pub used_for: &'static str,
}

pub const TOOLS: &[Tool] = &[
    Tool { id: "bmx", label: "BBC bmx", programs: &["bmxtranswrap", "mxf2raw"], version: "v1.6", licence: "BSD-3-Clause", source: "https://github.com/bbc/bmx", used_for: "AS-10, AS-11 and P2 (OP-Atom) MXF wrapping" },
    Tool { id: "asdcplib", label: "asdcplib", programs: &["asdcp-wrap", "asdcp-info"], version: "rel_2_13_2", licence: "BSD-3-Clause", source: "https://github.com/cinecert/asdcplib", used_for: "DCP picture and sound track files" },
    Tool { id: "openjpeg", label: "OpenJPEG", programs: &["opj_compress"], version: "v2.5.3", licence: "BSD-2-Clause", source: "https://github.com/uclouvain/openjpeg", used_for: "DCI cinema-profile JPEG 2000 for DCP" },
    Tool { id: "kvazaar", label: "Kvazaar", programs: &["kvazaar"], version: "v2.3.2", licence: "BSD-3-Clause", source: "https://github.com/ultravideo/kvazaar", used_for: "software HEVC encoding when the FFmpeg has no libx265" },
    Tool { id: "c2patool", label: "c2patool", programs: &["c2patool"], version: "0.27.22", licence: "MIT OR Apache-2.0", source: "https://github.com/contentauth/c2pa-rs", used_for: "Content Credentials (C2PA): signing a manifest into finished outputs and reading it back in Verify" },
    Tool { id: "whisper", label: "whisper.cpp", programs: &["whisper-cli"], version: "v1.9.5", licence: "MIT", source: "https://github.com/ggml-org/whisper.cpp", used_for: "speech to text: transcripts and captions from a source's audio, with a downloaded speech model" },
    Tool { id: "lame", label: "LAME", programs: &["lame"], version: "3.100", licence: "LGPL-2.0-or-later", source: "https://lame.sourceforge.io", used_for: "MP3 audio files when the FFmpeg has no libmp3lame" },
];

fn exe(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

pub fn folders() -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    if let Ok(v) = env::var("FORMENCODER_TOOLS_DIR") {
        if !v.trim().is_empty() {
            out.push(("FORMENCODER_TOOLS_DIR".to_string(), PathBuf::from(paths::expand(v.trim()))));
        }
    }
    out.push(("per-person".to_string(), paths::platform_data("formencoder").join("tools").join("bin")));
    if let Ok(exe_path) = env::current_exe() {
        if let Some(here) = exe_path.parent() {
            out.push(("app".to_string(), here.join("tools")));
            out.push(("app".to_string(), here.join("..").join("Resources").join("tools")));
            out.push(("app".to_string(), here.join("..").join("lib").join("formencoder").join("tools")));
        }
    }
    if let Ok(repo) = env::var("FORMENCODER_REPO") {
        out.push(("clone".to_string(), PathBuf::from(repo).join("src-tauri").join("tools")));
    }
    out
}

pub fn find(program: &str) -> Option<PathBuf> {
    let name = exe(program);
    for (_, f) in folders() {
        let p = f.join(&name);
        if p.is_file() {
            return Some(p);
        }
    }
    let path = env::var_os("PATH")?;
    env::split_paths(&path).map(|d| d.join(&name)).find(|p| p.is_file())
}

pub fn get(id: &str) -> Option<&'static Tool> {
    TOOLS.iter().find(|t| t.id == id)
}

pub fn require(program: &str, purpose: &str) -> Res<PathBuf> {
    find(program).ok_or_else(|| {
        let owner = TOOLS.iter().find(|t| t.programs.contains(&program));
        match owner {
            Some(t) => format!("{purpose} needs {program} from {} {} ({}), which is not installed; run ./formencoder install-tools {} or put {program} on the PATH", t.label, t.version, t.licence, t.id),
            None => format!("{purpose} needs {program}, which is not installed"),
        }
    })
}

pub fn listing() -> Value {
    let mut rows: Vec<Value> = TOOLS
        .iter()
        .map(|t| {
            let progs: Vec<Value> = t.programs.iter().map(|p| json!({"program": p, "path": find(p).map(|x| x.to_string_lossy().into_owned())})).collect();
            let installed = progs.iter().all(|p| !p["path"].is_null());
            json!({"id": t.id, "label": t.label, "version": t.version, "licence": t.licence, "source": t.source, "usedFor": t.used_for, "installed": installed, "programs": progs})
        })
        .collect();
    let lib = crate::openh264::installed();
    rows.push(json!({"id": "openh264", "label": "OpenH264", "version": crate::openh264::VERSION, "licence": "BSD-2-Clause (Cisco binary)", "source": "https://www.openh264.org",
                     "usedFor": "software H.264 encoding when the FFmpeg has no libx264; downloaded from Cisco, never bundled", "installed": lib.is_some(), "enabled": crate::openh264::enabled(),
                     "programs": [{"program": crate::openh264::file_name(), "path": lib.map(|p| p.to_string_lossy().into_owned())}], "attribution": crate::openh264::ATTRIBUTION, "download": true}));
    Value::Array(rows)
}

pub fn run(program: &Path, args: &[String], cwd: Option<&Path>) -> Res<String> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("{} could not start: {e}", program.display()))?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    if !out.status.success() {
        let name = program.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let line = text.lines().rev().find(|l| l.contains("ERROR") || l.contains("rror")).or(text.lines().last()).unwrap_or("").trim().to_string();
        return Err(format!("{name} failed ({}): {line}", out.status.code().unwrap_or(-1)));
    }
    Ok(text)
}
