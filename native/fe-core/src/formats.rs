use std::sync::OnceLock;

use serde_json::{Value, json};

use crate::encoders::Detected;
use crate::util::Res;

pub fn video_codecs() -> &'static Value {
    static V: OnceLock<Value> = OnceLock::new();
    V.get_or_init(|| {
        json!({
            "h264": {"label": "H.264 (AVC)", "family": "h264", "rate": ["vbr1", "vbr2", "cbr", "quality"], "profiles": ["baseline", "main", "high", "high10", "high422"], "bitDepths": [8, 10], "chroma": ["420", "422"], "levels": ["auto", "3.1", "4.0", "4.1", "4.2", "5.0", "5.1", "5.2", "6.0", "6.1", "6.2"]},
            "hevc": {"label": "HEVC (H.265)", "family": "hevc", "rate": ["vbr1", "vbr2", "cbr", "quality"], "profiles": ["main", "main10", "main422-10"], "bitDepths": [8, 10], "chroma": ["420", "422"], "levels": ["auto", "4.0", "4.1", "5.0", "5.1", "5.2", "6.0", "6.1", "6.2"], "hdr": true},
            "av1": {"label": "AV1", "family": "av1", "rate": ["vbr1", "cbr", "quality"], "profiles": ["main"], "bitDepths": [8, 10], "chroma": ["420"], "hdr": true},
            "vp9": {"label": "VP9", "family": "vp9", "rate": ["vbr1", "vbr2", "cbr", "quality"], "bitDepths": [8, 10], "chroma": ["420"], "alpha": true, "hdr": true},
            "vp8": {"label": "VP8", "family": "vp8", "rate": ["vbr1", "cbr", "quality"], "bitDepths": [8], "chroma": ["420"], "alpha": true},
            "prores": {"label": "Apple ProRes", "family": "prores", "rate": ["profile"], "flavors": [["proxy", "Apple ProRes 422 Proxy"], ["lt", "Apple ProRes 422 LT"], ["422", "Apple ProRes 422"], ["hq", "Apple ProRes 422 HQ"], ["4444", "Apple ProRes 4444"], ["4444xq", "Apple ProRes 4444 XQ"]], "bitDepths": [10, 12], "alpha": true, "hdr": true},
            "dnxhr": {"label": "Avid DNxHR / DNxHD", "family": "dnxhd", "rate": ["profile"], "flavors": [["dnxhr_lb", "DNxHR LB"], ["dnxhr_sq", "DNxHR SQ"], ["dnxhr_hq", "DNxHR HQ"], ["dnxhr_hqx", "DNxHR HQX 10-bit"], ["dnxhr_444", "DNxHR 444 10-bit"], ["dnxhd_36", "DNxHD 36 (1080p)"], ["dnxhd_145", "DNxHD 145 (1080)"], ["dnxhd_220", "DNxHD 220 (1080)"], ["dnxhd_220x", "DNxHD 220x 10-bit (1080)"]], "bitDepths": [8, 10]},
            "cineform": {"label": "GoPro CineForm", "family": "cineform", "rate": ["profile"], "flavors": [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["filmscan1", "Film Scan 1"], ["filmscan2", "Film Scan 2"], ["filmscan3", "Film Scan 3"]], "bitDepths": [10, 12], "alpha": true},
            "xdcam": {"label": "XDCAM HD 422 (MPEG-2)", "family": "mpeg2", "rate": ["cbr"], "flavors": [["50", "XDCAM HD 422 50 Mb/s"], ["35", "XDCAM HD 35 Mb/s (4:2:0)"]], "bitDepths": [8]},
            "mpeg2": {"label": "MPEG-2 Video", "family": "mpeg2", "rate": ["vbr1", "vbr2", "cbr"], "profiles": ["main", "422"], "bitDepths": [8]},
            "mpeg4": {"label": "MPEG-4 Part 2", "family": "mpeg4", "rate": ["vbr1", "vbr2", "cbr", "quality"], "bitDepths": [8]},
            "jpeg2000": {"label": "JPEG 2000", "family": "jpeg2000", "rate": ["quality"], "bitDepths": [8, 10, 12], "alpha": true},
            "mjpeg": {"label": "Photo-JPEG (Motion JPEG)", "family": "mjpeg", "rate": ["quality"], "bitDepths": [8]},
            "qtrle": {"label": "Animation (QuickTime RLE)", "family": "qtrle", "rate": ["lossless"], "bitDepths": [8], "alpha": true},
            "uncompressed": {"label": "Uncompressed", "family": "uncompressed", "rate": ["lossless"], "flavors": [["uyvy422", "8-bit 4:2:2 (2vuy)"], ["v210", "10-bit 4:2:2 (v210)"], ["rgb24", "8-bit RGB"], ["rgba", "8-bit RGBA"]], "bitDepths": [8, 10], "alpha": true},
            "ffv1": {"label": "FFV1 (lossless)", "family": "ffv1", "rate": ["lossless"], "bitDepths": [8, 10, 12, 16], "alpha": true},
            "png": {"label": "PNG", "family": "png", "rate": ["lossless"], "bitDepths": [8, 16], "alpha": true},
            "tiff": {"label": "TIFF", "family": "tiff", "rate": ["lossless"], "flavors": [["none", "No compression"], ["lzw", "LZW"], ["deflate", "Deflate"], ["packbits", "PackBits"]], "bitDepths": [8, 16], "alpha": true},
            "jpeg": {"label": "JPEG", "family": "mjpeg", "rate": ["quality"], "bitDepths": [8]},
            "dpx": {"label": "DPX", "family": "dpx", "rate": ["lossless"], "bitDepths": [8, 10, 12, 16], "alpha": true},
            "exr": {"label": "OpenEXR", "family": "exr", "rate": ["lossless"], "flavors": [["zip1", "ZIP (single line)"], ["zip16", "ZIP (16 lines)"], ["rle", "RLE"], ["none", "None"]], "bitDepths": [16, 32], "alpha": true},
            "targa": {"label": "Targa", "family": "targa", "rate": ["lossless"], "bitDepths": [8], "alpha": true},
            "bmp": {"label": "BMP", "family": "bmp", "rate": ["lossless"], "bitDepths": [8]},
            "webp": {"label": "WebP", "family": "webp", "rate": ["quality"], "bitDepths": [8], "alpha": true},
            "gif": {"label": "GIF", "family": "gif", "rate": ["palette"], "bitDepths": [8], "alpha": true}
        })
    })
}

