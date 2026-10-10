use std::collections::VecDeque;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use md5::{Digest, Md5};
use serde_json::{Value, json};

use crate::pipeline::{self, BuildOptions, Measured, Plan, Source};
use crate::util::{Res, now};
use crate::{ffmpeg, paths, settings, sidecars, wrap};

const DECODE_ERRORS: &[&str] = &["error while decoding", "Invalid NAL", "corrupt decoded frame", "concealing", "decode_slice_header error"];

#[derive(Default)]
pub struct Shared {
    pub updates: Vec<Value>,
    pub result: Option<Value>,
    pub pid: Option<u32>,
    pub stop: bool,
    pub paused: bool,
    pub throttled: bool,
    pub family: Option<Result<Value, String>>,
    pub requests: Vec<Value>,
}

pub struct Job {
    pub oid: String,
    pub item_id: String,
    pub shared: Arc<Mutex<Shared>>,
    pub handle: Option<JoinHandle<()>>,
}

impl Job {
    pub fn finished(&self) -> bool {
        self.shared.lock().unwrap().result.is_some()
    }

    pub fn stop(&self) {
        let pid = {
            let mut s = self.shared.lock().unwrap();
            s.stop = true;
            s.pid
        };
        if let Some(pid) = pid {
            let held = {
                let s = self.shared.lock().unwrap();
                s.paused || s.throttled
            };
            if held {
                suspend(pid, false);
            }
            kill(pid);
        }
    }

    pub fn pause(&self, on: bool) {
        let pid = {
            let mut s = self.shared.lock().unwrap();
            if s.paused == on {
                return;
            }
            s.paused = on;
            s.updates.push(json!({"status": if on { "paused" } else { "encoding" }}));
            if !on && s.throttled { None } else { s.pid }
        };
        if let Some(pid) = pid {
            suspend(pid, on);
        }
    }
}

#[cfg(unix)]
fn suspend(pid: u32, on: bool) {
    unsafe {
        libc::kill(pid as i32, if on { libc::SIGSTOP } else { libc::SIGCONT });
    }
}

#[cfg(unix)]
fn kill(pid: u32) {
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn suspend(pid: u32, on: bool) {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next};
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, SuspendThread, THREAD_SUSPEND_RESUME};
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snap == INVALID_HANDLE_VALUE {
            return;
        }
        let mut entry: THREADENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        let mut ok = Thread32First(snap, &mut entry);
        while ok != 0 {
            if entry.th32OwnerProcessID == pid {
                let h = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                if !h.is_null() {
                    if on {
                        SuspendThread(h);
                    } else {
                        ResumeThread(h);
                    }
                    CloseHandle(h);
                }
            }
            ok = Thread32Next(snap, &mut entry);
        }
        CloseHandle(snap);
    }
}

#[cfg(windows)]
fn kill(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess};
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !h.is_null() {
            TerminateProcess(h, 1);
            CloseHandle(h);
        }
    }
}

struct Ctx {
    oid: String,
    shared: Arc<Mutex<Shared>>,
    started: Instant,
    paused_for: Duration,
    tail: Arc<Mutex<VecDeque<String>>>,
    prefs: Value,
}

impl Ctx {
    fn stopped(&self) -> bool {
        self.shared.lock().unwrap().stop
    }

    fn push(&self, v: Value) {
        self.shared.lock().unwrap().updates.push(v);
    }

    fn report(&self, frac: f64, message: &str) {
        let elapsed = self.started.elapsed().saturating_sub(self.paused_for).as_secs_f64();
        let f = frac.clamp(0.0, 1.0);
        let eta = if f > 0.01 { Some(elapsed / f - elapsed) } else { None };
        self.push(json!({"progress": (f * 10000.0).round() / 10000.0, "message": message, "elapsed": (elapsed * 100.0).round() / 100.0, "eta": eta.map(|e| (e * 10.0).round() / 10.0)}));
    }
}

