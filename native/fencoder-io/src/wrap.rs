use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde_json::Value;
use sha1::{Digest, Sha1};

use crate::util::{Res, base64, uuid4};
use crate::{formats, text, tools};

pub fn kind(s: &Value) -> Option<&'static str> {
    formats::package(s["format"].as_str().unwrap_or(""))
}

pub fn essence_path(kind: &str, work: &Path) -> String {
    if kind == "dcp" {
        let d = work.join("dcp");
        let _ = fs::create_dir_all(&d);
        d.join("f_%06d.raw").to_string_lossy().into_owned()
    } else {
        work.join("essence.mxf").to_string_lossy().into_owned()
    }
}

pub fn required_tool(kind: &str) -> Res<()> {
    match kind {
        "dcp" => {
            tools::require("opj_compress", "DCP")?;
            tools::require("asdcp-wrap", "DCP")?;
        }
        _ => {
            tools::require("bmxtranswrap", label(kind))?;
        }
    }
    Ok(())
}

fn label(kind: &str) -> &'static str {
    match kind {
        "as10" => "AS-10",
        "as11op1a" => "AS-11 OP1a",
        "as11d10" => "AS-11 D10",
        "p2" => "P2",
        _ => "DCP",
    }
}

pub type Throttle = Arc<dyn Fn(bool) + Send + Sync>;
pub type Stopped = Arc<dyn Fn() -> bool + Send + Sync>;

pub struct J2k {
    done: Arc<AtomicBool>,
    abort: Arc<AtomicBool>,
    handle: JoinHandle<Res<usize>>,
}

fn quiet(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
}

impl J2k {
    pub fn start(dir: PathBuf, w: u32, h: u32, fps: f64, throttle: Throttle, stopped: Stopped) -> Res<J2k> {
        let opj = tools::require("opj_compress", "DCP")?;
        let done = Arc::new(AtomicBool::new(false));
        let abort = Arc::new(AtomicBool::new(false));
        let (d2, a2) = (done.clone(), abort.clone());
        let handle = thread::Builder::new().name("formencoder-j2k".into()).spawn(move || encode_frames(&opj, &dir, w, h, fps, &d2, &a2, &throttle, &stopped)).map_err(|e| e.to_string())?;
        Ok(J2k { done, abort, handle })
    }

    pub fn finish(self, encoded: bool) -> Res<usize> {
        if !encoded {
            self.abort.store(true, Ordering::SeqCst);
        }
        self.done.store(true, Ordering::SeqCst);
        self.handle.join().map_err(|_| "the JPEG 2000 worker stopped unexpectedly".to_string())?
    }
}

fn raw_frames(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir).map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "raw").unwrap_or(false)).collect()).unwrap_or_default();
    v.sort();
    v
}