pub fn audio_codecs() -> &'static Value {
    static A: OnceLock<Value> = OnceLock::new();
    A.get_or_init(|| {
        json!({
            "aac": {"label": "AAC", "family": "aac", "bitrates": [64, 96, 128, 160, 192, 256, 320, 384, 512], "rates": [32000, 44100, 48000, 96000], "lossy": true},
            "mp3": {"label": "MP3", "family": "mp3", "bitrates": [96, 128, 160, 192, 256, 320], "rates": [32000, 44100, 48000], "lossy": true},
            "opus": {"label": "Opus", "family": "opus", "bitrates": [64, 96, 128, 160, 192, 256, 320, 510], "rates": [48000], "lossy": true},
            "vorbis": {"label": "Vorbis", "family": "vorbis", "bitrates": [96, 128, 160, 192, 256, 320], "rates": [44100, 48000], "lossy": true},
            "ac3": {"label": "Dolby Digital (AC-3)", "family": "ac3", "bitrates": [192, 224, 256, 320, 384, 448, 640], "rates": [48000], "lossy": true},
            "eac3": {"label": "Dolby Digital Plus (E-AC-3)", "family": "eac3", "bitrates": [192, 256, 384, 448, 640, 768, 1024], "rates": [48000], "lossy": true},
            "mp2": {"label": "MPEG-1 Layer II", "family": "mp2", "bitrates": [192, 224, 256, 320, 384], "rates": [44100, 48000], "lossy": true},
            "flac": {"label": "FLAC", "family": "flac", "rates": [44100, 48000, 88200, 96000, 192000], "bitDepths": [16, 24]},
            "alac": {"label": "Apple Lossless", "family": "alac", "rates": [44100, 48000, 88200, 96000, 192000], "bitDepths": [16, 24]},
            "pcm": {"label": "Uncompressed PCM", "family": "pcm", "rates": [44100, 48000, 88200, 96000, 192000], "bitDepths": [16, 24, 32]}
        })
    })
}

