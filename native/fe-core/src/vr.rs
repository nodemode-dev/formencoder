use std::fs;

use serde_json::Value;

use crate::util::Res;

const SPHERICAL_UUID: [u8; 16] = [0xff, 0xcc, 0x82, 0x63, 0xf8, 0x55, 0x4a, 0x93, 0x88, 0x14, 0x58, 0x7a, 0x02, 0x52, 0x1f, 0xdd];
const CONTAINERS: &[&[u8; 4]] = &[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"udta"];

pub fn wanted(s: &Value) -> bool {
    s["video"]["vr"]["enabled"].as_bool().unwrap_or(false)
}

pub fn xml(s: &Value, width: u32, height: u32) -> String {
    let vr = &s["video"]["vr"];
    let layout = vr["layout"].as_str().unwrap_or("mono");
    let stereo = match layout {
        "topBottom" => "top-bottom",
        "leftRight" => "left-right",
        _ => "mono",
    };
    let hfov = vr["hfov"].as_f64().unwrap_or(360.0).clamp(1.0, 360.0);
    let vfov = vr["vfov"].as_f64().unwrap_or(180.0).clamp(1.0, 180.0);
    let (eye_w, eye_h) = match layout {
        "topBottom" => (width, height / 2),
        "leftRight" => (width / 2, height),
        _ => (width, height),
    };
    let full_w = ((eye_w as f64) * 360.0 / hfov).round() as u32;
    let full_h = ((eye_h as f64) * 180.0 / vfov).round() as u32;
    let left = (full_w - eye_w) / 2;
    let top = (full_h - eye_h) / 2;
    let mut x = String::from("<?xml version=\"1.0\"?><rdf:SphericalVideo xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\" xmlns:GSpherical=\"http://ns.google.com/videos/1.0/spherical/\">");
    x.push_str("<GSpherical:Spherical>true</GSpherical:Spherical><GSpherical:Stitched>true</GSpherical:Stitched><GSpherical:StitchingSoftware>formencoder</GSpherical:StitchingSoftware><GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType>");
    if stereo != "mono" {
        x.push_str(&format!("<GSpherical:StereoMode>{stereo}</GSpherical:StereoMode>"));
    }
    if (hfov - 360.0).abs() > 0.01 || (vfov - 180.0).abs() > 0.01 {
        x.push_str(&format!(
            "<GSpherical:CroppedAreaImageWidthPixels>{eye_w}</GSpherical:CroppedAreaImageWidthPixels><GSpherical:CroppedAreaImageHeightPixels>{eye_h}</GSpherical:CroppedAreaImageHeightPixels><GSpherical:FullPanoWidthPixels>{full_w}</GSpherical:FullPanoWidthPixels><GSpherical:FullPanoHeightPixels>{full_h}</GSpherical:FullPanoHeightPixels><GSpherical:CroppedAreaLeftPixels>{left}</GSpherical:CroppedAreaLeftPixels><GSpherical:CroppedAreaTopPixels>{top}</GSpherical:CroppedAreaTopPixels>"
        ));
    }
    x.push_str("</rdf:SphericalVideo>");
    x
}

struct Atom {
    start: usize,
    header: usize,
    size: usize,
    kind: [u8; 4],
}

fn atoms(buf: &[u8], from: usize, to: usize) -> Res<Vec<Atom>> {
    let mut out = Vec::new();
    let mut p = from;
    while p + 8 <= to {
        let mut size = u32::from_be_bytes(buf[p..p + 4].try_into().unwrap()) as usize;
        let kind: [u8; 4] = buf[p + 4..p + 8].try_into().unwrap();
        let mut header = 8;
        if size == 1 {
            if p + 16 > to {
                return Err("a box header runs past the end of its parent".into());
            }
            size = u64::from_be_bytes(buf[p + 8..p + 16].try_into().unwrap()) as usize;
            header = 16;
        } else if size == 0 {
            size = to - p;
        }
        if size < header || p + size > to {
            return Err(format!("the {} box is damaged", String::from_utf8_lossy(&kind)));
        }
        out.push(Atom { start: p, header, size, kind });
        p += size;
    }
    Ok(out)
}

fn is_video_trak(buf: &[u8], trak: &Atom) -> bool {
    let end = trak.start + trak.size;
    let Ok(kids) = atoms(buf, trak.start + trak.header, end) else { return false };
    for m in kids.iter().filter(|a| &a.kind == b"mdia") {
        if let Ok(inner) = atoms(buf, m.start + m.header, m.start + m.size) {
            for h in inner.iter().filter(|a| &a.kind == b"hdlr") {
                let off = h.start + h.header + 8;
                if off + 4 <= h.start + h.size && &buf[off..off + 4] == b"vide" {
                    return true;
                }
            }
        }
    }
    false
}