#[allow(clippy::too_many_arguments)]
fn encode_frames(opj: &Path, dir: &Path, w: u32, h: u32, fps: f64, done: &AtomicBool, abort: &AtomicBool, throttle: &Throttle, stopped: &Stopped) -> Res<usize> {
    let out = dir.join("j2c");
    fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let frame_bytes = w as u64 * h as u64 * 6;
    let limit = ((1u64 << 30) / frame_bytes).max(8) as usize;
    let par = thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8);
    let profile: Vec<String> = if w > 2048 { vec!["-cinema4K".into()] } else { vec!["-cinema2K".into(), if fps > 30.0 { "48".into() } else { "24".into() }] };
    let raw_spec = format!("{w},{h},3,12,u");
    let mut count = 0usize;
    let mut held = false;
    let release = |held: &mut bool| {
        if *held {
            throttle(false);
            *held = false;
        }
    };
    loop {
        if stopped() || abort.load(Ordering::SeqCst) {
            release(&mut held);
            return Err("stopped".into());
        }
        let finished = done.load(Ordering::SeqCst);
        let mut raws = raw_frames(dir);
        let total = raws.len();
        if total > limit && !held {
            throttle(true);
            held = true;
        } else if held && total < limit / 2 {
            release(&mut held);
        }
        if !finished {
            raws.pop();
        }
        if let Some(bad) = raws.iter().find(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0) != frame_bytes) {
            if finished {
                release(&mut held);
                return Err(format!("{} is not a whole {w}x{h} frame", bad.display()));
            }
            raws.retain(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0) == frame_bytes);
        }
        if raws.is_empty() {
            if finished {
                break;
            }
            thread::sleep(Duration::from_millis(40));
            continue;
        }
        let batch: Vec<PathBuf> = raws.into_iter().take(par).collect();
        let mut children: Vec<(PathBuf, Child)> = Vec::new();
        for raw in &batch {
            let stem = raw.file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
            let mut cmd = Command::new(opj);
            cmd.arg("-i").arg(raw).arg("-o").arg(out.join(format!("{stem}.j2c"))).arg("-F").arg(&raw_spec).args(&profile).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
            quiet(&mut cmd);
            let child = cmd.spawn().map_err(|e| format!("opj_compress could not start: {e}"))?;
            children.push((raw.clone(), child));
        }
        let mut failure = None;
        for (raw, mut child) in children {
            let mut err = String::new();
            if let Some(mut e) = child.stderr.take() {
                let _ = e.read_to_string(&mut err);
            }
            let ok = child.wait().map(|s| s.success()).unwrap_or(false);
            if !ok && failure.is_none() {
                failure = Some(format!("opj_compress failed on {}: {}", raw.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim()));
            }
            if ok && err.contains("Non-profile") && failure.is_none() {
                failure = Some("opj_compress could not keep the DCI cinema profile for this frame".into());
            }
            let _ = fs::remove_file(&raw);
        }
        if let Some(f) = failure {
            release(&mut held);
            return Err(f);
        }
        count += batch.len();
    }
    release(&mut held);
    Ok(count)
}

pub struct Job<'a> {
    pub s: &'a Value,
    pub essence: &'a str,
    pub out: &'a str,
    pub frames: i64,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    pub start_tc: &'a str,
    pub report: &'a dyn Fn(f64, &str),
}

pub fn finish(kind: &str, job: &Job) -> Res<Vec<String>> {
    match kind {
        "as10" | "as11op1a" | "as11d10" => bmx_op1a(kind, job),
        "p2" => p2(job),
        "dcp" => dcp(job),
        other => Err(format!("unknown package {other}")),
    }
}

fn pk<'a>(job: &'a Job, key: &str) -> &'a str {
    job.s["package"][key].as_str().unwrap_or("").trim()
}

fn tc_of(frames: i64, fps: f64) -> String {
    text::format_timecode(frames, fps)
}