pub fn catalogue() -> &'static Value {
    static F: OnceLock<Value> = OnceLock::new();
    F.get_or_init(|| {
        json!({
            "h264": {"label": "H.264", "group": "Video", "ext": "mp4", "video": ["h264"], "audio": ["aac", "ac3", "eac3", "mp3"], "containers": ["mp4", "mov", "mkv", "ts", "none"]},
            "hevc": {"label": "HEVC (H.265)", "group": "Video", "ext": "mp4", "video": ["hevc"], "audio": ["aac", "ac3", "eac3"], "containers": ["mp4", "mov", "mkv", "ts", "none"]},
            "av1": {"label": "AV1", "group": "Video", "ext": "mp4", "video": ["av1"], "audio": ["opus", "aac"], "containers": ["mp4", "webm", "mkv"]},
            "webm": {"label": "WebM", "group": "Video", "ext": "webm", "video": ["vp9", "vp8", "av1"], "audio": ["opus", "vorbis"], "containers": ["webm"]},
            "quicktime": {"label": "QuickTime", "group": "Video", "ext": "mov", "video": ["prores", "dnxhr", "cineform", "qtrle", "uncompressed", "png", "mjpeg", "h264", "hevc"], "audio": ["pcm", "aac", "alac"], "containers": ["mov"]},
            "prores": {"label": "Apple ProRes", "group": "Video", "ext": "mov", "video": ["prores"], "audio": ["pcm", "aac"], "containers": ["mov"]},
            "prores_mxf": {"label": "Apple ProRes MXF OP1a", "group": "Broadcast", "ext": "mxf", "video": ["prores"], "audio": ["pcm"], "containers": ["mxf"]},
            "dnxhr_mxf": {"label": "DNxHR/DNxHD MXF OP1a", "group": "Broadcast", "ext": "mxf", "video": ["dnxhr"], "audio": ["pcm"], "containers": ["mxf"]},
            "mxf_op1a": {"label": "MXF OP1a", "group": "Broadcast", "ext": "mxf", "video": ["xdcam", "dnxhr", "prores", "jpeg2000", "mpeg2"], "audio": ["pcm"], "containers": ["mxf"]},
            "jpeg2000_mxf": {"label": "JPEG 2000 MXF OP1a", "group": "Broadcast", "ext": "mxf", "video": ["jpeg2000"], "audio": ["pcm"], "containers": ["mxf"]},
            "cineform": {"label": "GoPro CineForm", "group": "Video", "ext": "mov", "video": ["cineform"], "audio": ["pcm"], "containers": ["mov"]},
            "mpeg2": {"label": "MPEG-2", "group": "Broadcast", "ext": "mpg", "video": ["mpeg2"], "audio": ["mp2", "ac3", "pcm"], "containers": ["mpeg", "ts"]},
            "mpeg2_dvd": {"label": "MPEG-2-DVD", "group": "Broadcast", "ext": "mpg", "video": ["mpeg2"], "audio": ["ac3", "mp2", "pcm"], "containers": ["dvd"], "dvd": true},
            "mpeg2_bluray": {"label": "MPEG2 Blu-ray", "group": "Broadcast", "ext": "m2v", "video": ["mpeg2"], "audio": ["ac3", "pcm"], "containers": ["none", "m2ts"], "bluray": true},
            "h264_bluray": {"label": "H.264 Blu-ray", "group": "Broadcast", "ext": "264", "video": ["h264"], "audio": ["ac3", "pcm"], "containers": ["none", "m2ts"], "bluray": true},
            "mpeg4": {"label": "MPEG-4", "group": "Video", "ext": "mp4", "video": ["mpeg4"], "audio": ["aac"], "containers": ["mp4", "3gp"]},
            "avi": {"label": "AVI", "group": "Video", "ext": "avi", "video": ["uncompressed", "mjpeg", "ffv1"], "audio": ["pcm"], "containers": ["avi"]},
            "matroska": {"label": "Matroska (archival)", "group": "Video", "ext": "mkv", "video": ["ffv1", "h264", "hevc", "av1", "vp9", "prores"], "audio": ["flac", "pcm", "opus", "aac"], "containers": ["mkv"]},
            "gif": {"label": "Animated GIF", "group": "Video", "ext": "gif", "video": ["gif"], "audio": [], "containers": ["gif"], "noAudio": true},
            "png": {"label": "PNG", "group": "Image", "ext": "png", "video": ["png"], "audio": [], "image": true},
            "tiff": {"label": "TIFF", "group": "Image", "ext": "tif", "video": ["tiff"], "audio": [], "image": true},
            "jpeg": {"label": "JPEG", "group": "Image", "ext": "jpg", "video": ["jpeg"], "audio": [], "image": true},
            "dpx": {"label": "DPX", "group": "Image", "ext": "dpx", "video": ["dpx"], "audio": [], "image": true},
            "exr": {"label": "OpenEXR", "group": "Image", "ext": "exr", "video": ["exr"], "audio": [], "image": true},
            "targa": {"label": "Targa", "group": "Image", "ext": "tga", "video": ["targa"], "audio": [], "image": true},
            "bmp": {"label": "BMP", "group": "Image", "ext": "bmp", "video": ["bmp"], "audio": [], "image": true},
            "jpeg2000": {"label": "JPEG 2000", "group": "Image", "ext": "jp2", "video": ["jpeg2000"], "audio": [], "image": true},
            "webp": {"label": "WebP", "group": "Image", "ext": "webp", "video": ["webp"], "audio": [], "image": true},
            "wav": {"label": "Waveform Audio", "group": "Audio", "ext": "wav", "video": [], "audio": ["pcm"], "audioOnly": true, "containers": ["wav"]},
            "bwf": {"label": "Broadcast WAV (BWF)", "group": "Audio", "ext": "wav", "video": [], "audio": ["pcm"], "audioOnly": true, "containers": ["wav"], "bwf": true},
            "aiff": {"label": "AIFF", "group": "Audio", "ext": "aif", "video": [], "audio": ["pcm"], "audioOnly": true, "containers": ["aiff"]},
            "mp3": {"label": "MP3", "group": "Audio", "ext": "mp3", "video": [], "audio": ["mp3"], "audioOnly": true, "containers": ["mp3"]},
            "aac": {"label": "AAC Audio", "group": "Audio", "ext": "m4a", "video": [], "audio": ["aac", "alac"], "audioOnly": true, "containers": ["m4a"]},
            "flac": {"label": "FLAC", "group": "Audio", "ext": "flac", "video": [], "audio": ["flac"], "audioOnly": true, "containers": ["flac"]},
            "ogg": {"label": "Ogg (Opus or Vorbis)", "group": "Audio", "ext": "ogg", "video": [], "audio": ["opus", "vorbis"], "audioOnly": true, "containers": ["ogg"]}
        })
    })
}