fn rebuild(buf: &[u8], atom: &Atom, insert_into: Option<usize>, payload: &[u8], shift: i64, mdat_after: usize) -> Res<Vec<u8>> {
    let end = atom.start + atom.size;
    let body_start = atom.start + atom.header;
    let mut body: Vec<u8> = Vec::new();
    if CONTAINERS.iter().any(|c| **c == atom.kind) {
        for kid in atoms(buf, body_start, end)? {
            let target = insert_into == Some(kid.start);
            let mut rebuilt = rebuild(buf, &kid, if target { None } else { insert_into }, payload, shift, mdat_after)?;
            if target {
                let mut inner = rebuilt[kid.header..].to_vec();
                inner.extend_from_slice(payload);
                rebuilt = header(&kid.kind, inner.len(), kid.header == 16);
                rebuilt.extend_from_slice(&inner);
            }
            body.extend_from_slice(&rebuilt);
        }
    } else if &atom.kind == b"stco" || &atom.kind == b"co64" {
        body.extend_from_slice(&buf[body_start..end]);
        let wide = &atom.kind == b"co64";
        let count = u32::from_be_bytes(body[4..8].try_into().unwrap()) as usize;
        let step = if wide { 8 } else { 4 };
        for i in 0..count {
            let o = 8 + i * step;
            if o + step > body.len() {
                break;
            }
            if wide {
                let v = u64::from_be_bytes(body[o..o + 8].try_into().unwrap());
                if v as usize >= mdat_after {
                    body[o..o + 8].copy_from_slice(&((v as i64 + shift) as u64).to_be_bytes());
                }
            } else {
                let v = u32::from_be_bytes(body[o..o + 4].try_into().unwrap());
                if v as usize >= mdat_after {
                    let nv = v as i64 + shift;
                    if nv > u32::MAX as i64 {
                        return Err("chunk offsets would overflow; the file is too large for 32-bit offsets".into());
                    }
                    body[o..o + 4].copy_from_slice(&(nv as u32).to_be_bytes());
                }
            }
        }
    } else {
        body.extend_from_slice(&buf[body_start..end]);
    }
    let mut out = header(&atom.kind, body.len(), atom.header == 16);
    out.extend_from_slice(&body);
    Ok(out)
}

fn header(kind: &[u8; 4], body_len: usize, wide: bool) -> Vec<u8> {
    let mut h = Vec::new();
    if wide {
        h.extend_from_slice(&1u32.to_be_bytes());
        h.extend_from_slice(kind);
        h.extend_from_slice(&((body_len + 16) as u64).to_be_bytes());
    } else {
        h.extend_from_slice(&((body_len + 8) as u32).to_be_bytes());
        h.extend_from_slice(kind);
    }
    h
}

pub fn inject(path: &str, xml_text: &str) -> Res<()> {
    let buf = fs::read(path).map_err(|e| e.to_string())?;
    let top = atoms(&buf, 0, buf.len())?;
    let moov = top.iter().find(|a| &a.kind == b"moov").ok_or("the file has no moov box")?;
    let trak_start = atoms(&buf, moov.start + moov.header, moov.start + moov.size)?
        .into_iter()
        .find(|t| &t.kind == b"trak" && is_video_trak(&buf, t))
        .map(|t| t.start)
        .ok_or("the file has no video track")?;
    let mut payload = Vec::new();
    let body_len = 16 + xml_text.len();
    payload.extend_from_slice(&((body_len + 8) as u32).to_be_bytes());
    payload.extend_from_slice(b"uuid");
    payload.extend_from_slice(&SPHERICAL_UUID);
    payload.extend_from_slice(xml_text.as_bytes());
    let shift = payload.len() as i64;
    let mdat_after = moov.start + moov.size;
    let moov_before_media = top.iter().any(|a| &a.kind == b"mdat" && a.start > moov.start);
    let new_moov = rebuild(&buf, moov, Some(trak_start), &payload, if moov_before_media { shift } else { 0 }, mdat_after)?;
    let mut out = Vec::with_capacity(buf.len() + payload.len());
    out.extend_from_slice(&buf[..moov.start]);
    out.extend_from_slice(&new_moov);
    out.extend_from_slice(&buf[moov.start + moov.size..]);
    let tmp = format!("{path}.fe-vr");
    fs::write(&tmp, &out).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read(path: &str) -> Option<String> {
    let buf = fs::read(path).ok()?;
    let pos = buf.windows(16).position(|w| w == SPHERICAL_UUID)?;
    let rest = &buf[pos + 16..];
    let close = b"</rdf:SphericalVideo>";
    let end = rest.windows(close.len()).position(|w| w == close)? + close.len();
    Some(String::from_utf8_lossy(&rest[..end]).into_owned())
}
