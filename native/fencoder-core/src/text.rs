use std::sync::OnceLock;

use ab_glyph::{Font, FontRef, PxScale, ScaleFont, point};

static INTER: &[u8] = include_bytes!("../assets/fonts/Inter-Medium.otf");
static MONO: &[u8] = include_bytes!("../assets/fonts/DejaVuSansMono.ttf");

fn inter() -> &'static FontRef<'static> {
    static F: OnceLock<FontRef<'static>> = OnceLock::new();
    F.get_or_init(|| FontRef::try_from_slice(INTER).expect("bundled Inter font"))
}

fn mono() -> &'static FontRef<'static> {
    static F: OnceLock<FontRef<'static>> = OnceLock::new();
    F.get_or_init(|| FontRef::try_from_slice(MONO).expect("bundled DejaVu Sans Mono font"))
}

#[derive(Clone)]
pub struct Rgba {
    pub w: u32,
    pub h: u32,
    pub px: Vec<u8>,
}

impl Rgba {
    pub fn new(w: u32, h: u32) -> Self {
        Rgba { w: w.max(1), h: h.max(1), px: vec![0; (w.max(1) * h.max(1) * 4) as usize] }
    }

    fn blend(&mut self, x: i64, y: i64, c: [u8; 4], cover: f32) {
        if x < 0 || y < 0 || x >= self.w as i64 || y >= self.h as i64 || cover <= 0.0 {
            return;
        }
        let i = ((y as u32 * self.w + x as u32) * 4) as usize;
        let a = (c[3] as f32 / 255.0) * cover.min(1.0);
        let da = self.px[i + 3] as f32 / 255.0;
        let oa = a + da * (1.0 - a);
        if oa <= 0.0 {
            return;
        }
        for k in 0..3 {
            let sc = c[k] as f32 / 255.0;
            let dc = self.px[i + k] as f32 / 255.0;
            self.px[i + k] = (((sc * a + dc * da * (1.0 - a)) / oa) * 255.0).round() as u8;
        }
        self.px[i + 3] = (oa * 255.0).round() as u8;
    }

    pub fn paste(&mut self, other: &Rgba, x: i64, y: i64) {
        for oy in 0..other.h as i64 {
            for ox in 0..other.w as i64 {
                let i = ((oy as u32 * other.w + ox as u32) * 4) as usize;
                let c = [other.px[i], other.px[i + 1], other.px[i + 2], other.px[i + 3]];
                if c[3] > 0 {
                    self.blend(x + ox, y + oy, [c[0], c[1], c[2], 255], c[3] as f32 / 255.0);
                }
            }
        }
    }

    pub fn png(&self) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, self.w, self.h);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            enc.set_compression(png::Compression::Fast);
            if let Ok(mut w) = enc.write_header() {
                let _ = w.write_image_data(&self.px);
            }
        }
        out
    }
}

pub fn parse_color(hex: &str, opacity: f64) -> [u8; 4] {
    let h = hex.trim_start_matches('#');
    let h = if h.len() == 3 { h.chars().flat_map(|c| [c, c]).collect::<String>() } else { h.to_string() };
    let p = |i: usize| u8::from_str_radix(h.get(i..i + 2).unwrap_or("ff"), 16).unwrap_or(255);
    [p(0), p(2), p(4), (255.0 * (opacity / 100.0).clamp(0.0, 1.0)).round() as u8]
}

fn line_width(font: &FontRef<'static>, scale: PxScale, line: &str) -> f32 {
    let sf = font.as_scaled(scale);
    let mut w = 0.0;
    let mut prev = None;
    for ch in line.chars() {
        let id = sf.glyph_id(ch);
        if let Some(p) = prev {
            w += sf.kern(p, id);
        }
        w += sf.h_advance(id);
        prev = Some(id);
    }
    w
}