pub fn ids() -> Vec<String> {
    catalogue().as_object().map(|m| m.keys().cloned().collect()).unwrap_or_default()
}

pub fn get(fmt: &str) -> Res<&'static Value> {
    catalogue().get(fmt).ok_or_else(|| format!("no format {fmt:?}; formats: {}", ids().join(", ")))
}

pub fn label(fmt: &str) -> String {
    catalogue().get(fmt).and_then(|f| f["label"].as_str()).unwrap_or(fmt).to_string()
}

pub fn is_image(fmt: &str) -> bool {
    catalogue().get(fmt).and_then(|f| f.get("image")).and_then(Value::as_bool).unwrap_or(false)
}

pub fn is_audio_only(fmt: &str) -> bool {
    catalogue().get(fmt).and_then(|f| f.get("audioOnly")).and_then(Value::as_bool).unwrap_or(false)
}

pub fn strs(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub fn vcodec(id: &str) -> &'static Value {
    static NULL: Value = Value::Null;
    video_codecs().get(id).unwrap_or(&NULL)
}

pub fn acodec(id: &str) -> &'static Value {
    static NULL: Value = Value::Null;
    audio_codecs().get(id).unwrap_or(&NULL)
}

pub fn muxer(container: &str) -> Option<&'static str> {
    Some(match container {
        "mp4" => "mp4",
        "mov" => "mov",
        "mkv" => "matroska",
        "ts" | "m2ts" => "mpegts",
        "webm" => "webm",
        "mxf" => "mxf",
        "mpeg" => "mpeg",
        "dvd" => "dvd",
        "3gp" => "3gp",
        "avi" => "avi",
        "gif" => "gif",
        "wav" => "wav",
        "aiff" => "aiff",
        "mp3" => "mp3",
        "m4a" => "ipod",
        "flac" => "flac",
        "ogg" => "ogg",
        _ => return None,
    })
}