fn bmx_op1a(kind: &str, job: &Job) -> Res<Vec<String>> {
    let bmx = tools::require("bmxtranswrap", label(kind))?;
    (job.report)(0.97, "wrapping");
    let work = Path::new(job.essence).parent().unwrap_or(Path::new(".")).to_path_buf();
    let part = Path::new(job.out).with_file_name(format!(".{}.fe-part.mxf", Path::new(job.out).file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default()));
    let mut args: Vec<String> = vec!["-t".into(), kind.into()];
    let extra = job.s["package"]["fields"].as_object().cloned().unwrap_or_default();
    if kind == "as10" {
        let shim = if pk(job, "shim").is_empty() { "HIGH_HD_2014" } else { pk(job, "shim") };
        args.extend(["--shim-name".into(), shim.into()]);
        let mut lines = vec![format!("ShimName: {shim}")];
        for (k, f) in [("MainTitle", "mainTitle"), ("SubTitle", "subTitle"), ("OrganizationName", "organization")] {
            if !pk(job, f).is_empty() {
                lines.push(format!("{k}: {}", pk(job, f)));
            }
        }
        lines.extend(extra.iter().map(|(k, v)| format!("{k}: {}", v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))));
        let dm = work.join("as10_framework.txt");
        fs::write(&dm, lines.join("\n") + "\n").map_err(|e| e.to_string())?;
        args.extend(["--dm-file".into(), "as10".into(), dm.to_string_lossy().into_owned()]);
    } else {
        let title = |k: &str, fallback: &str| if pk(job, k).is_empty() { fallback.to_string() } else { pk(job, k).to_string() };
        let stem = Path::new(job.out).file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let mut lines = vec![
            format!("SeriesTitle: {}", title("seriesTitle", &stem)),
            format!("ProgrammeTitle: {}", title("programmeTitle", &stem)),
            format!("EpisodeTitleNumber: {}", title("episode", "1")),
            format!("ShimName: {}", title("shim", if kind == "as11d10" { "UK DPP SD" } else { "AS-11 X1" })),
            format!("ShimVersion: {}", title("shimVersion", "1.1")),
            format!("AudioTrackLayout: {}", job.s["package"]["audioTrackLayout"].as_i64().unwrap_or(0)),
            format!("PrimaryAudioLanguage: {}", title("language", "eng")),
            format!("ClosedCaptionsPresent: {}", job.s["package"]["closedCaptions"].as_bool().unwrap_or(false)),
        ];
        let core_keys = ["SeriesTitle", "ProgrammeTitle", "EpisodeTitleNumber", "ShimName", "ShimVersion", "AudioTrackLayout", "PrimaryAudioLanguage", "ClosedCaptionsPresent", "ClosedCaptionsType", "ClosedCaptionsLanguage"];
        let mut dpp = Vec::new();
        for (k, v) in &extra {
            let val = v.as_str().map(String::from).unwrap_or_else(|| v.to_string());
            if core_keys.contains(&k.as_str()) {
                lines.retain(|l| !l.starts_with(&format!("{k}:")));
                lines.push(format!("{k}: {val}"));
            } else {
                dpp.push(format!("{k}: {val}"));
            }
        }
        let core = work.join("as11_core.txt");
        fs::write(&core, lines.join("\n") + "\n").map_err(|e| e.to_string())?;
        args.extend(["--dm-file".into(), "as11".into(), core.to_string_lossy().into_owned()]);
        if !dpp.is_empty() {
            let f = work.join("as11_dpp.txt");
            fs::write(&f, dpp.join("\n") + "\n").map_err(|e| e.to_string())?;
            args.extend(["--dm-file".into(), "dpp".into(), f.to_string_lossy().into_owned()]);
        }
        let start = text::parse_timecode(job.start_tc, job.fps);
        let seg = work.join("as11_segments.txt");
        fs::write(&seg, format!("1/1\t{} {}\n", tc_of(start, job.fps), tc_of(job.frames, job.fps))).map_err(|e| e.to_string())?;
        args.extend(["--seg".into(), seg.to_string_lossy().into_owned()]);
    }
    args.extend(["-o".into(), part.to_string_lossy().into_owned(), job.essence.into()]);
    let res = tools::run(&bmx, &args, Some(&work));
    if res.is_err() {
        let _ = fs::remove_file(&part);
    }
    res?;
    fs::rename(&part, job.out).map_err(|e| format!("cannot move the finished file into place at {}: {e}", job.out))?;
    Ok(vec![job.out.to_string()])
}

fn clip_name(job: &Job) -> String {
    let given: String = pk(job, "clipName").chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).take(6).collect();
    if given.len() == 6 { given } else { "0001FE".to_string() }
}

fn umid() -> String {
    let a = uuid4().replace('-', "");
    let b = uuid4().replace('-', "");
    format!("060A2B340101010501010D4313000000{}{}", a[..16].to_uppercase(), b[..16].to_uppercase())
}

