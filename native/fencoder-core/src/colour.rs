use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::paths;
use crate::util::Res;

pub const LUT_EXT: &[&str] = &["cube", "3dl", "dat", "m3d", "csp"];

pub fn lut_dir() -> PathBuf {
    paths::sub("luts")
}

pub fn bundled_dir() -> Option<PathBuf> {
    std::env::var("FORMENCODER_RESOURCES").ok().map(|r| PathBuf::from(r).join("luts")).filter(|p| p.is_dir())
}

pub fn listing() -> Vec<Value> {
    let mut out = Vec::new();
    let mut dirs = vec![("user", lut_dir())];
    if let Some(b) = bundled_dir() {
        dirs.insert(0, ("formencoder", b));
    }
    for (origin, dir) in dirs {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        let mut files: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| LUT_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false)).collect();
        files.sort();
        for f in files {
            out.push(json!({"name": f.file_stem().map(|s| s.to_string_lossy().into_owned()), "path": f.to_string_lossy(), "origin": origin}));
        }
    }
    out
}

pub fn resolve(name_or_path: &str) -> Option<PathBuf> {
    if name_or_path.is_empty() {
        return None;
    }
    let p = PathBuf::from(paths::expand(name_or_path));
    if p.is_file() {
        return Some(p);
    }
    listing().into_iter().find(|r| r["name"].as_str().map(|n| n.eq_ignore_ascii_case(name_or_path)).unwrap_or(false)).and_then(|r| r["path"].as_str().map(PathBuf::from))
}

pub fn install(path: &str) -> Res {
    let src = PathBuf::from(paths::expand(path));
    let ok = src.is_file() && src.extension().map(|e| LUT_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false);
    if !ok {
        return Err(format!("{path} is not a LUT ({})", LUT_EXT.join(", ")));
    }
    let dest = lut_dir().join(src.file_name().unwrap());
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(json!({"name": dest.file_stem().map(|s| s.to_string_lossy().into_owned()), "path": dest.to_string_lossy()}))
}

fn pq_eotf(e: f64) -> f64 {
    let (m1, m2, c1, c2, c3) = (0.1593017578125, 78.84375, 0.8359375, 18.8515625, 18.6875);
    let ep = e.max(0.0).powf(1.0 / m2);
    10000.0 * ((ep - c1).max(0.0) / (c2 - c3 * ep)).powf(1.0 / m1)
}

fn hlg_inverse(e: f64) -> f64 {
    let (a, b, c) = (0.17883277, 0.28466892, 0.55991073);
    if e <= 0.5 { e * e / 3.0 } else { (((e - c) / a).exp() + b) / 12.0 }
}

fn bt709_oetf(l: f64) -> f64 {
    let l = l.clamp(0.0, 1.0);
    if l < 0.018 { 4.5 * l } else { 1.099 * l.powf(0.45) - 0.099 }
}

const M2020_TO_709: [[f64; 3]; 3] = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];

fn tone(x: f64, knee: f64, white: f64) -> f64 {
    if x <= knee {
        return x;
    }
    let span = (white - knee).max(1e-6);
    knee + (1.0 - knee) * (1.0 - (-(x - knee) / span * 2.2).exp()) / (1.0 - (-2.2f64).exp())
}