pub fn container_ext(container: &str) -> Option<&'static str> {
    Some(match container {
        "mp4" => "mp4",
        "mov" => "mov",
        "mkv" => "mkv",
        "ts" => "ts",
        "m2ts" => "m2ts",
        "webm" => "webm",
        "mxf" => "mxf",
        "mpeg" | "dvd" => "mpg",
        "3gp" => "3gp",
        "avi" => "avi",
        "gif" => "gif",
        "wav" => "wav",
        "aiff" => "aif",
        "mp3" => "mp3",
        "m4a" => "m4a",
        "flac" => "flac",
        "ogg" => "ogg",
        _ => return None,
    })
}

pub fn raw_ext(codec: &str) -> &'static str {
    match codec {
        "h264" => "264",
        "hevc" => "265",
        "mpeg2" => "m2v",
        "av1" => "obu",
        _ => "bin",
    }
}

pub const SCALING: &[(&str, &str)] = &[("fit", "Scale To Fit"), ("fitBlack", "Scale To Fit Black Borders"), ("fill", "Scale To Fill"), ("stretch", "Stretch To Fill"), ("matchWidth", "Change Output Size To Match Source")];
pub const INTERPOLATION: &[(&str, &str)] = &[("sampling", "Frame Sampling"), ("blending", "Frame Blending"), ("opticalFlow", "Optical Flow")];
pub const FIELD_ORDERS: &[(&str, &str)] = &[("source", "Same as source"), ("progressive", "Progressive"), ("tff", "Upper First"), ("bff", "Lower First")];
pub const FRAME_RATES: &[f64] = &[10.0, 12.0, 12.5, 15.0, 23.976, 24.0, 25.0, 29.97, 30.0, 47.952, 48.0, 50.0, 59.94, 60.0, 100.0, 119.88, 120.0];
pub const COLOR_SPACES: &[(&str, &str)] = &[("source", "Same as source"), ("rec709", "Rec. 709"), ("rec601", "Rec. 601"), ("rec2020", "Rec. 2020"), ("rec2100pq", "Rec. 2100 PQ (HDR10)"), ("rec2100hlg", "Rec. 2100 HLG"), ("p3d65", "Display P3 / P3-D65")];
pub const PIXEL_ASPECTS: &[(&str, &str)] = &[("source", "Same as source"), ("1:1", "Square Pixels (1.0)"), ("10:11", "D1/DV NTSC (0.9091)"), ("40:33", "D1/DV NTSC Widescreen (1.2121)"), ("12:11", "D1/DV PAL (1.0940)"), ("16:11", "D1/DV PAL Widescreen (1.4587)"), ("4:3", "HDV 1080 / DVCPRO HD 720 (1.333)"), ("3:2", "DVCPRO HD 1080 (1.5)"), ("2:1", "Anamorphic 2:1 (2.0)")];
pub const CHANNEL_LAYOUTS: &[(&str, &str)] = &[("source", "Same as source"), ("mono", "Mono"), ("stereo", "Stereo"), ("5.1", "5.1"), ("7.1", "7.1"), ("tracks", "Each source track as its own track"), ("discrete", "Discrete channels (one track)"), ("custom", "Custom channel routing")];