fn draw_line(img: &mut Rgba, font: &FontRef<'static>, scale: PxScale, line: &str, x: f32, baseline: f32, color: [u8; 4]) {
    let sf = font.as_scaled(scale);
    let mut caret = x;
    let mut prev = None;
    for ch in line.chars() {
        let id = sf.glyph_id(ch);
        if let Some(p) = prev {
            caret += sf.kern(p, id);
        }
        let glyph = id.with_scale_and_position(scale, point(caret, baseline));
        caret += sf.h_advance(id);
        prev = Some(id);
        if let Some(outlined) = font.outline_glyph(glyph) {
            let bounds = outlined.px_bounds();
            outlined.draw(|gx, gy, c| {
                img.blend(bounds.min.x as i64 + gx as i64, bounds.min.y as i64 + gy as i64, color, c);
            });
        }
    }
}

pub fn text_box(text: &str, size: f64, color: &str, opacity: f64, background: f64, monospace: bool) -> Rgba {
    let font = if monospace { mono() } else { inter() };
    let size = size.max(6.0) as f32;
    let scale = PxScale::from(size);
    let sf = font.as_scaled(scale);
    let lines: Vec<&str> = if text.is_empty() { vec![" "] } else { text.split('\n').collect() };
    let ascent = sf.ascent();
    let line_h = (sf.ascent() - sf.descent()).ceil();
    let gap = (size * 0.25).round();
    let pad = (size * 0.35).round().max(2.0);
    let width = lines.iter().map(|l| line_width(font, scale, l)).fold(0.0f32, f32::max).ceil();
    let w = (width + 2.0 * pad) as u32;
    let h = (line_h * lines.len() as f32 + gap * (lines.len() as f32 - 1.0) + 2.0 * pad) as u32;
    let mut img = Rgba::new(w + (w % 2), h + (h % 2));
    if background > 0.0 {
        let bg = [0u8, 0, 0, (255.0 * (background / 100.0) * (opacity / 100.0)).clamp(0.0, 255.0) as u8];
        let r = (pad / 2.0).max(2.0);
        for y in 0..img.h {
            for x in 0..img.w {
                let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
                let cx = fx.clamp(r, img.w as f32 - r);
                let cy = fy.clamp(r, img.h as f32 - r);
                let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                let cover = (r - d + 0.5).clamp(0.0, 1.0);
                img.blend(x as i64, y as i64, bg, if d <= 0.0 { 1.0 } else { cover });
            }
        }
    }
    let c = parse_color(color, opacity);
    let mut y = pad;
    for line in &lines {
        let x = (img.w as f32 - line_width(font, scale, line)) / 2.0;
        draw_line(&mut img, font, scale, line, x, y + ascent, c);
        y += line_h + gap;
    }
    img
}

pub fn margin(w: u32, h: u32) -> f64 {
    (w.min(h) as f64 * 0.03).round()
}

pub fn position_expr(position: &str, ox: f64, oy: f64, w: u32, h: u32) -> (String, String) {
    let m = margin(w, h);
    let x = if position.ends_with("Left") {
        format!("{m}+{ox}")
    } else if position.ends_with("Right") {
        format!("W-w-{m}-({ox})")
    } else {
        format!("(W-w)/2+({ox})")
    };
    let y = if position.starts_with("top") {
        format!("{m}+{oy}")
    } else if position.starts_with("bottom") {
        format!("H-h-{m}-({oy})")
    } else {
        format!("(H-h)/2+({oy})")
    };
    (x, y)
}

pub fn drop_frame(fps: f64) -> bool {
    (fps - 29.97).abs() < 0.01 || (fps - 59.94).abs() < 0.01
}

pub fn nominal(fps: f64) -> i64 {
    (fps.round() as i64).max(1)
}

pub fn parse_timecode(tc: &str, fps: f64) -> i64 {
    let parts: Vec<i64> = tc.replace([';', '.'], ":").split(':').filter_map(|x| x.trim().parse().ok()).collect();
    if parts.len() != 4 {
        return 0;
    }
    let n = nominal(fps);
    let mut frames = ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * n + parts[3];
    if drop_frame(fps) {
        let drop = if n == 30 { 2 } else { 4 };
        let total = parts[0] * 60 + parts[1];
        frames -= drop * (total - total / 10);
    }
    frames
}