pub fn sdr_conform_lut(transfer: &str, knee: f64, peak: f64, brightness: f64, contrast: f64) -> Res<PathBuf> {
    let size = 33;
    let key = format!("sdr_{transfer}_{}_{}_{}_{}_{size}.cube", knee as i64, peak as i64, brightness as i64, contrast as i64);
    let out = paths::sub("cache").join(key);
    if out.is_file() {
        return Ok(out);
    }
    let sdr_white = 203.0;
    let k = (knee / 100.0).clamp(0.3, 0.95);
    let white = (peak / sdr_white).max(1.05);
    let gain = 2f64.powf(brightness / 50.0);
    let mut text = String::new();
    let _ = writeln!(text, "TITLE \"formencoder SDR conform {transfer}\"\nLUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1");
    for bi in 0..size {
        for gi in 0..size {
            for ri in 0..size {
                let rgb = [ri as f64 / (size - 1) as f64, gi as f64 / (size - 1) as f64, bi as f64 / (size - 1) as f64];
                let lin: Vec<f64> = if transfer == "hlg" { rgb.iter().map(|c| hlg_inverse(*c) * 1000.0 / sdr_white).collect() } else { rgb.iter().map(|c| pq_eotf(*c) / sdr_white).collect() };
                let mut l709 = [0.0; 3];
                for (i, row) in M2020_TO_709.iter().enumerate() {
                    l709[i] = row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2];
                }
                let lum = 0.2126 * l709[0] + 0.7152 * l709[1] + 0.0722 * l709[2];
                let mapped = tone((lum * gain).max(0.0), k, white);
                let scale = if lum > 1e-6 { mapped / lum } else { 0.0 };
                let mut o: Vec<f64> = l709.iter().map(|c| (c * scale).max(0.0)).collect();
                let pk = o.iter().cloned().fold(0.0, f64::max);
                if pk > 1.0 {
                    o = o.iter().map(|c| c / pk).collect();
                }
                let mut enc: Vec<f64> = o.iter().map(|c| bt709_oetf(*c)).collect();
                if contrast != 0.0 {
                    let f = 1.0 + contrast / 100.0;
                    enc = enc.iter().map(|c| ((c - 0.5) * f + 0.5).clamp(0.0, 1.0)).collect();
                }
                let _ = writeln!(text, "{:.6} {:.6} {:.6}", enc[0], enc[1], enc[2]);
            }
        }
    }
    fs::write(&out, text).map_err(|e| e.to_string())?;
    Ok(out)
}

const M709_TO_XYZ: [[f64; 3]; 3] = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];

pub fn dcp_xyz_lut() -> Res<PathBuf> {
    let size = 65;
    let out = paths::sub("cache").join(format!("dcp_rec709_to_xyz_{size}.cube"));
    if out.is_file() {
        return Ok(out);
    }
    let mut text = String::new();
    let _ = writeln!(text, "TITLE \"formencoder Rec. 709 to DCI X'Y'Z'\"\nLUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1");
    let scale = 48.0 / 52.37;
    for bi in 0..size {
        for gi in 0..size {
            for ri in 0..size {
                let lin = [ri, gi, bi].map(|c| (c as f64 / (size - 1) as f64).powf(2.4));
                let enc: Vec<f64> = M709_TO_XYZ.iter().map(|row| ((row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]) * scale).clamp(0.0, 1.0).powf(1.0 / 2.6)).collect();
                let _ = writeln!(text, "{:.6} {:.6} {:.6}", enc[0], enc[1], enc[2]);
            }
        }
    }
    fs::write(&out, text).map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn tags(space: &str) -> Option<(&'static str, &'static str, &'static str)> {
    Some(match space {
        "rec709" => ("bt709", "bt709", "bt709"),
        "rec601" => ("smpte170m", "smpte170m", "smpte170m"),
        "rec2020" => ("bt2020", "bt2020-10", "bt2020nc"),
        "rec2100pq" => ("bt2020", "smpte2084", "bt2020nc"),
        "rec2100hlg" => ("bt2020", "arib-std-b67", "bt2020nc"),
        "p3d65" => ("smpte432", "bt709", "bt709"),
        _ => return None,
    })
}

pub fn tag_args(space: &str, video: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if space == "source" {
        for (k, flag) in [("colorPrimaries", "-color_primaries"), ("colorTransfer", "-color_trc"), ("colorSpace", "-colorspace")] {
            if let Some(v) = video[k].as_str().filter(|v| !v.is_empty() && *v != "unknown") {
                out.push(flag.to_string());
                out.push(v.to_string());
            }
        }
        return out;
    }
    if let Some((p, t, m)) = tags(space) {
        out = vec!["-color_primaries".into(), p.into(), "-color_trc".into(), t.into(), "-colorspace".into(), m.into()];
    }
    out
}

pub fn source_space(video: &Value) -> &'static str {
    let trc = video["colorTransfer"].as_str().unwrap_or("");
    let prim = video["colorPrimaries"].as_str().unwrap_or("");
    match (trc, prim) {
        ("smpte2084", _) => "rec2100pq",
        ("arib-std-b67", _) => "rec2100hlg",
        (_, "bt2020") => "rec2020",
        (_, "smpte170m" | "bt470bg") => "rec601",
        (_, "smpte432") => "p3d65",
        _ => "rec709",
    }
}

pub fn colorspace_name(space: &str) -> Option<&'static str> {
    match space {
        "rec709" => Some("bt709"),
        "rec601" => Some("smpte170m"),
        "rec2020" => Some("bt2020"),
        _ => None,
    }
}

pub fn esc(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").replace(':', "\\:").replace('\'', "'\\\\\\''")
}
