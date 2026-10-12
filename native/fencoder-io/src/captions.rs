use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;

use regex::Regex;
use serde_json::{Value, json};

use crate::ffmpeg;
use crate::util::Res;

#[derive(Clone, Debug)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

impl Cue {
    pub fn json(&self) -> Value {
        json!({"start": self.start, "end": self.end, "text": self.text})
    }
}

pub const FORMATS: &[(&str, &str)] = &[("srt", "SubRip (.srt)"), ("vtt", "WebVTT (.vtt)"), ("scc", "Scenarist (.scc, CEA-608)"), ("ttml", "TTML / DFXP (.xml)")];

pub fn sidecar_ext(fmt: &str) -> &'static str {
    match fmt {
        "vtt" => "vtt",
        "scc" => "scc",
        "ttml" => "xml",
        _ => "srt",
    }
}

fn r(pat: &'static str, cell: &'static OnceLock<Regex>) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pat).unwrap())
}

static TIME: OnceLock<Regex> = OnceLock::new();
static TAG: OnceLock<Regex> = OnceLock::new();
static P: OnceLock<Regex> = OnceLock::new();
static SCC_LINE: OnceLock<Regex> = OnceLock::new();

fn seconds(stamp: &str) -> Option<f64> {
    let c = r(r"^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$", &TIME).captures(stamp.trim())?;
    let h: f64 = c.get(1).map(|m| m.as_str().parse().unwrap_or(0.0)).unwrap_or(0.0);
    let frac = format!("{:0<3}", &c[4]);
    Some(h * 3600.0 + c[2].parse::<f64>().ok()? * 60.0 + c[3].parse::<f64>().ok()? + frac.parse::<f64>().ok()? / 1000.0)
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

pub fn parse(text: &str) -> Vec<Cue> {
    let body = text.trim_start_matches('\u{feff}').replace("\r\n", "\n").replace('\r', "\n");
    if body.trim_start().starts_with("Scenarist_SCC") {
        return parse_scc(&body);
    }
    if body.trim_start().starts_with('<') {
        return parse_ttml(&body);
    }
    let mut cues = Vec::new();
    for block in Regex::new(r"\n{2,}").unwrap().split(body.trim()) {
        let lines: Vec<&str> = block.split('\n').filter(|l| !l.trim().is_empty()).collect();
        if lines.is_empty() || ["WEBVTT", "NOTE", "STYLE", "REGION"].iter().any(|p| lines[0].starts_with(p)) {
            continue;
        }
        let Some(t) = lines.iter().position(|l| l.contains("-->")) else { continue };
        let (a, b) = lines[t].split_once("-->").unwrap();
        let b = b.trim().split(' ').next().unwrap_or("");
        let (Some(start), Some(end)) = (seconds(a), seconds(b)) else { continue };
        let content = lines[t + 1..].iter().map(|l| r(r"</?[^>]+>", &TAG).replace_all(l, "").to_string()).collect::<Vec<_>>().join("\n").trim().to_string();
        if !content.is_empty() && end > start {
            cues.push(Cue { start: round3(start), end: round3(end), text: content });
        }
    }
    cues
}

fn ttml_time(v: &str) -> Option<f64> {
    let v = v.trim();
    if let Some(ms) = v.strip_suffix("ms") {
        return ms.parse::<f64>().ok().map(|x| x / 1000.0);
    }
    if let Some(s) = v.strip_suffix('s') {
        return s.parse().ok();
    }
    let parts: Vec<&str> = v.split(':').collect();
    match parts.len() {
        3 => Some(parts[0].parse::<f64>().ok()? * 3600.0 + parts[1].parse::<f64>().ok()? * 60.0 + parts[2].parse::<f64>().ok()?),
        4 => Some(parts[0].parse::<f64>().ok()? * 3600.0 + parts[1].parse::<f64>().ok()? * 60.0 + parts[2].parse::<f64>().ok()? + parts[3].parse::<f64>().ok()? / 30.0),
        _ => v.parse().ok(),
    }
}

pub fn parse_ttml(text: &str) -> Vec<Cue> {
    let mut cues = Vec::new();
    let begin = Regex::new(r#"begin="([^"]+)""#).unwrap();
    let end = Regex::new(r#"end="([^"]+)""#).unwrap();
    for c in r(r"(?s)<p\b([^>]*)>(.*?)</p>", &P).captures_iter(text) {
        let attrs = &c[1];
        let (Some(b), Some(e)) = (begin.captures(attrs), end.captures(attrs)) else { continue };
        let inner = Regex::new(r"<br\s*/?>").unwrap().replace_all(&c[2], "\n").to_string();
        let content = r(r"</?[^>]+>", &TAG).replace_all(&inner, "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").trim().to_string();
        if let (Some(s), Some(t)) = (ttml_time(&b[1]), ttml_time(&e[1])) {
            if t > s && !content.is_empty() {
                cues.push(Cue { start: round3(s), end: round3(t), text: content });
            }
        }
    }
    cues
}

fn stamp(seconds: f64, comma: bool) -> String {
    let total = (seconds * 1000.0).round().max(0.0) as i64;
    let (h, rest) = (total / 3_600_000, total % 3_600_000);
    let (m, rest) = (rest / 60_000, rest % 60_000);
    let (s, ms) = (rest / 1000, rest % 1000);
    format!("{h:02}:{m:02}:{s:02}{}{ms:03}", if comma { ',' } else { '.' })
}

fn xml(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn write(cues: &[Cue], fmt: &str, language: &str) -> String {
    let mut ordered = cues.to_vec();
    ordered.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    match fmt {
        "scc" => write_scc(&ordered),
        "ttml" => {
            let rows: Vec<String> = ordered.iter().map(|c| format!("      <p begin=\"{}\" end=\"{}\">{}</p>", stamp(c.start, false), stamp(c.end, false), c.text.split('\n').map(xml).collect::<Vec<_>>().join("<br/>"))).collect();
            format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<tt xmlns=\"http://www.w3.org/ns/ttml\" xml:lang=\"{}\">\n  <body>\n    <div>\n{}\n    </div>\n  </body>\n</tt>\n", xml(language), rows.join("\n"))
        }
        _ => {
            let srt = fmt != "vtt";
            let blocks: Vec<String> = ordered.iter().enumerate().map(|(i, c)| format!("{}{} --> {}\n{}", if srt { format!("{}\n", i + 1) } else { String::new() }, stamp(c.start, srt), stamp(c.end, srt), c.text.trim())).collect();
            let body = blocks.join("\n\n");
            if srt { format!("{body}\n") } else { format!("WEBVTT\n\n{body}\n") }
        }
    }
}

const SCC_FPS: f64 = 30000.0 / 1001.0;
const SCC_ROW: usize = 32;

fn odd(b: u8) -> u8 {
    if b.count_ones() % 2 == 0 { b | 0x80 } else { b }
}

fn word(a: u8, b: u8) -> String {
    format!("{:02x}{:02x}", odd(a), odd(b))
}

fn special(c: char) -> Option<u8> {
    Some(match c {
        'á' => 0x2A,
        'é' => 0x5C,
        'í' => 0x5E,
        'ó' => 0x5F,
        'ú' => 0x60,
        'ç' => 0x7B,
        '÷' => 0x7C,
        'Ñ' => 0x7D,
        'ñ' => 0x7E,
        _ => return None,
    })
}

fn decode_special(b: u8) -> Option<char> {
    Some(match b {
        0x2A => 'á',
        0x5C => 'é',
        0x5E => 'í',
        0x5F => 'ó',
        0x60 => 'ú',
        0x7B => 'ç',
        0x7C => '÷',
        0x7D => 'Ñ',
        0x7E => 'ñ',
        _ => return None,
    })
}

fn stand_in(c: char) -> char {
    match c {
        '*' | '^' | '_' | '~' => '-',
        '\\' | '|' => '/',
        '`' => '\'',
        '{' => '(',
        '}' => ')',
        _ => c,
    }
}

fn scc_text(line: &str) -> Vec<String> {
    let mut codes: Vec<u8> = Vec::new();
    for orig in line.chars() {
        let c = stand_in(orig);
        if let Some(code) = special(c) {
            codes.push(code);
        } else if c.is_ascii() && (0x20..0x7f).contains(&(c as u32)) {
            codes.push(c as u8);
        }
    }
    if codes.len() % 2 == 1 {
        codes.push(0);
    }
    codes.chunks(2).map(|p| word(p[0], p[1])).collect()
}

fn scc_rows(text: &str) -> Vec<String> {
    let mut rows = Vec::new();
    for para in text.split('\n') {
        let mut line = String::new();
        for w in para.split_whitespace() {
            let mut rest = w.to_string();
            while rest.chars().count() > SCC_ROW {
                if !line.is_empty() {
                    rows.push(std::mem::take(&mut line));
                }
                rows.push(rest.chars().take(SCC_ROW).collect());
                rest = rest.chars().skip(SCC_ROW).collect();
            }
            if !line.is_empty() && line.chars().count() + 1 + rest.chars().count() > SCC_ROW {
                rows.push(std::mem::replace(&mut line, rest));
            } else {
                line = format!("{line} {rest}").trim().to_string();
            }
        }
        if !line.is_empty() {
            rows.push(line);
        }
    }
    rows
}

fn df_timecode(frames: i64) -> String {
    let frames = frames.max(0);
    let (tens, rest) = (frames / 17982, frames % 17982);
    let f = frames + 18 * tens + if rest > 1 { 2 * ((rest - 2) / 1798) } else { 0 };
    format!("{:02}:{:02}:{:02};{:02}", f / 108000, f / 1800 % 60, f / 30 % 60, f % 30)
}

fn df_frames(h: i64, m: i64, s: i64, f: i64, drop: bool) -> i64 {
    let mut total = ((h * 60 + m) * 60 + s) * 30 + f;
    if drop {
        let whole = h * 60 + m;
        total -= 2 * (whole - whole / 10);
    }
    total
}

pub fn write_scc(cues: &[Cue]) -> String {
    let (rcl, enm, eoc, edm) = (word(0x14, 0x20), word(0x14, 0x2E), word(0x14, 0x2F), word(0x14, 0x2C));
    let (row14, row15) = (word(0x14, 0x50), word(0x14, 0x70));
    let mut caps: Vec<(i64, i64, Vec<String>)> = Vec::new();
    for c in cues {
        let rows = { let r = scc_rows(&c.text); if r.is_empty() { vec![String::new()] } else { r } };
        let chunks: Vec<&[String]> = rows.chunks(2).collect();
        let span = (c.end - c.start) / chunks.len() as f64;
        for (n, chunk) in chunks.iter().enumerate() {
            let mut words = vec![enm.clone(), enm.clone(), rcl.clone(), rcl.clone()];
            for (ri, line) in chunk.iter().enumerate() {
                let pac = if chunk.len() == 2 && ri == 0 { row14.clone() } else { row15.clone() };
                words.push(pac.clone());
                words.push(pac);
                words.extend(scc_text(line));
            }
            words.push(eoc.clone());
            words.push(eoc.clone());
            let start = c.start + n as f64 * span;
            caps.push(((start * SCC_FPS).round() as i64, ((start + span) * SCC_FPS).round() as i64, words));
        }
    }
    let mut lines = vec!["Scenarist_SCC V1.0".to_string(), String::new()];
    let mut busy = 0i64;
    for i in 0..caps.len() {
        let (show, end, words) = &caps[i];
        let load = (show - (words.len() as i64 - 2)).max(busy);
        lines.push(format!("{}\t{}", df_timecode(load), words.join(" ")));
        lines.push(String::new());
        busy = load + words.len() as i64;
        let following = caps.get(i + 1).map(|c| c.0);
        if following.map(|f| f > end + 1).unwrap_or(true) {
            let at = (*end).max(busy);
            lines.push(format!("{}\t{edm} {edm}", df_timecode(at)));
            lines.push(String::new());
            busy = at + 2;
        }
    }
    lines.join("\n")
}

pub fn parse_scc(text: &str) -> Vec<Cue> {
    let mut cues = Vec::new();
    let mut hidden: Vec<String> = Vec::new();
    let mut shown: Option<(String, f64)> = None;
    let mut last: Option<(u8, u8)> = None;
    let mut at = 0.0;
    let re = r(r"^(\d\d):(\d\d):(\d\d)([:;.,])(\d\d)\s+(.+)$", &SCC_LINE);
    for raw in text.lines() {
        let Some(c) = re.captures(raw.trim()) else { continue };
        let n = |i: usize| c[i].parse::<i64>().unwrap_or(0);
        let frame = df_frames(n(1), n(2), n(3), n(5), matches!(&c[4], ";" | ","));
        for (k, w) in c[6].split_whitespace().enumerate() {
            at = (frame + k as i64) as f64 / SCC_FPS;
            if w.len() < 4 {
                continue;
            }
            let (Ok(a), Ok(b)) = (u8::from_str_radix(&w[0..2], 16), u8::from_str_radix(&w[2..4], 16)) else { continue };
            let (a, b) = (a & 0x7f, b & 0x7f);
            if (0x10..=0x1f).contains(&a) {
                if last == Some((a, b)) {
                    last = None;
                    continue;
                }
                last = Some((a, b));
                if (a == 0x14 || a == 0x15) && (0x20..=0x2f).contains(&b) {
                    if b == 0x2e {
                        hidden.clear();
                    } else if b == 0x2f {
                        if let Some((t, s)) = shown.take() {
                            cues.push(Cue { start: round3(s), end: round3(at), text: t });
                        }
                        let content = hidden.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n");
                        if !content.is_empty() {
                            shown = Some((content, at));
                        }
                        hidden.clear();
                    } else if b == 0x2c {
                        if let Some((t, s)) = shown.take() {
                            cues.push(Cue { start: round3(s), end: round3(at), text: t });
                        }
                    }
                } else if a <= 0x17 && b >= 0x40 {
                    hidden.push(String::new());
                }
                continue;
            }
            last = None;
            for code in [a, b] {
                if code >= 0x20 {
                    if hidden.is_empty() {
                        hidden.push(String::new());
                    }
                    let ch = decode_special(code).unwrap_or(code as char);
                    hidden.last_mut().unwrap().push(ch);
                }
            }
        }
    }
    if let Some((t, s)) = shown {
        cues.push(Cue { start: round3(s), end: round3(at + 2.0), text: t });
    }
    cues.into_iter().filter(|c| c.end > c.start && !c.text.is_empty()).collect()
}

pub fn read_file(path: &str) -> Res<Vec<Cue>> {
    let bytes = fs::read(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    Ok(parse(&String::from_utf8_lossy(&bytes)))
}

pub fn sidecar_for(source: &str) -> Option<PathBuf> {
    let p = Path::new(source);
    let stem = p.file_stem()?.to_string_lossy().into_owned();
    let dir = p.parent()?;
    for ext in ["srt", "vtt", "scc", "xml", "ttml", "dfxp"] {
        for cand in [dir.join(format!("{stem}.{ext}")), dir.join(format!("{stem}.en.{ext}"))] {
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

pub fn extract_embedded(source: &str, info: &Value) -> Vec<Cue> {
    let Some(first) = info["subtitles"].as_array().and_then(|a| a.first()) else { return Vec::new() };
    let index = first["index"].as_i64().unwrap_or(0);
    let out = ffmpeg::ff().args(["-v", "error", "-i", source, "-map", &format!("0:{index}"), "-f", "srt", "-"]).stdin(Stdio::null()).output();
    match out {
        Ok(o) if o.status.success() => parse(&String::from_utf8_lossy(&o.stdout)),
        _ => Vec::new(),
    }
}

pub fn resolve(source: &str, info: &Value, spec: Option<&str>) -> Res<(Vec<Cue>, String)> {
    if let Some(s) = spec.filter(|s| !s.is_empty() && *s != "auto") {
        let p = crate::paths::expand(s);
        if !Path::new(&p).is_file() {
            return Err(format!("no caption file at {s}"));
        }
        return Ok((read_file(&p)?, p));
    }
    if let Some(side) = sidecar_for(source) {
        let p = side.to_string_lossy().into_owned();
        return Ok((read_file(&p)?, p));
    }
    let cues = extract_embedded(source, info);
    let origin = if cues.is_empty() { String::new() } else { "embedded".into() };
    Ok((cues, origin))
}

pub fn shift(cues: &[Cue], start: f64, end: Option<f64>, factor: f64) -> Vec<Cue> {
    let mut out = Vec::new();
    for c in cues {
        if end.map(|e| c.start >= e).unwrap_or(false) || c.end <= start {
            continue;
        }
        let a = (c.start.max(start) - start) * factor;
        let b = (end.map(|e| c.end.min(e)).unwrap_or(c.end) - start) * factor;
        if b > a {
            out.push(Cue { start: round3(a), end: round3(b), text: c.text.clone() });
        }
    }
    out
}