pub fn start(item: Value, output: Value, out_path: String, prefs: Value) -> Job {
    let shared = Arc::new(Mutex::new(Shared::default()));
    let oid = output["id"].as_str().unwrap_or("").to_string();
    let item_id = item["id"].as_str().unwrap_or("").to_string();
    let ctx = Ctx { oid: oid.clone(), shared: shared.clone(), started: Instant::now(), paused_for: Duration::ZERO, tail: Arc::new(Mutex::new(VecDeque::new())), prefs };
    let handle = thread::Builder::new().name(format!("formencoder-job-{oid}")).spawn(move || run(ctx, item, output, out_path)).ok();
    Job { oid, item_id, shared, handle }
}

fn run(ctx: Ctx, item: Value, output: Value, out_path: String) {
    let started = now();
    let kind = output["kind"].as_str().unwrap_or("encode").to_string();
    let outcome: Res = match kind.as_str() {
        "copy" => copy(&ctx, &item, &output),
        "analysis" => {
            let c2 = &ctx;
            sidecars::analyze(item["path"].as_str().unwrap_or(""), &|f, m| c2.report(f, m), &|| c2.stopped())
        }
        _ => encode(&ctx, &item, &output, &out_path),
    };
    let mut rt = match outcome {
        Ok(v) => {
            let mut v = v;
            v["status"] = json!("done");
            v["progress"] = json!(1.0);
            v
        }
        Err(e) => {
            if ctx.stopped() {
                json!({"status": "stopped", "error": "stopped by the user"})
            } else {
                let tail: Vec<String> = ctx.tail.lock().unwrap().iter().rev().take(12).rev().cloned().collect();
                json!({"status": "failed", "error": e, "ffmpeg": tail.join("\n")})
            }
        }
    };
    rt["started"] = json!(started);
    rt["finished"] = json!(now());
    rt["elapsed"] = json!((ctx.started.elapsed().as_secs_f64() * 100.0).round() / 100.0);
    let mut s = ctx.shared.lock().unwrap();
    s.pid = None;
    s.result = Some(rt);
}