fn xml_escape(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn p2(job: &Job) -> Res<Vec<String>> {
    let bmx = tools::require("bmxtranswrap", "P2")?;
    (job.report)(0.97, "wrapping");
    let work = Path::new(job.essence).parent().unwrap_or(Path::new(".")).to_path_buf();
    let atom = work.join("opatom");
    let _ = fs::remove_dir_all(&atom);
    fs::create_dir_all(&atom).map_err(|e| e.to_string())?;
    let clip = clip_name(job);
    tools::run(&bmx, &["-t".into(), "avid".into(), "-o".into(), atom.join(&clip).to_string_lossy().into_owned(), job.essence.into()], Some(&work))?;
    let root = PathBuf::from(job.out);
    let contents = root.join("CONTENTS");
    for d in ["CLIP", "VIDEO", "AUDIO", "ICON", "PROXY", "VOICE"] {
        fs::create_dir_all(contents.join(d)).map_err(|e| e.to_string())?;
    }
    let mut files = Vec::new();
    let mut audio_count = 0;
    let mut produced: Vec<PathBuf> = fs::read_dir(&atom).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).collect();
    produced.sort();
    for p in produced {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let target = if name.contains("_v") {
            contents.join("VIDEO").join(format!("{clip}.MXF"))
        } else if let Some(n) = name.rsplit("_a").next().and_then(|x| x.trim_end_matches(".mxf").parse::<u32>().ok()) {
            audio_count += 1;
            contents.join("AUDIO").join(format!("{clip}{:02}.MXF", n.saturating_sub(1)))
        } else {
            continue;
        };
        fs::rename(&p, &target).or_else(|_| fs::copy(&p, &target).map(|_| ())).map_err(|e| e.to_string())?;
        files.push(target.to_string_lossy().into_owned());
    }
    if files.is_empty() {
        return Err("bmx wrote no OP-Atom files".into());
    }
    let flavor = job.s["video"]["flavor"].as_str().unwrap_or("1080i50");
    let (rate, edit) = match flavor { "1080i5994" => ("59.94i", "1001/30000"), "720p50" => ("50p", "1/50"), "720p5994" => ("59.94p", "1001/60000"), _ => ("50i", "1/25") };
    let aspect = "16:9";
    let user = if pk(job, "userClipName").is_empty() { clip.clone() } else { pk(job, "userClipName").to_string() };
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    let bits = job.s["audio"]["bitDepth"].as_i64().unwrap_or(16);
    let mut audio_xml = String::new();
    for _ in 0..audio_count {
        audio_xml.push_str(&format!("\t\t\t<Audio>\n\t\t\t\t<AudioFormat>MXF</AudioFormat>\n\t\t\t\t<SamplingRate>48000</SamplingRate>\n\t\t\t\t<BitsPerSample>{bits}</BitsPerSample>\n\t\t\t</Audio>\n"));
    }
    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<P2Main xmlns=\"urn:schemas-Professional-Plug-in:P2:ClipMetadata:v3.1\">\n\t<ClipContent>\n\t\t<ClipName>{clip}</ClipName>\n\t\t<GlobalClipID>{}</GlobalClipID>\n\t\t<Duration>{}</Duration>\n\t\t<EditUnit>{edit}</EditUnit>\n\t\t<EssenceList>\n\t\t\t<Video>\n\t\t\t\t<VideoFormat>MXF</VideoFormat>\n\t\t\t\t<Codec Class=\"100\">DVCPRO_HD</Codec>\n\t\t\t\t<FrameRate>{rate}</FrameRate>\n\t\t\t\t<StartTimecode>{}</StartTimecode>\n\t\t\t\t<AspectRatio>{aspect}</AspectRatio>\n\t\t\t</Video>\n{audio_xml}\t\t</EssenceList>\n\t\t<ClipMetadata>\n\t\t\t<UserClipName>{}</UserClipName>\n\t\t\t<DataSource>SHOOTING</DataSource>\n\t\t\t<Access>\n\t\t\t\t<Creator>formencoder</Creator>\n\t\t\t\t<CreationDate>{now}</CreationDate>\n\t\t\t\t<LastUpdateDate>{now}</LastUpdateDate>\n\t\t\t</Access>\n\t\t</ClipMetadata>\n\t</ClipContent>\n</P2Main>\n",
        umid(),
        job.frames,
        tc_of(text::parse_timecode(job.start_tc, job.fps), job.fps),
        xml_escape(&user)
    );
    let clip_xml = contents.join("CLIP").join(format!("{clip}.XML"));
    fs::write(&clip_xml, xml).map_err(|e| e.to_string())?;
    files.insert(0, clip_xml.to_string_lossy().into_owned());
    let _ = fs::remove_dir_all(&atom);
    Ok(files)
}