pub fn rate_label(r: &str) -> &'static str {
    match r {
        "vbr1" => "VBR, 1 pass",
        "vbr2" => "VBR, 2 pass",
        "cbr" => "CBR",
        "quality" => "Constant quality",
        "profile" => "Fixed by profile",
        "lossless" => "Lossless",
        _ => "Palette",
    }
}

fn pairs(list: &[(&str, &str)]) -> Value {
    Value::Array(list.iter().map(|(a, b)| json!([a, b])).collect())
}

pub fn listing(det: Option<&Detected>) -> Value {
    let mut out = Vec::new();
    for (id, f) in catalogue().as_object().unwrap() {
        let mut row = json!({"id": id, "label": f["label"], "group": f["group"], "ext": f["ext"], "video": f["video"], "audio": f["audio"], "containers": f.get("containers").cloned().unwrap_or(json!([])),
                             "image": f.get("image").cloned().unwrap_or(json!(false)), "audioOnly": f.get("audioOnly").cloned().unwrap_or(json!(false))});
        if let Some(d) = det {
            let mut codecs = serde_json::Map::new();
            for c in strs(&f["video"]) {
                let fam = vcodec(&c)["family"].as_str().unwrap_or("").to_string();
                codecs.insert(c, json!(d.video.get(&fam).map(|v| !v.is_empty()).unwrap_or(false)));
            }
            let mut acs = serde_json::Map::new();
            for c in strs(&f["audio"]) {
                let fam = acodec(&c)["family"].as_str().unwrap_or("").to_string();
                acs.insert(c, json!(d.audio.get(&fam).map(|v| !v.is_empty()).unwrap_or(false)));
            }
            let v_ok = codecs.is_empty() || codecs.values().any(|x| x == &json!(true));
            let a_ok = acs.is_empty() || acs.values().any(|x| x == &json!(true));
            row["available"] = json!(v_ok && (a_ok || !is_audio_only(id)));
            row["codecs"] = Value::Object(codecs);
            row["audioCodecs"] = Value::Object(acs);
        }
        out.push(row);
    }
    Value::Array(out)
}

fn field(key: &str, label: &str, kind: &str, extra: Value) -> Value {
    let mut v = json!({"key": key, "label": label, "type": kind});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    v
}