fn wait_family(ctx: &Ctx, item: &Value) -> Res {
    ctx.push(json!({"status": "preparing", "message": format!("asking {} for the media", item["family"]["app"].as_str().unwrap_or("the app"))}));
    ctx.shared.lock().unwrap().requests.push(json!({"type": "familyRequest", "output": ctx.oid, "item": item["id"], "spec": item["family"]}));
    loop {
        if ctx.stopped() {
            return Err("stopped".into());
        }
        if let Some(r) = ctx.shared.lock().unwrap().family.take() {
            return r;
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn source_for(ctx: &Ctx, item: &Value) -> Res<(Source, Option<String>)> {
    let kind = item["kind"].as_str().unwrap_or("file");
    if kind == "family" {
        let got = wait_family(ctx, item)?;
        if let Some(pattern) = got["pattern"].as_str() {
            let fr = got["frameRate"].as_f64().unwrap_or(30.0);
            let count = got["count"].as_i64().unwrap_or(1);
            let mut info = ffmpeg::probe(pattern, Some(fr));
            info["kind"] = json!("sequence");
            info["sequence"] = json!({"pattern": pattern, "first": 0, "count": count});
            info["duration"] = json!(count as f64 / fr);
            if !info["video"].is_null() {
                info["video"]["fps"] = json!(fr);
            }
            let audio = got["audio"].as_str().map(String::from);
            if let Some(a) = &audio {
                info["audio"] = ffmpeg::probe(a, None)["audio"].clone();
            }
            let src = Source { path: pattern.into(), info, interpret: json!({"frameRate": fr}), range: json!({}), audio_path: audio, stitch: vec![] };
            return Ok((src, got["folder"].as_str().map(String::from)));
        }
        let path = got["path"].as_str().ok_or("the family app returned no media")?.to_string();
        let info = ffmpeg::probe(&path, None);
        return Ok((Source { path, info, interpret: item["interpret"].clone(), range: item["range"].clone(), audio_path: None, stitch: vec![] }, got["folder"].as_str().map(String::from)));
    }
    if kind == "stitch" {
        let parts: Vec<(String, Value)> = item["stitch"].as_array().cloned().unwrap_or_default().iter().filter_map(|p| p.as_str()).map(|p| (p.to_string(), ffmpeg::probe(p, None))).collect();
        let mut info = parts.first().map(|p| p.1.clone()).unwrap_or(json!({}));
        info["duration"] = json!(parts.iter().map(|p| p.1["duration"].as_f64().unwrap_or(0.0)).sum::<f64>());
        return Ok((Source { path: item["path"].as_str().unwrap_or("").into(), info, interpret: json!({}), range: json!({}), audio_path: None, stitch: parts }, None));
    }
    let path = item["path"].as_str().unwrap_or("").to_string();
    let fr = item["interpret"]["frameRate"].as_f64();
    let info = if kind == "sequence" { ffmpeg::probe(&path, fr.or(Some(25.0))) } else { ffmpeg::probe(&path, None) };
    if info.get("error").is_some() && info["video"].is_null() && info["audio"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return Err(format!("ffmpeg cannot read {}: {}", Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), info["error"].as_str().unwrap_or("")));
    }
    Ok((Source { path, info, interpret: item["interpret"].clone(), range: item["range"].clone(), audio_path: None, stitch: vec![] }, None))
}

fn encode(ctx: &Ctx, item: &Value, output: &Value, planned_path: &str) -> Res {
    let mut s = settings::normalize(&output["settings"])?;
    let (src, tmp) = source_for(ctx, item)?;
    let base = if item["kind"] == "family" { 0.3 } else { 0.0 };
    if let Some(mb) = s["maxFileSize"].as_f64().filter(|x| *x > 0.0) {
        pipeline::cap_bitrate(&mut s, &src.info, mb, &src.range);
    }
    let mut out_path = planned_path.to_string();
    if !out_path.contains("%0") && ctx.prefs["incrementNames"].as_bool().unwrap_or(true) {
        out_path = pipeline::unique_path(&out_path);
    }
    if let Some(p) = Path::new(&out_path).parent() {
        fs::create_dir_all(p).map_err(|e| format!("cannot create the output folder {}: {e}", p.display()))?;
    }
    let work = paths::sub("cache").join("jobs").join(&ctx.oid);
    let _ = fs::remove_dir_all(&work);
    let _ = fs::create_dir_all(&work);
    ctx.report(base, "measuring");
    let mut measured = Measured::default();
    let (a, b) = pipeline::range_of(&s, &src.info, &src.range)?;
    let dur = (b - a).max(0.0);
    let factor = pipeline::tuner_factor(&s, dur);
    if (factor - 1.0).abs() > 1e-6 && src.info["kind"] == "video" && src.stitch.is_empty() {
        let g = pipeline::geometry(&src.info, &s, &src.interpret);
        let fps = pipeline::out_fps(&s, &g, &src.info);
        let change = ((1.0 - factor).abs() * dur * fps).round() as i64;
        measured.tuner_frames = pipeline::tuner_frames(&src.path, a, dur, fps, change, s["effects"]["timeTuner"]["skipSlates"].as_f64().unwrap_or(0.0));
    }
    let loud = &s["effects"]["loudness"];
    if loud["enabled"].as_bool().unwrap_or(false) && loud["mode"].as_str().unwrap_or("twopass") == "twopass" && s["exportAudio"].as_bool().unwrap_or(true) {
        if let Some((inputs, filter)) = pipeline::loudness_measure_inputs(&src, &s) {
            measured.loudness = pipeline::measure_loudness(&inputs, &filter);
        }
    }
    if ctx.stopped() {
        return Err("stopped".into());
    }
    let opt = BuildOptions { preview_at: None, preview_width: None, still_duration: ctx.prefs["stillDuration"].as_f64().unwrap_or(5.0), threads: ctx.prefs["threads"].as_i64().unwrap_or(0), measured: &measured };
    let package = wrap::kind(&s);
    if let Some(k) = package {
        wrap::required_tool(k)?;
    }
    let target = match package {
        Some(k) => wrap::essence_path(k, &work),
        None => out_path.clone(),
    };
    let mut plan = pipeline::build(&src, &s, &target, &work, &opt)?;
    ctx.push(json!({"status": "encoding", "path": out_path, "encoder": plan.encoder, "audioEncoder": plan.audio_encoder, "command": plan.command_line(), "notes": plan.notes,
                    "duration": plan.duration, "frames": plan.frames, "width": plan.width, "height": plan.height, "fps": plan.fps, "summary": settings::summary(&s, &src.info)}));
    let part_path = if out_path.contains("%0") || package.is_some() {
        None
    } else {
        let p = Path::new(&out_path);
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        Some(p.with_file_name(format!(".{name}.fe-part{ext}")).to_string_lossy().into_owned())
    };
    if let Some(part) = &part_path {
        for pass in plan.passes.iter_mut().chain(plan.post.iter_mut()) {
            for a in pass.iter_mut() {
                if *a == out_path {
                    *a = part.clone();
                }
            }
        }
    }
    let j2k = if package == Some("dcp") {
        let held = ctx.shared.clone();
        let throttle: wrap::Throttle = Arc::new(move |on| {
            let mut s = held.lock().unwrap();
            s.throttled = on;
            if let Some(pid) = s.pid {
                if !s.paused {
                    suspend(pid, on);
                }
            }
        });
        let watch = ctx.shared.clone();
        let stopped: wrap::Stopped = Arc::new(move || watch.lock().unwrap().stop);
        let dir = Path::new(&target).parent().unwrap_or(&work).to_path_buf();
        Some(wrap::J2k::start(dir, plan.width, plan.height, plan.fps, throttle, stopped)?)
    } else {
        None
    };
    let encoded = encode_passes(ctx, &plan, base);
    let j2k_done = j2k.map(|j| {
        ctx.report(0.94, "finishing the JPEG 2000 frames");
        j.finish(encoded.is_ok())
    });
    if let Some(part) = &part_path {
        if encoded.is_ok() && Path::new(part).is_file() {
            fs::rename(part, &out_path).map_err(|e| format!("cannot move the finished file into place at {out_path}: {e}"))?;
        } else {
            let _ = fs::remove_file(part);
        }
    }
    encoded?;
    if let Some(r) = j2k_done {
        r?;
    }
    if crate::vr::wanted(&s) && ["mp4", "mov"].contains(&s["multiplexer"]["container"].as_str().unwrap_or("")) && Path::new(&out_path).is_file() {
        crate::vr::inject(&out_path, &crate::vr::xml(&s, plan.width, plan.height)).map_err(|e| format!("could not write the VR metadata: {e}"))?;
    }
    let mut files: Vec<String> = Vec::new();
    if let Some(k) = package {
        let probe = if k == "dcp" { json!({}) } else { ffmpeg::probe(&target, None) };
        let start_tc = probe["timecode"].as_str().map(String::from).or_else(|| s["startTimecode"].as_str().map(String::from)).unwrap_or_else(|| "00:00:00:00".into());
        let frames = probe["duration"].as_f64().map(|d| (d * plan.fps).round() as i64).filter(|f| *f > 0).unwrap_or(plan.frames);
        let report = |f: f64, m: &str| ctx.report(base + (1.0 - base) * f, m);
        let job = wrap::Job { s: &s, essence: &target, out: &out_path, frames, fps: plan.fps, width: plan.width, height: plan.height, start_tc: &start_tc, report: &report };
        files = wrap::finish(k, &job)?;
    } else if out_path.contains("%0") {
        let p = Path::new(&out_path);
        let stem = p.file_name().map(|n| n.to_string_lossy().split("%0").next().unwrap_or("").to_string()).unwrap_or_default();
        if let Ok(rd) = fs::read_dir(p.parent().unwrap_or(Path::new("."))) {
            let mut v: Vec<String> = rd.flatten().filter(|e| e.file_name().to_string_lossy().starts_with(&stem)).map(|e| e.path().to_string_lossy().into_owned()).collect();
            v.sort();
            files = v;
        }
    } else if Path::new(&out_path).is_file() {
        files.push(out_path.clone());
    }
    files.extend(plan.extra_outputs.iter().filter(|f| Path::new(f).is_file()).cloned());
    if files.is_empty() {
        return Err("ffmpeg finished but wrote no file".into());
    }
    let mut written = Vec::new();
    for (p, text) in &plan.sidecars {
        fs::write(p, text).map_err(|e| e.to_string())?;
        written.push(p.clone());
    }
    if s["metadata"]["xmpSidecar"].as_bool().unwrap_or(false) {
        let fields: serde_json::Map<String, Value> = crate::metadata::resolve(&s["metadata"], &src.info["tags"], src.stitch.is_empty()).into_iter().map(|(k, v)| (k, json!(v))).collect();
        written.push(sidecars::write_xmp(&out_path, &Value::Object(fields), s["format"].as_str().unwrap_or(""), item["path"].as_str().unwrap_or(""))?);
    }
    let bytes: u64 = files.iter().take(5000).filter_map(|f| fs::metadata(f).ok()).map(|m| m.len()).sum();
    let mut result = json!({"path": out_path, "files": files.iter().take(2000).collect::<Vec<_>>(), "count": files.len(), "sidecars": written, "bytes": bytes, "notes": plan.notes,
                            "encoder": plan.encoder, "audioEncoder": plan.audio_encoder, "width": plan.width, "height": plan.height, "fps": plan.fps, "duration": plan.duration});
    if let Some(l) = &plan.loudness {
        let measured_from = match package {
            Some("dcp") => Path::new(&target).with_file_name("audio.wav").to_string_lossy().into_owned(),
            Some(_) => target.clone(),
            None => files[0].clone(),
        };
        let after = if s["exportAudio"].as_bool().unwrap_or(true) { pipeline::measure_file(&measured_from) } else { json!({}) };
        let mut lo = l.clone();
        lo["output"] = after.clone();
        result["loudness"] = lo;
        if l["report"].as_bool().unwrap_or(true) {
            result["loudnessReport"] = json!(sidecars::write_loudness_report(&out_path, l, &after)?);
        }
    }
    if s["publish"].as_array().map(|a| a.iter().any(|d| d["enabled"].as_bool().unwrap_or(true))).unwrap_or(false) {
        let mut all = files.clone();
        if all.len() < 50 {
            all.extend(written.iter().cloned());
        } else {
            all.truncate(1);
        }
        result["publishPending"] = json!(true);
        ctx.shared.lock().unwrap().requests.push(json!({"type": "publishRequest", "output": ctx.oid, "files": all, "destinations": s["publish"], "context": {"source": item["path"], "output": out_path, "preset": s["presetName"]}}));
    }
    if let Some(t) = tmp {
        let _ = fs::remove_dir_all(t);
    }
    let _ = fs::remove_dir_all(&work);
    Ok(result)
}

fn encode_passes(ctx: &Ctx, plan: &Plan, base: f64) -> Res<()> {
    if let Some(ext) = &plan.external {
        run_pass_external(ctx, &plan.passes[0], plan, ext, base, (1.0 - base) * 0.97)?;
        if ctx.stopped() {
            return Err("stopped".into());
        }
        for command in &plan.passes[1..] {
            run_pass(ctx, command, plan, base + (1.0 - base) * 0.97, (1.0 - base) * 0.03, "muxing")?;
        }
        return Ok(());
    }
    let total = plan.passes.len().max(1);
    let share = if plan.post.is_empty() { 1.0 } else { 0.7 };
    for (i, command) in plan.passes.iter().enumerate() {
        let label = if total > 1 { format!("pass {} of {total}", i + 1) } else { "encoding".to_string() };
        run_pass(ctx, command, plan, base + (1.0 - base) * share * i as f64 / total as f64, (1.0 - base) * share / total as f64, &label)?;
        if ctx.stopped() {
            return Err("stopped".into());
        }
    }
    for command in &plan.post {
        let name = Path::new(&command[0]).file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        ctx.report(base + (1.0 - base) * share, &format!("encoding with {name}"));
        crate::tools::run(Path::new(&command[0]), &command[1..], None)?;
        if ctx.stopped() {
            return Err("stopped".into());
        }
    }
    Ok(())
}

enum Sink {
    OpenH264(crate::openh264::Encoder),
    Kvazaar(std::process::Child, std::process::ChildStdin, thread::JoinHandle<String>),
}

fn run_pass_external(ctx: &Ctx, command: &[String], plan: &Plan, ext: &pipeline::External, base: f64, span: f64) -> Res<()> {
    ctx.tail.lock().unwrap().clear();
    let mut sink = if ext.encoder == "kvazaar" {
        let program = crate::tools::require("kvazaar", "HEVC")?;
        let args = ext.args(&program.to_string_lossy());
        let mut cmd = std::process::Command::new(&args[0]);
        cmd.args(&args[1..]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let mut child = cmd.spawn().map_err(|e| format!("kvazaar could not start: {e}"))?;
        let stdin = child.stdin.take().ok_or("kvazaar has no input")?;
        let mut err = child.stderr.take();
        let log = thread::spawn(move || {
            let mut s = String::new();
            if let Some(e) = err.as_mut() {
                let _ = e.read_to_string(&mut s);
            }
            s
        });
        Sink::Kvazaar(child, stdin, log)
    } else {
        let lib = crate::openh264::library().ok_or("OpenH264 is not installed; download it from Cisco in Preferences > Delivery Tools or with ./formencoder install-tools openh264")?;
        let s = crate::openh264::Settings { width: ext.width, height: ext.height, fps: ext.fps, bitrate: ext.bitrate, max_bitrate: ext.max_bitrate, quality: ext.quality, keyint: ext.keyint, profile: ext.profile.clone(), threads: ext.threads, bt709: ext.bt709 };
        Sink::OpenH264(crate::openh264::Encoder::new(&lib, &s, Path::new(&ext.stream))?)
    };
    let mut cmd = ffmpeg::command(&command[0]);
    cmd.args(&command[1..]).stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(if plan.timecode.is_some() { Stdio::piped() } else { Stdio::null() });
    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg could not start: {e}"))?;
    let pid = child.id();
    {
        let mut s = ctx.shared.lock().unwrap();
        s.pid = Some(pid);
        if s.paused {
            suspend(pid, true);
        }
    }
    if let (Some(tc), Some(mut stdin)) = (plan.timecode.clone(), child.stdin.take()) {
        thread::spawn(move || {
            for i in 0..(tc.frames + 2) {
                if stdin.write_all(&tc.frame(i).px).is_err() {
                    break;
                }
            }
        });
    }
    let stderr = child.stderr.take();
    let tail = ctx.tail.clone();
    let err_thread = thread::spawn(move || {
        if let Some(se) = stderr {
            for line in BufReader::new(se).lines().map_while(Result::ok) {
                let line = line.trim_end().to_string();
                if line.is_empty() {
                    continue;
                }
                let mut t = tail.lock().unwrap();
                t.push_back(line);
                while t.len() > 60 {
                    t.pop_front();
                }
            }
        }
    });
    let frame_bytes = (ext.width * ext.height * 3 / 2) as usize;
    let mut frame = vec![0u8; frame_bytes];
    let mut done: i64 = 0;
    let mut last = Instant::now() - Duration::from_secs(1);
    let started = Instant::now();
    let mut failure: Option<String> = None;
    if let Some(mut out) = child.stdout.take() {
        loop {
            match out.read_exact(&mut frame) {
                Ok(()) => {}
                Err(_) => break,
            }
            let r = match &mut sink {
                Sink::OpenH264(e) => e.encode(&mut frame),
                Sink::Kvazaar(_, stdin, _) => stdin.write_all(&frame).map_err(|e| format!("kvazaar stopped taking frames: {e}")),
            };
            if let Err(e) = r {
                failure = Some(e);
                kill(pid);
                break;
            }
            done += 1;
            if last.elapsed() >= Duration::from_millis(250) {
                last = Instant::now();
                let frac = if plan.frames > 0 { done as f64 / plan.frames as f64 } else { 0.0 };
                ctx.report(base + span * frac.min(1.0), &format!("encoding with {}", ext.encoder));
                let secs = started.elapsed().as_secs_f64().max(0.001);
                ctx.push(json!({"fps": (done as f64 / secs * 10.0).round() / 10.0, "frame": done, "outTime": (done as f64 / ext.fps.max(1.0) * 1000.0).round() / 1000.0}));
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = err_thread.join();
    ctx.shared.lock().unwrap().pid = None;
    let finished = match sink {
        Sink::OpenH264(e) => e.finish().map(|_| ()),
        Sink::Kvazaar(mut k, stdin, log) => {
            drop(stdin);
            let ok = k.wait().map(|s| s.success()).unwrap_or(false);
            let text = log.join().unwrap_or_default();
            if ok {
                Ok(())
            } else {
                let line = text.lines().find(|l| l.contains("error") || l.contains("Failed")).or(text.lines().rev().find(|l| !l.trim().is_empty())).unwrap_or("").trim().to_string();
                failure = Some(format!("kvazaar failed: {line}"));
                Ok(())
            }
        }
    };
    if ctx.stopped() {
        return Err("stopped".into());
    }
    if let Some(f) = failure {
        return Err(f);
    }
    if !status.success() {
        let t = ctx.tail.lock().unwrap();
        let msg = t.iter().rev().find(|l| l.contains("rror") || l.contains("nvalid") || l.contains("not")).or(t.back()).cloned().unwrap_or_else(|| format!("ffmpeg exited with {status}"));
        return Err(format!("ffmpeg failed ({}): {msg}", status.code().unwrap_or(-1)));
    }
    finished?;
    if done == 0 {
        return Err("ffmpeg produced no frames for the encoder".into());
    }
    Ok(())
}

fn run_pass(ctx: &Ctx, command: &[String], plan: &Plan, base: f64, span: f64, label: &str) -> Res<()> {
    ctx.tail.lock().unwrap().clear();
    let mut cmd = ffmpeg::command(&command[0]);
    cmd.args(&command[1..]).stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(if plan.timecode.is_some() { Stdio::piped() } else { Stdio::null() });
    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg could not start: {e}"))?;
    let pid = child.id();
    {
        let mut s = ctx.shared.lock().unwrap();
        s.pid = Some(pid);
        if s.paused {
            suspend(pid, true);
        }
    }
    if let (Some(tc), Some(mut stdin)) = (plan.timecode.clone(), child.stdin.take()) {
        thread::spawn(move || {
            for i in 0..(tc.frames + 2) {
                if stdin.write_all(&tc.frame(i).px).is_err() {
                    break;
                }
            }
        });
    }
    let stderr = child.stderr.take();
    let tail = ctx.tail.clone();
    let stop_on_decode = ctx.prefs["stopOnDecodeErrors"].as_bool().unwrap_or(false);
    let shared = ctx.shared.clone();
    let err_thread = thread::spawn(move || {
        if let Some(se) = stderr {
            for line in BufReader::new(se).lines().map_while(Result::ok) {
                let line = line.trim_end().to_string();
                if line.is_empty() {
                    continue;
                }
                if stop_on_decode && DECODE_ERRORS.iter().any(|k| line.contains(k)) {
                    let mut s = shared.lock().unwrap();
                    s.stop = true;
                    if let Some(p) = s.pid {
                        kill(p);
                    }
                }
                let mut t = tail.lock().unwrap();
                t.push_back(line);
                while t.len() > 60 {
                    t.pop_front();
                }
            }
        }
    });
    let mut state: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut last = Instant::now() - Duration::from_secs(1);
    if let Some(so) = child.stdout.take() {
        for line in BufReader::new(so).lines().map_while(Result::ok) {
            let Some((k, v)) = line.trim().split_once('=') else { continue };
            state.insert(k.to_string(), v.to_string());
            if k != "progress" {
                continue;
            }
            if last.elapsed() < Duration::from_millis(250) && v != "end" {
                continue;
            }
            last = Instant::now();
            let t = state.get("out_time_us").or(state.get("out_time_ms")).and_then(|x| x.parse::<f64>().ok()).unwrap_or(0.0) / 1_000_000.0;
            let frame: i64 = state.get("frame").and_then(|x| x.parse().ok()).unwrap_or(0);
            let mut frac = if plan.duration > 0.0 { t / plan.duration } else { 0.0 };
            if plan.frames > 0 && frame > 0 {
                frac = frac.max(frame as f64 / plan.frames as f64);
            }
            ctx.report(base + span * frac.min(1.0), label);
            let fps: f64 = state.get("fps").and_then(|x| x.parse().ok()).unwrap_or(0.0);
            let speed: Option<f64> = state.get("speed").and_then(|x| x.trim().trim_end_matches('x').parse().ok());
            let size: i64 = state.get("total_size").and_then(|x| x.parse().ok()).unwrap_or(0);
            ctx.push(json!({"fps": fps, "speed": speed, "outTime": (t * 1000.0).round() / 1000.0, "frame": frame, "size": size}));
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = err_thread.join();
    ctx.shared.lock().unwrap().pid = None;
    if ctx.stopped() {
        return Err("stopped".into());
    }
    if !status.success() {
        let t = ctx.tail.lock().unwrap();
        let msg = t.iter().rev().find(|l| l.contains("rror") || l.contains("nvalid") || l.contains("not")).or(t.back()).cloned().unwrap_or_else(|| format!("ffmpeg exited with {status}"));
        return Err(format!("ffmpeg failed ({}): {msg}", status.code().unwrap_or(-1)));
    }
    Ok(())
}

fn copy(ctx: &Ctx, item: &Value, output: &Value) -> Res {
    let src = PathBuf::from(item["path"].as_str().unwrap_or(""));
    let dest = PathBuf::from(paths::expand(output["destination"].as_str().unwrap_or("")));
    if dest.as_os_str().is_empty() {
        return Err("the copy output needs a destination folder".into());
    }
    let verify = output["verify"].as_str().unwrap_or("size").to_string();
    let mut files: Vec<PathBuf> = Vec::new();
    if src.is_file() {
        files.push(src.clone());
    } else {
        walk(&src, &mut files);
    }
    files.sort();
    let root = src.parent().unwrap_or(Path::new(".")).to_path_buf();
    let total: u64 = files.iter().filter_map(|f| fs::metadata(f).ok()).map(|m| m.len()).sum::<u64>().max(1);
    let mut done: u64 = 0;
    let mut copied = Vec::new();
    for f in &files {
        let rel = f.strip_prefix(&root).unwrap_or(f);
        let target = dest.join(rel);
        if let Some(p) = target.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut hin = Md5::new();
        {
            let mut r = File::open(f).map_err(|e| e.to_string())?;
            let mut w = File::create(&target).map_err(|e| format!("cannot write {}: {e}", target.display()))?;
            let mut buf = vec![0u8; 4 << 20];
            loop {
                if ctx.stopped() {
                    return Err("stopped".into());
                }
                let n = r.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                w.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                if verify == "md5" {
                    hin.update(&buf[..n]);
                }
                done += n as u64;
                ctx.report(0.95 * done as f64 / total as f64, &format!("copying {}", f.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default()));
            }
        }
        let (a, b) = (fs::metadata(f).map(|m| m.len()).unwrap_or(0), fs::metadata(&target).map(|m| m.len()).unwrap_or(0));
        if a != b {
            return Err(format!("{}: the copy is {b} bytes, the original {a}", f.display()));
        }
        if verify == "md5" {
            let mut hout = Md5::new();
            let mut r = File::open(&target).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 4 << 20];
            loop {
                let n = r.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                hout.update(&buf[..n]);
            }
            if hin.finalize() != hout.finalize() {
                return Err(format!("{}: the MD5 of the copy differs from the original", f.display()));
            }
        } else if verify == "bit" {
            let (mut x, mut y) = (File::open(f).map_err(|e| e.to_string())?, File::open(&target).map_err(|e| e.to_string())?);
            let (mut bx, mut by) = (vec![0u8; 1 << 20], vec![0u8; 1 << 20]);
            loop {
                let n1 = x.read(&mut bx).map_err(|e| e.to_string())?;
                let n2 = y.read(&mut by).map_err(|e| e.to_string())?;
                if n1 != n2 || bx[..n1] != by[..n2] {
                    return Err(format!("{}: the copy differs from the original", f.display()));
                }
                if n1 == 0 {
                    break;
                }
            }
        }
        copied.push(target.to_string_lossy().into_owned());
    }
    ctx.report(1.0, "copied");
    Ok(json!({"path": dest.to_string_lossy(), "files": copied, "count": copied.len(), "verify": verify, "bytes": total}))
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.is_file() {
                out.push(p);
            }
        }
    }
}

pub fn preview(src: &Source, s: &Value, at: f64, width: u32, work: &Path) -> Res<(Vec<u8>, Value)> {
    let measured = Measured::default();
    let opt = BuildOptions { preview_at: Some(at), preview_width: Some(width), still_duration: 5.0, threads: 0, measured: &measured };
    let plan = pipeline::build(src, s, "preview.png", work, &opt)?;
    let cmd = &plan.passes[0];
    let out = ffmpeg::command(&cmd[0]).args(&cmd[1..]).stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
    if !out.status.success() || out.stdout.is_empty() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("preview failed: {}", err.lines().last().unwrap_or("no frame")));
    }
    Ok((out.stdout, json!({"width": plan.width, "height": plan.height, "time": at, "duration": plan.duration, "notes": plan.notes})))
}
