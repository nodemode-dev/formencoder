use std::fs;
use std::path::Path;
use std::process::Stdio;

use regex::Regex;
use serde_json::{Value, json};

use crate::util::{Res, now};
use crate::{ffmpeg, pipeline};

fn xml(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn write_xmp(output: &str, fields: &Value, format: &str, source: &str) -> Res<String> {
    let target = pipeline::sidecar_path(output, "xmp");
    let stamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let f = |k: &str| fields[k].as_str().unwrap_or("").to_string();
    let alt = |tag: &str, v: String| if v.is_empty() { String::new() } else { format!("   <dc:{tag}><rdf:Alt><rdf:li xml:lang=\"x-default\">{}</rdf:li></rdf:Alt></dc:{tag}>\n", xml(&v)) };
    let creator = if f("artist").is_empty() { f("author") } else { f("artist") };
    let keywords: Vec<String> = f("keywords").split(',').map(|k| k.trim().to_string()).filter(|k| !k.is_empty()).collect();
    let mut body = String::from("<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
    body.push_str("  <rdf:Description rdf:about=\"\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" xmlns:xmpDM=\"http://ns.adobe.com/xmp/1.0/DynamicMedia/\">\n");
    body.push_str(&format!("   <xmp:CreatorTool>formencoder</xmp:CreatorTool>\n   <xmp:CreateDate>{stamp}</xmp:CreateDate>\n   <xmp:MetadataDate>{stamp}</xmp:MetadataDate>\n"));
    body.push_str(&alt("title", f("title")));
    body.push_str(&alt("description", if f("description").is_empty() { f("comment") } else { f("description") }));
    body.push_str(&alt("rights", f("copyright")));
    if !creator.is_empty() {
        body.push_str(&format!("   <dc:creator><rdf:Seq><rdf:li>{}</rdf:li></rdf:Seq></dc:creator>\n", xml(&creator)));
    }
    if !keywords.is_empty() {
        body.push_str(&format!("   <dc:subject><rdf:Bag>{}</rdf:Bag></dc:subject>\n", keywords.iter().map(|k| format!("<rdf:li>{}</rdf:li>", xml(k))).collect::<String>()));
    }
    let src_name = Path::new(source).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    body.push_str(&format!("   <dc:format>{}</dc:format>\n   <xmpDM:source>{}</xmpDM:source>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>\n", xml(format), xml(&src_name)));
    fs::write(&target, body).map_err(|e| e.to_string())?;
    Ok(target)
}

pub fn write_loudness_report(output: &str, loud: &Value, after: &Value) -> Res<String> {
    let clean = output.replace("_%06d", "");
    let base = Path::new(&clean);
    let stem = base.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let folder = loud["reportFolder"].as_str().filter(|f| !f.trim().is_empty()).map(|f| crate::paths::expand(f));
    let target = match folder {
        Some(f) => Path::new(&f).join(format!("{stem}_loudness.xml")),
        None => base.with_file_name(format!("{stem}_loudness.xml")),
    };
    if let Some(p) = target.parent() {
        let _ = fs::create_dir_all(p);
    }
    let m = &loud["measured"];
    let g = |v: &Value| match v { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() };
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<LoudnessReport generator=\"formencoder\">\n  <File>{}</File>\n  <Standard>{}</Standard>\n  <TargetLoudness unit=\"LUFS\">{}</TargetLoudness>\n  <MaxTruePeak unit=\"dBTP\">{}</MaxTruePeak>\n  <Input>\n    <IntegratedLoudness unit=\"LUFS\">{}</IntegratedLoudness>\n    <LoudnessRange unit=\"LU\">{}</LoudnessRange>\n    <TruePeak unit=\"dBTP\">{}</TruePeak>\n  </Input>\n  <Output>\n    <IntegratedLoudness unit=\"LUFS\">{}</IntegratedLoudness>\n    <LoudnessRange unit=\"LU\">{}</LoudnessRange>\n    <TruePeak unit=\"dBFS\">{}</TruePeak>\n  </Output>\n</LoudnessReport>\n",
        xml(base.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default().as_str()),
        xml(&g(&loud["standard"])), g(&loud["target"]), g(&loud["truePeak"]),
        g(&m["input_i"]), g(&m["input_lra"]), g(&m["input_tp"]),
        g(&after["integrated"]), g(&after["lra"]), g(&after["truePeak"]),
    );
    fs::write(&target, body).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn analysis_path(path: &str) -> String {
    format!("{path}.feanalysis.json")
}

pub fn analyze(path: &str, report: &dyn Fn(f64, &str), cancelled: &dyn Fn() -> bool) -> Res {
    let info = ffmpeg::probe(path, None);
    let mut out = json!({"format": "formencoder.analysis/1", "source": path, "created": now(), "duration": info["duration"], "probe": ffmpeg::light(&info)});
    report(0.05, "probing");
    if !info["video"].is_null() {
        let o = ffmpeg::ff().args(["-hide_banner", "-nostats", "-i", path, "-map", "0:v:0", "-vf", "scale=320:-2,select='gt(scene,0.32)',metadata=print:file=-,blackdetect=d=0.2:pix_th=0.10", "-an", "-f", "null", "-"]).stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
        let so = String::from_utf8_lossy(&o.stdout);
        let se = String::from_utf8_lossy(&o.stderr);
        let scenes: Vec<f64> = Regex::new(r"pts_time:([\d.]+)").unwrap().captures_iter(&so).filter_map(|c| c[1].parse().ok()).collect();
        let black: Vec<Value> = Regex::new(r"black_start:([\d.]+) black_end:([\d.]+)").unwrap().captures_iter(&se).map(|c| json!({"start": c[1].parse::<f64>().unwrap_or(0.0), "end": c[2].parse::<f64>().unwrap_or(0.0)})).collect();
        out["scenes"] = json!(scenes);
        out["black"] = json!(black);
        report(0.6, "scenes");
    }
    if cancelled() {
        return Err("stopped".into());
    }
    if !info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        let o = ffmpeg::ff().args(["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "silencedetect=n=-45dB:d=0.6", "-f", "null", "-"]).stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
        let se = String::from_utf8_lossy(&o.stderr);
        let starts: Vec<f64> = Regex::new(r"silence_start: (-?[\d.]+)").unwrap().captures_iter(&se).filter_map(|c| c[1].parse().ok()).collect();
        let ends: Vec<f64> = Regex::new(r"silence_end: ([\d.]+)").unwrap().captures_iter(&se).filter_map(|c| c[1].parse().ok()).collect();
        out["silence"] = json!(starts.iter().zip(ends.iter()).map(|(a, b)| json!({"start": a.max(0.0), "end": b})).collect::<Vec<_>>());
        out["loudness"] = pipeline::measure_file(path);
        report(0.95, "audio");
    }
    let target = analysis_path(path);
    fs::write(&target, serde_json::to_string_pretty(&out).unwrap_or_default()).map_err(|e| e.to_string())?;
    report(1.0, "written");
    Ok(json!({"path": target, "scenes": out["scenes"].as_array().map(|a| a.len()).unwrap_or(0), "silences": out["silence"].as_array().map(|a| a.len()).unwrap_or(0), "loudness": out["loudness"]}))
}
