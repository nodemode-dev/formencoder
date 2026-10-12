use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{Value, json};

use crate::util::Res;
use crate::{prefs, tools};

pub const VENDOR: &[(&str, &str, &[&str])] = &[
    ("REDline", "RED R3D", &["REDline", "redline"]),
    ("ARRI Reference Tool", "ARRIRAW", &["art-cmd", "arri-reference-tool"]),
    ("Sony RAW Viewer", "Sony X-OCN and RAW", &["rawexporter"]),
];

pub fn is_bayer(info: &Value) -> bool {
    info["video"]["pixFmt"].as_str().map(|p| p.starts_with("bayer_")).unwrap_or(false)
}

pub fn develop(interp: &Value) -> Vec<String> {
    let stops = interp["rawExposure"].as_f64().unwrap_or(0.0).clamp(-8.0, 8.0);
    let gain = 2f64.powf(stops);
    let mut chain = vec!["format=rgb48le".to_string()];
    if interp["rawTransfer"].as_str() == Some("linear") {
        if stops.abs() > 1e-6 {
            chain.push(format!("lutrgb=r='clip(val*{gain:.6},0,maxval)':g='clip(val*{gain:.6},0,maxval)':b='clip(val*{gain:.6},0,maxval)'"));
        }
        return chain;
    }
    let e = format!("st(0,clip(val*{gain:.6}/maxval,0,1));if(lt(ld(0),0.018),4.5*ld(0),1.099*pow(ld(0),0.45)-0.099)*maxval");
    chain.push(format!("lutrgb=r='{e}':g='{e}':b='{e}'"));
    chain
}

pub fn decoder_for(path: &str) -> Option<Value> {
    let ext = Path::new(path).extension()?.to_string_lossy().to_lowercase();
    prefs::load()["rawDecoders"].as_array()?.iter().find(|d| d["extensions"].as_str().unwrap_or("").split([',', ' ']).any(|x| x.trim().trim_start_matches('.').eq_ignore_ascii_case(&ext))).cloned()
}

pub fn split(cmd: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut any = false;
    for c in cmd.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => cur.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                any = true;
            }
            (None, c) if c.is_whitespace() => {
                if any || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            (None, c) => cur.push(c),
        }
    }
    if any || !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn fill(t: &str, input: &str, folder: &Path, name: &str) -> String {
    t.replace("{input}", input).replace("{folder}", &folder.to_string_lossy()).replace("{name}", name)
}

pub struct Decoded {
    pub path: String,
    pub frame_rate: Option<f64>,
}

pub fn decode(path: &str, hook: &Value, work: &Path, report: &dyn Fn(f64, &str), stopped: &dyn Fn() -> bool) -> Res<Decoded> {
    let folder = work.join("raw");
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let name = Path::new(path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "raw".into());
    let template = hook["command"].as_str().filter(|c| !c.trim().is_empty()).ok_or("this raw decoder has no command")?;
    let args: Vec<String> = split(template).iter().map(|a| fill(a, path, &folder, &name)).collect();
    let program = tools::find(&args[0]).map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|| args[0].clone());
    report(0.02, &format!("decoding the raw source with {}", Path::new(&args[0]).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));
    let mut cmd = Command::new(&program);
    cmd.args(&args[1..]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("the raw decoder {program} could not start: {e}"))?;
    let mut tail: Vec<String> = Vec::new();
    if let Some(err) = child.stderr.take() {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            if stopped() {
                let _ = child.kill();
                break;
            }
            tail.push(line);
            if tail.len() > 20 {
                tail.remove(0);
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if stopped() {
        return Err("stopped".into());
    }
    if !status.success() {
        return Err(format!("the raw decoder failed ({}): {}", status.code().unwrap_or(-1), tail.last().cloned().unwrap_or_default()));
    }
    let out = fill(hook["output"].as_str().unwrap_or("{folder}/{name}_%06d.exr"), path, &folder, &name);
    let ok = if out.contains("%0") {
        let head = Path::new(&out).file_name().map(|n| n.to_string_lossy().split("%0").next().unwrap_or("").to_string()).unwrap_or_default();
        fs::read_dir(Path::new(&out).parent().unwrap_or(&folder)).map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().starts_with(&head))).unwrap_or(false)
    } else {
        Path::new(&out).is_file()
    };
    if !ok {
        return Err(format!("the raw decoder finished but {out} is not there; check the decoder's output setting"));
    }
    Ok(Decoded { path: out, frame_rate: hook["frameRate"].as_f64() })
}

pub fn vendor_listing() -> Value {
    Value::Array(
        VENDOR
            .iter()
            .map(|(label, formats, programs)| {
                let found = programs.iter().find_map(|p| tools::find(p));
                json!({"label": label, "formats": formats, "found": found.map(|p| p.to_string_lossy().into_owned())})
            })
            .collect(),
    )
}