pub fn fields(fmt: &str, settings: Option<&Value>) -> Res {
    let f = get(fmt)?;
    let s = settings.cloned().unwrap_or(Value::Null);
    let vlist = strs(&f["video"]);
    let alist = strs(&f["audio"]);
    let codec_id = s["video"]["codec"].as_str().map(String::from).or_else(|| vlist.first().cloned()).unwrap_or_default();
    let codec = vcodec(&codec_id);
    let image = is_image(fmt);
    let mut video = Vec::new();
    if !vlist.is_empty() {
        if vlist.len() > 1 {
            video.push(field("video.codec", "Video Codec", "select", json!({"options": vlist.iter().map(|c| json!([c, vcodec(c)["label"]])).collect::<Vec<_>>()})));
        }
        if codec.get("flavors").is_some() {
            video.push(field("video.flavor", "Profile", "select", json!({"options": codec["flavors"]})));
        }
        video.push(field("video.matchSource", "Match Source", "bool", json!({})));
        video.push(field("video.width", "Width", "int", json!({"min": 16, "max": 16384, "unit": "px", "nullable": true})));
        video.push(field("video.height", "Height", "int", json!({"min": 16, "max": 16384, "unit": "px", "nullable": true})));
        let mut rates = vec![json!([null, "Same as source"])];
        rates.extend(FRAME_RATES.iter().map(|r| json!([r, crate::util::fmt_g(*r)])));
        video.push(field("video.frameRate", "Frame Rate", "select", json!({"options": rates, "nullable": true})));
        if !image {
            video.push(field("video.fieldOrder", "Field Order", "select", json!({"options": pairs(FIELD_ORDERS)})));
        }
        video.push(field("video.pixelAspect", "Aspect", "select", json!({"options": pairs(PIXEL_ASPECTS)})));
        if let Some(p) = codec.get("profiles") {
            video.push(field("video.profile", "Profile", "select", json!({"options": strs(p).iter().map(|x| json!([x, x])).collect::<Vec<_>>()})));
        }
        if let Some(l) = codec.get("levels") {
            video.push(field("video.level", "Level", "select", json!({"options": strs(l).iter().map(|x| json!([x, if x == "auto" { "Auto" } else { x }])).collect::<Vec<_>>()})));
        }
        if codec["bitDepths"].as_array().map(|a| a.len() > 1).unwrap_or(false) {
            video.push(field("video.bitDepth", "Bit Depth", "select", json!({"options": codec["bitDepths"].as_array().unwrap().iter().map(|d| json!([d, format!("{}-bit", d)])).collect::<Vec<_>>()})));
        }
        if codec["chroma"].as_array().map(|a| a.len() > 1).unwrap_or(false) {
            video.push(field("video.chroma", "Chroma", "select", json!({"options": strs(&codec["chroma"]).iter().map(|c| json!([c, format!("4:{}:{}", &c[1..2], &c[2..3])])).collect::<Vec<_>>()})));
        }
        let rate_modes = strs(&codec["rate"]);
        if rate_modes.len() > 1 || rate_modes.first().map(|r| r == "cbr" || r == "quality").unwrap_or(false) {
            video.push(field("video.rateControl", "Bitrate Encoding", "select", json!({"options": rate_modes.iter().map(|r| json!([r, rate_label(r)])).collect::<Vec<_>>()})));
            if rate_modes.iter().any(|r| r != "quality") {
                video.push(field("video.targetBitrate", "Target Bitrate", "number", json!({"min": 0.05, "max": 2000, "step": 0.1, "unit": "Mb/s", "showIf": "video.rateControl!=quality"})));
            }
            if rate_modes.iter().any(|r| r == "vbr1" || r == "vbr2") {
                video.push(field("video.maxBitrate", "Maximum Bitrate", "number", json!({"min": 0.05, "max": 3000, "step": 0.1, "unit": "Mb/s", "showIf": "video.rateControl=vbr1|vbr2"})));
            }
            if rate_modes.iter().any(|r| r == "quality") {
                video.push(field("video.quality", "Quality", "int", json!({"min": 0, "max": 100, "unit": "%", "showIf": "video.rateControl=quality"})));
            }
        }
        if !image && !["prores", "dnxhr", "cineform", "qtrle", "uncompressed", "png", "ffv1", "gif", "mjpeg", "jpeg2000"].contains(&codec_id.as_str()) {
            video.push(field("video.keyframeDistance", "Key Frame Distance", "int", json!({"min": 1, "max": 1000, "unit": "frames", "nullable": true})));
        }
        if ["h264", "hevc", "av1", "vp9", "mpeg2", "prores", "dnxhr"].contains(&codec_id.as_str()) {
            video.push(field("video.hardware", "Performance", "select", json!({"options": [["auto", "Hardware Encoding when available"], ["on", "Hardware Encoding"], ["off", "Software Encoding"]]})));
        }
        video.push(field("video.colorSpace", "Color Space", "select", json!({"options": pairs(COLOR_SPACES)})));
        if ["h264", "hevc", "av1", "prores"].contains(&codec_id.as_str()) && strs(&f["containers"]).iter().any(|c| c == "mp4" || c == "mov") {
            video.push(field("video.vr.enabled", "Video Is VR", "bool", json!({})));
            video.push(field("video.vr.layout", "Frame Layout", "select", json!({"options": [["mono", "Monoscopic"], ["topBottom", "Stereoscopic - Over/Under"], ["leftRight", "Stereoscopic - Side by Side"]], "showIf": "video.vr.enabled=true"})));
            video.push(field("video.vr.hfov", "Horizontal Field of View", "select", json!({"options": [[360, "360°"], [180, "180°"]], "showIf": "video.vr.enabled=true"})));
            video.push(field("video.vr.vfov", "Vertical Field of View", "select", json!({"options": [[180, "180°"], [90, "90°"]], "showIf": "video.vr.enabled=true"})));
        }
        if codec.get("hdr").is_some() {
            video.push(field("video.hdr10", "Include HDR10 Metadata", "bool", json!({"showIf": "video.colorSpace=rec2100pq"})));
            video.push(field("video.maxCLL", "Maximum Content Light Level", "int", json!({"min": 0, "max": 10000, "unit": "nits", "showIf": "video.hdr10=true"})));
            video.push(field("video.maxFALL", "Maximum Frame Average Light Level", "int", json!({"min": 0, "max": 10000, "unit": "nits", "showIf": "video.hdr10=true"})));
        }
        if codec.get("alpha").is_some() {
            video.push(field("video.alpha", "Include Alpha Channel", "bool", json!({})));
        }
        if image {
            video.push(field("video.sequence", "Export As Sequence", "bool", json!({})));
            video.push(field("video.startNumber", "Start Number", "int", json!({"min": 0, "max": 99999999, "showIf": "video.sequence=true"})));
        }
        if fmt == "gif" {
            video.push(field("video.loop", "Loop", "bool", json!({})));
            video.push(field("video.dither", "Dither", "select", json!({"options": [["sierra2_4a", "Sierra"], ["bayer", "Bayer"], ["floyd_steinberg", "Floyd-Steinberg"], ["none", "None"]]})));
        }
        video.push(field("video.encoder", "Encoder (FFmpeg name)", "text", json!({"nullable": true, "advanced": true})));
    }
    let mut audio = Vec::new();
    if !alist.is_empty() {
        let ac_id = s["audio"]["codec"].as_str().map(String::from).unwrap_or_else(|| alist[0].clone());
        let ac = acodec(&ac_id);
        if alist.len() > 1 {
            audio.push(field("audio.codec", "Audio Codec", "select", json!({"options": alist.iter().map(|c| json!([c, acodec(c)["label"]])).collect::<Vec<_>>()})));
        }
        let mut rates = vec![json!([null, "Same as source"])];
        rates.extend(ac["rates"].as_array().cloned().unwrap_or_default().into_iter().map(|r| json!([r, format!("{} Hz", r)])));
        audio.push(field("audio.sampleRate", "Sample Rate", "select", json!({"options": rates, "nullable": true})));
        audio.push(field("audio.channels", "Channels", "select", json!({"options": pairs(CHANNEL_LAYOUTS)})));
        audio.push(field("audio.routing", "Channel Routing", "routing", json!({"showIf": "audio.channels=custom", "layouts": ["mono", "stereo", "quad", "5.1", "7.1"]})));
        if ac.get("lossy").is_some() {
            audio.push(field("audio.bitrate", "Bitrate", "select", json!({"options": ac["bitrates"].as_array().cloned().unwrap_or_default().into_iter().map(|b| json!([b, format!("{} kb/s", b)])).collect::<Vec<_>>()})));
        }
        if ac.get("bitDepths").is_some() {
            audio.push(field("audio.bitDepth", "Sample Size", "select", json!({"options": ac["bitDepths"].as_array().cloned().unwrap_or_default().into_iter().map(|d| json!([d, format!("{}-bit", d)])).collect::<Vec<_>>()})));
        }
        if ac_id == "pcm" {
            audio.push(field("audio.float", "32-bit Float", "bool", json!({"showIf": "audio.bitDepth=32"})));
        }
    }
    let mut mux = Vec::new();
    let containers = strs(&f["containers"]);
    if containers.len() > 1 {
        mux.push(field("multiplexer.container", "Multiplexing", "select", json!({"options": containers.iter().map(|c| json!([c, if c == "none" { "None (elementary streams)".to_string() } else { c.to_uppercase() }])).collect::<Vec<_>>()})));
    }
    if containers.iter().any(|c| c == "mp4" || c == "mov") {
        mux.push(field("multiplexer.fastStart", "Fast Start (index at the front)", "bool", json!({})));
    }
    Ok(json!({"format": fmt, "label": f["label"], "video": video, "audio": audio, "multiplexer": mux}))
}