pub fn picture_file(kind: &str, path: &str, files: &[String]) -> Option<String> {
    let listed = |pat: &dyn Fn(&str) -> bool| files.iter().find(|f| pat(f)).cloned();
    let scan = |dir: PathBuf, pat: &dyn Fn(&str) -> bool| -> Option<String> {
        let mut v: Vec<String> = fs::read_dir(dir).ok()?.flatten().map(|e| e.path().to_string_lossy().into_owned()).filter(|p| pat(p)).collect();
        v.sort();
        v.into_iter().next()
    };
    match kind {
        "p2" => {
            let is_video = |p: &str| p.replace('\\', "/").contains("/CONTENTS/VIDEO/") && p.to_uppercase().ends_with(".MXF");
            listed(&is_video).or_else(|| scan(Path::new(path).join("CONTENTS").join("VIDEO"), &is_video))
        }
        "dcp" => {
            let is_pic = |p: &str| Path::new(p).file_name().map(|n| n.to_string_lossy().starts_with("j2c_")).unwrap_or(false) && p.ends_with(".mxf");
            listed(&is_pic).or_else(|| scan(PathBuf::from(path), &is_pic))
        }
        _ => Some(path.to_string()),
    }
}

fn check(name: &str, want: impl Into<Value>, got: impl Into<Value>, ok: bool) -> Value {
    serde_json::json!({"check": name, "want": want.into(), "got": got.into(), "ok": ok})
}

fn field<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    text.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        (k.trim() == key).then(|| v.trim())
    })
}

pub fn verify(kind: &str, s: &Value, path: &str, files: &[String]) -> Vec<Value> {
    let mut out = Vec::new();
    match kind {
        "as10" | "as11op1a" | "as11d10" => {
            let Some(m) = tools::find("mxf2raw") else {
                out.push(check("package", "mxf2raw to read it back", "mxf2raw is not installed", false));
                return out;
            };
            let flag = if kind == "as10" { "--as10" } else { "--as11" };
            let info = tools::run(&m, &["--info".into(), flag.into(), path.into()], None).unwrap_or_else(|e| e);
            let op = field(&info, "op_label").unwrap_or("unreadable").split(' ').next().unwrap_or("").to_string();
            out.push(check("MXF operational pattern", "OP1A", op.clone(), op == "OP1A"));
            if kind == "as10" {
                let want = s["package"]["shim"].as_str().filter(|x| !x.is_empty()).unwrap_or("HIGH_HD_2014");
                let got = field(&info, "shim_name").unwrap_or("none");
                out.push(check("AS-10 shim", want, got, got == want));
            } else {
                let got = field(&info, "programme_title").unwrap_or("none");
                out.push(check("AS-11 core framework", "present", got, got != "none"));
                out.push(check("AS-11 segmentation", "1 part", if info.contains("Segment #0") { "1 part" } else { "none" }, info.contains("Segment #0")));
            }
            let types: Vec<&str> = info.lines().filter_map(|l| l.split_once(':').filter(|(k, _)| k.trim() == "essence_type").map(|(_, v)| v.trim())).collect();
            let pcm = types.iter().filter(|t| **t == "WAVE_PCM").count();
            let want_tracks = formats::get(s["format"].as_str().unwrap_or("")).ok().and_then(|f| f["audioTracks"].as_u64()).unwrap_or(0) as usize;
            if kind == "as11d10" {
                let d10 = types.iter().find(|t| t.starts_with("D10_") && !t.contains("PCM")).copied().unwrap_or("none");
                out.push(check("D10 essence", "D10_50 or D10_40 or D10_30", d10, d10 != "none"));
            } else {
                out.push(check("audio tracks", want_tracks, pcm, pcm == want_tracks));
            }
        }
        "p2" => {
            let root = Path::new(path).join("CONTENTS");
            let clips: Vec<PathBuf> = fs::read_dir(root.join("CLIP")).map(|rd| rd.flatten().map(|e| e.path()).collect()).unwrap_or_default();
            out.push(check("P2 clip XML", "1", clips.len().to_string(), clips.len() == 1));
            let audio = fs::read_dir(root.join("AUDIO")).map(|rd| rd.flatten().count()).unwrap_or(0);
            let want = formats::get("p2").ok().and_then(|f| f["audioTracks"].as_u64()).unwrap_or(4) as usize;
            out.push(check("P2 audio files", want, audio, audio == want));
            if let (Some(m), Some(v)) = (tools::find("mxf2raw"), picture_file("p2", path, files)) {
                let info = tools::run(&m, &["--info".into(), v], None).unwrap_or_else(|e| e);
                let op = field(&info, "op_label").unwrap_or("unreadable").split(' ').next().unwrap_or("").to_string();
                out.push(check("MXF operational pattern", "OPAtom", op.clone(), op == "OPAtom"));
            }
        }
        "dcp" => {
            let root = PathBuf::from(path);
            let smpte = s["package"]["standard"] != "interop";
            let am = root.join(if smpte { "ASSETMAP.xml" } else { "ASSETMAP" });
            out.push(check("ASSETMAP", "present", if am.is_file() { "present" } else { "missing" }, am.is_file()));
            let pkl = fs::read_dir(&root).ok().and_then(|rd| rd.flatten().map(|e| e.path()).find(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("pkl_")).unwrap_or(false)));
            let mut hashes_ok = pkl.is_some();
            let mut checked = 0;
            if let Some(p) = &pkl {
                let text = fs::read_to_string(p).unwrap_or_default();
                for block in text.split("<Asset>").skip(1) {
                    let tag = |t: &str| block.split(&format!("<{t}>")).nth(1).and_then(|x| x.split(&format!("</{t}>")).next()).unwrap_or("").to_string();
                    let (name, hash) = (tag("AnnotationText"), tag("Hash"));
                    match sha1_b64(&root.join(&name)) {
                        Ok((h, _)) if h == hash => checked += 1,
                        _ => hashes_ok = false,
                    }
                }
            }
            out.push(check("PKL hashes", "every asset matches", format!("{checked} matched"), hashes_ok && checked > 0));
            if let Some(info_bin) = tools::find("asdcp-info") {
                if let Some(pic) = picture_file("dcp", path, files) {
                    let d = tools::run(&info_bin, &["-d".into(), pic.clone()], None).unwrap_or_else(|e| e);
                    let rsize = field(&d, "Rsize").unwrap_or("?").to_string();
                    let want_r = if s["video"]["flavor"] == "4k" { "4" } else { "3" };
                    out.push(check("DCI JPEG 2000 profile", format!("Rsize {want_r}"), format!("Rsize {rsize}"), rsize == want_r));
                    let r = tools::run(&info_bin, &["-r".into(), pic], None).unwrap_or_else(|e| e);
                    let max: f64 = r.lines().find_map(|l| l.strip_prefix("Max BitRate:")).and_then(|x| x.trim().trim_end_matches("Mb/s").trim().parse().ok()).unwrap_or(f64::NAN);
                    out.push(check("picture bit rate", "at most 250 Mb/s", format!("{max:.1} Mb/s"), max <= 250.0));
                }
            }
        }
        _ => {}
    }
    out
}