pub fn format_timecode(frame: i64, fps: f64) -> String {
    let n = nominal(fps);
    let mut frame = frame.max(0);
    let sep = if drop_frame(fps) {
        let drop = if n == 30 { 2 } else { 4 };
        let per10 = n * 600 - drop * 9;
        let per_min = n * 60 - drop;
        let d = frame / per10;
        let m = frame % per10;
        frame += if m > drop { drop * 9 * d + drop * ((m - drop) / per_min) } else { drop * 9 * d };
        ';'
    } else {
        ':'
    };
    let f = frame % n;
    let s = (frame / n) % 60;
    let mi = (frame / (n * 60)) % 60;
    let h = (frame / (n * 3600)) % 24;
    format!("{h:02}:{mi:02}:{s:02}{sep}{f:02}")
}

#[derive(Clone)]
pub struct Timecode {
    pub start: i64,
    pub frames: i64,
    pub fps: f64,
    pub size: f64,
    pub color: String,
    pub opacity: f64,
    pub background: f64,
    pub w: u32,
    pub h: u32,
}

impl Timecode {
    pub fn new(start: i64, frames: i64, fps: f64, size: f64, color: &str, opacity: f64, background: f64) -> Self {
        let sample = text_box("00:00:00:00", size, color, opacity, background, true);
        Timecode { start, frames, fps, size, color: color.into(), opacity, background, w: sample.w, h: sample.h }
    }

    pub fn frame(&self, index: i64) -> Rgba {
        let img = text_box(&format_timecode(self.start + index, self.fps), self.size, &self.color, self.opacity, self.background, true);
        let mut canvas = Rgba::new(self.w, self.h);
        canvas.paste(&img, ((self.w as i64 - img.w as i64) / 2).max(0), ((self.h as i64 - img.h as i64) / 2).max(0));
        canvas
    }

    pub fn input_args(&self) -> Vec<String> {
        vec!["-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgba".into(), "-s".into(), format!("{}x{}", self.w, self.h), "-framerate".into(), crate::util::rate_str(self.fps), "-i".into(), "pipe:0".into()]
    }
}

pub fn contact_sheet(frames: &[(f64, Vec<u8>)], columns: usize) -> Vec<u8> {
    let mut decoded = Vec::new();
    for (t, data) in frames {
        let decoder = png::Decoder::new(std::io::Cursor::new(data.as_slice()));
        let Ok(mut reader) = decoder.read_info() else { continue };
        let Some(size) = reader.output_buffer_size() else { continue };
        let mut buf = vec![0; size];
        let Ok(info) = reader.next_frame(&mut buf) else { continue };
        let ch = match info.color_type {
            png::ColorType::Rgba => 4,
            png::ColorType::Rgb => 3,
            _ => continue,
        };
        let mut img = Rgba::new(info.width, info.height);
        for p in 0..(info.width * info.height) as usize {
            img.px[p * 4..p * 4 + 3].copy_from_slice(&buf[p * ch..p * ch + 3]);
            img.px[p * 4 + 3] = 255;
        }
        decoded.push((*t, img));
    }
    if decoded.is_empty() {
        return Vec::new();
    }
    let w = decoded.iter().map(|(_, i)| i.w).max().unwrap_or(1);
    let h = decoded.iter().map(|(_, i)| i.h).max().unwrap_or(1);
    let cols = columns.clamp(1, decoded.len());
    let rows = decoded.len().div_ceil(cols);
    let pad = 6;
    let label = 22;
    let mut sheet = Rgba::new(cols as u32 * (w + pad) + pad, rows as u32 * (h + label + pad) + pad);
    for p in sheet.px.chunks_mut(4) {
        p.copy_from_slice(&[17, 17, 17, 255]);
    }
    for (n, (t, img)) in decoded.iter().enumerate() {
        let x = pad + (n % cols) as u32 * (w + pad);
        let y = pad + (n / cols) as u32 * (h + label + pad);
        sheet.paste(img, x as i64, y as i64);
        let tag = text_box(&format!("{t:.2}s"), 14.0, "#dddddd", 100.0, 0.0, true);
        sheet.paste(&tag, x as i64, (y + h) as i64);
    }
    sheet.png()
}
