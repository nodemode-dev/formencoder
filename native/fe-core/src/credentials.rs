use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use crate::util::Res;
use crate::{paths, tools};

pub const SUPPORTED: &[&str] = &["mp4", "mov", "m4a", "m4v", "jpg", "jpeg", "png", "tif", "tiff", "webp", "wav", "mp3", "avi", "gif", "heic", "heif", "avif"];
pub const ALGORITHMS: &[&str] = &["es256", "es384", "es512", "ps256", "ps384", "ps512", "ed25519"];

pub fn default() -> Value {
    json!({"enabled": false, "author": "", "certificate": "", "privateKey": "", "algorithm": "es256", "tsa": "", "includeSource": true})
}

pub fn wanted(s: &Value) -> bool {
    s["contentCredentials"]["enabled"].as_bool().unwrap_or(false)
}

fn ext(path: &str) -> String {
    Path::new(path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

pub fn supported(path: &str) -> bool {
    SUPPORTED.contains(&ext(path).as_str())
}

pub fn sign(file: &str, source: &str, s: &Value, work: &Path) -> Res<Vec<String>> {
    let tool = tools::require("c2patool", "Content Credentials")?;
    let cc = &s["contentCredentials"];
    let mut notes = Vec::new();
    let version = crate::VERSION;
    let title = Path::new(file).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut assertions = vec![json!({"label": "c2pa.actions", "data": {"actions": [
        {"action": if source.is_empty() { "c2pa.created" } else { "c2pa.transcoded" }, "softwareAgent": {"name": "formencoder", "version": version}, "when": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()}
    ]}})];
    let author = cc["author"].as_str().unwrap_or("").trim();
    if !author.is_empty() {
        assertions.push(json!({"label": "stds.schema-org.CreativeWork", "data": {"@context": "https://schema.org", "@type": "CreativeWork", "author": [{"@type": "Person", "name": author}]}}));
    }
    let mut manifest = json!({"claim_generator_info": [{"name": "formencoder", "version": version}], "title": title, "assertions": assertions});
    let cert = cc["certificate"].as_str().map(|p| paths::expand(p.trim())).filter(|p| !p.is_empty());
    let key = cc["privateKey"].as_str().map(|p| paths::expand(p.trim())).filter(|p| !p.is_empty());
    match (&cert, &key) {
        (Some(c), Some(k)) => {
            if !Path::new(c).is_file() || !Path::new(k).is_file() {
                return Err("the Content Credentials certificate or private key file was not found".into());
            }
            manifest["sign_cert"] = json!(c);
            manifest["private_key"] = json!(k);
            manifest["alg"] = json!(cc["algorithm"].as_str().filter(|a| ALGORITHMS.contains(a)).unwrap_or("es256"));
            if let Some(t) = cc["tsa"].as_str().map(str::trim).filter(|t| !t.is_empty()) {
                manifest["ta_url"] = json!(t);
            }
        }
        (None, None) => notes.push("Content Credentials signed with c2patool's built-in test certificate, which viewers show as untrusted; set a certificate and private key to sign as yourself".to_string()),
        _ => return Err("Content Credentials needs both a certificate chain and its private key, or neither".into()),
    }
    let _ = fs::create_dir_all(work);
    let mpath = work.join("c2pa_manifest.json");
    fs::write(&mpath, serde_json::to_string_pretty(&manifest).unwrap_or_default()).map_err(|e| e.to_string())?;
    let p = Path::new(file);
    let signed = p.with_file_name(format!(".{}.c2pa.{}", p.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(), ext(file)));
    let mut args: Vec<String> = vec![file.to_string(), "-m".into(), mpath.to_string_lossy().into_owned(), "-o".into(), signed.to_string_lossy().into_owned(), "-f".into()];
    if cc["includeSource"].as_bool().unwrap_or(true) && !source.is_empty() && supported(source) && Path::new(source).is_file() {
        args.extend(["-p".into(), source.to_string()]);
    }
    let r = tools::run(&tool, &args, Some(work));
    if r.is_err() {
        let _ = fs::remove_file(&signed);
    }
    r?;
    fs::rename(&signed, file).map_err(|e| format!("cannot move the signed file into place at {file}: {e}"))?;
    Ok(notes)
}

pub fn read(file: &str) -> Option<Value> {
    let tool = tools::find("c2patool")?;
    let out = tools::run(&tool, &[file.to_string()], None).ok()?;
    let start = out.find('{')?;
    serde_json::from_str::<Value>(&out[start..]).ok()
}

pub fn check(file: &str) -> Value {
    match read(file) {
        Some(store) => {
            let active = store["active_manifest"].as_str().unwrap_or("").to_string();
            let m = &store["manifests"][&active];
            let generator = m["claim_generator_info"][0]["name"].as_str().or(m["claim_generator"].as_str()).unwrap_or("").to_string();
            let issues: Vec<String> = store["validation_status"].as_array().map(|a| a.iter().filter_map(|v| v["code"].as_str().map(String::from)).collect()).unwrap_or_default();
            let only_trust = issues.iter().all(|c| c == "signingCredential.untrusted");
            json!({"present": !active.is_empty(), "generator": generator, "issuer": m["signature_info"]["issuer"], "issues": issues, "valid": !active.is_empty() && only_trust})
        }
        None => json!({"present": false}),
    }
}