fn sha1_b64(path: &Path) -> Res<(String, u64)> {
    let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha1::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut size = 0u64;
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        size += n as u64;
        h.update(&buf[..n]);
    }
    Ok((base64(&h.finalize()), size))
}

fn rate_pair(fps: f64) -> String {
    format!("{} 1", fps.round() as i64)
}

fn dcp(job: &Job) -> Res<Vec<String>> {
    let wrap = tools::require("asdcp-wrap", "DCP")?;
    let smpte = pk(job, "standard") != "interop";
    let dir = Path::new(job.essence).parent().unwrap_or(Path::new(".")).to_path_buf();
    let j2c = dir.join("j2c");
    let frames = fs::read_dir(&j2c).map(|rd| rd.flatten().count()).unwrap_or(0) as i64;
    if frames == 0 {
        return Err("no JPEG 2000 frames were made for the DCP".into());
    }
    let root = PathBuf::from(job.out);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let stem = root.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_else(|| "DCP".into());
    let title = if pk(job, "title").is_empty() { stem.clone() } else { pk(job, "title").to_string() };
    let issuer = if pk(job, "issuer").is_empty() { "formencoder" } else { pk(job, "issuer") };
    let kind = if pk(job, "contentKind").is_empty() { "feature" } else { pk(job, "contentKind") };
    let fps = job.fps.round();
    let edit = rate_pair(fps);
    let label_flag: Vec<String> = if smpte { vec!["-L".into()] } else { vec![] };
    (job.report)(0.95, "wrapping the picture");
    let pic_id = uuid4();
    let pic_name = format!("j2c_{pic_id}.mxf");
    let mut a = label_flag.clone();
    a.extend(["-a".into(), pic_id.clone(), "-p".into(), format!("{fps}"), j2c.to_string_lossy().into_owned(), root.join(&pic_name).to_string_lossy().into_owned()]);
    tools::run(&wrap, &a, Some(&dir))?;
    let wav = dir.join("audio.wav");
    let mut sound: Option<(String, String)> = None;
    if wav.is_file() {
        (job.report)(0.97, "wrapping the sound");
        let id = uuid4();
        let name = format!("pcm_{id}.mxf");
        let mut a = label_flag.clone();
        a.extend(["-a".into(), id.clone(), "-p".into(), format!("{fps}")]);
        if smpte {
            a.extend(["-m".into(), "51(L,R,C,LFE,Ls,Rs)".into(), "-w".into()]);
        }
        a.extend([wav.to_string_lossy().into_owned(), root.join(&name).to_string_lossy().into_owned()]);
        tools::run(&wrap, &a, Some(&dir))?;
        sound = Some((id, name));
    }
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    let creator = format!("formencoder {}", crate::VERSION);
    let (w, h) = (job.width, job.height);
    let ratio = if smpte { format!("{w} {h}") } else { format!("{:.2}", w as f64 / h as f64) };
    let cpl_id = uuid4();
    let reel_id = uuid4();
    let (cpl_ns, pkl_ns, am_ns) = if smpte {
        ("http://www.smpte-ra.org/schemas/429-7/2006/CPL", "http://www.smpte-ra.org/schemas/429-8/2007/PKL", "http://www.smpte-ra.org/schemas/429-9/2007/AM")
    } else {
        ("http://www.digicine.com/PROTO-ASDCP-CPL-20040511#", "http://www.digicine.com/PROTO-ASDCP-PKL-20040311#", "http://www.digicine.com/PROTO-ASDCP-AM-20040311#")
    };
    let t = xml_escape(&title);
    let mut cpl = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<CompositionPlaylist xmlns=\"{cpl_ns}\">\n  <Id>urn:uuid:{cpl_id}</Id>\n  <AnnotationText>{t}</AnnotationText>\n  <IssueDate>{now}</IssueDate>\n  <Issuer>{}</Issuer>\n  <Creator>{creator}</Creator>\n  <ContentTitleText>{t}</ContentTitleText>\n  <ContentKind>{kind}</ContentKind>\n", xml_escape(issuer));
    cpl.push_str(&format!("  <ContentVersion>\n    <Id>urn:uuid:{}</Id>\n    <LabelText>{t}</LabelText>\n  </ContentVersion>\n  <RatingList/>\n", uuid4()));
    cpl.push_str(&format!("  <ReelList>\n    <Reel>\n      <Id>urn:uuid:{reel_id}</Id>\n      <AssetList>\n        <MainPicture>\n          <Id>urn:uuid:{pic_id}</Id>\n          <EditRate>{edit}</EditRate>\n          <IntrinsicDuration>{frames}</IntrinsicDuration>\n          <EntryPoint>0</EntryPoint>\n          <Duration>{frames}</Duration>\n          <FrameRate>{edit}</FrameRate>\n          <ScreenAspectRatio>{ratio}</ScreenAspectRatio>\n        </MainPicture>\n"));
    if let Some((id, _)) = &sound {
        cpl.push_str(&format!("        <MainSound>\n          <Id>urn:uuid:{id}</Id>\n          <EditRate>{edit}</EditRate>\n          <IntrinsicDuration>{frames}</IntrinsicDuration>\n          <EntryPoint>0</EntryPoint>\n          <Duration>{frames}</Duration>\n        </MainSound>\n"));
    }
    cpl.push_str("      </AssetList>\n    </Reel>\n  </ReelList>\n</CompositionPlaylist>\n");
    let cpl_name = format!("cpl_{cpl_id}.xml");
    fs::write(root.join(&cpl_name), &cpl).map_err(|e| e.to_string())?;
    let (pic_type, snd_type, cpl_type) = if smpte { ("application/mxf", "application/mxf", "text/xml") } else { ("application/x-smpte-mxf;asdcpKind=Picture", "application/x-smpte-mxf;asdcpKind=Sound", "text/xml;asdcpKind=CPL") };
    let mut assets: Vec<(String, String, &str)> = vec![(pic_id.clone(), pic_name.clone(), pic_type)];
    if let Some((id, name)) = &sound {
        assets.push((id.clone(), name.clone(), snd_type));
    }
    assets.push((cpl_id.clone(), cpl_name.clone(), cpl_type));
    (job.report)(0.99, "hashing the package");
    let pkl_id = uuid4();
    let mut pkl = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<PackingList xmlns=\"{pkl_ns}\">\n  <Id>urn:uuid:{pkl_id}</Id>\n  <AnnotationText>{t}</AnnotationText>\n  <IssueDate>{now}</IssueDate>\n  <Issuer>{}</Issuer>\n  <Creator>{creator}</Creator>\n  <AssetList>\n", xml_escape(issuer));
    let mut sizes: Vec<(String, String, u64)> = Vec::new();
    for (id, name, ty) in &assets {
        let (hash, size) = sha1_b64(&root.join(name))?;
        pkl.push_str(&format!("    <Asset>\n      <Id>urn:uuid:{id}</Id>\n      <AnnotationText>{name}</AnnotationText>\n      <Hash>{hash}</Hash>\n      <Size>{size}</Size>\n      <Type>{ty}</Type>\n    </Asset>\n"));
        sizes.push((id.clone(), name.clone(), size));
    }
    pkl.push_str("  </AssetList>\n</PackingList>\n");
    let pkl_name = format!("pkl_{pkl_id}.xml");
    fs::write(root.join(&pkl_name), &pkl).map_err(|e| e.to_string())?;
    sizes.insert(0, (pkl_id.clone(), pkl_name.clone(), pkl.len() as u64));
    let mut am = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<AssetMap xmlns=\"{am_ns}\">\n  <Id>urn:uuid:{}</Id>\n  <AnnotationText>{t}</AnnotationText>\n", uuid4());
    if smpte {
        am.push_str(&format!("  <Creator>{creator}</Creator>\n  <VolumeCount>1</VolumeCount>\n  <IssueDate>{now}</IssueDate>\n  <Issuer>{}</Issuer>\n  <AssetList>\n", xml_escape(issuer)));
    } else {
        am.push_str(&format!("  <VolumeCount>1</VolumeCount>\n  <IssueDate>{now}</IssueDate>\n  <Issuer>{}</Issuer>\n  <Creator>{creator}</Creator>\n  <AssetList>\n", xml_escape(issuer)));
    }
    for (id, name, size) in &sizes {
        let pkl_flag = if id == &pkl_id { "      <PackingList>true</PackingList>\n" } else { "" };
        am.push_str(&format!("    <Asset>\n      <Id>urn:uuid:{id}</Id>\n{pkl_flag}      <ChunkList>\n        <Chunk>\n          <Path>{name}</Path>\n          <VolumeIndex>1</VolumeIndex>\n          <Offset>0</Offset>\n          <Length>{size}</Length>\n        </Chunk>\n      </ChunkList>\n    </Asset>\n"));
    }
    am.push_str("  </AssetList>\n</AssetMap>\n");
    let (am_name, vol_name) = if smpte { ("ASSETMAP.xml", "VOLINDEX.xml") } else { ("ASSETMAP", "VOLINDEX") };
    fs::write(root.join(am_name), am).map_err(|e| e.to_string())?;
    fs::write(root.join(vol_name), format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<VolumeIndex xmlns=\"{am_ns}\">\n  <Index>1</Index>\n</VolumeIndex>\n")).map_err(|e| e.to_string())?;
    let mut files = vec![root.join(am_name), root.join(vol_name), root.join(&pkl_name), root.join(&cpl_name), root.join(&pic_name)];
    if let Some((_, n)) = &sound {
        files.push(root.join(n));
    }
    Ok(files.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
}
