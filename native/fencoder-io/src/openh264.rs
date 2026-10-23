use std::ffi::c_void;
use std::fs::File;
use std::io::Write;
use std::os::raw::c_int;
use std::path::{Path, PathBuf};

use crate::util::Res;

pub const VERSION: &str = "2.6.0";
pub const ATTRIBUTION: &str = "OpenH264 Video Codec provided by Cisco Systems, Inc.";

pub fn file_name() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "libopenh264-2.6.0-mac-arm64.dylib" } else { "libopenh264-2.6.0-mac-x64.dylib" }
    } else if cfg!(windows) {
        "openh264-2.6.0-win64.dll"
    } else if cfg!(target_arch = "aarch64") {
        "libopenh264-2.6.0-linux-arm64.8.so"
    } else {
        "libopenh264-2.6.0-linux64.8.so"
    }
}

/// The user's switch in Preferences > Delivery Tools (Cisco's terms require that the use of the
/// downloaded binary can be turned off and on again). On by default once the binary is downloaded.
pub fn enabled() -> bool {
    crate::prefs::load().get("openh264").and_then(|v| v.as_bool()).unwrap_or(true)
}

/// The binary to load, or None when it is not downloaded or the switch is off.
pub fn library() -> Option<PathBuf> {
    if !enabled() {
        return None;
    }
    installed()
}

/// Where the downloaded binary is, whether or not the switch is on.
pub fn installed() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("FORMENCODER_OPENH264") {
        let p = PathBuf::from(crate::paths::expand(p.trim()));
        if p.is_file() {
            return Some(p);
        }
    }
    crate::tools::folders().into_iter().map(|(_, f)| f.join(file_name())).find(|p| p.is_file())
}

#[repr(C)]
struct Vtbl {
    initialize: unsafe extern "C" fn(*mut *const Vtbl, *const c_void) -> c_int,
    initialize_ext: unsafe extern "C" fn(*mut *const Vtbl, *const c_void) -> c_int,
    get_default_params: unsafe extern "C" fn(*mut *const Vtbl, *mut c_void) -> c_int,
    uninitialize: unsafe extern "C" fn(*mut *const Vtbl) -> c_int,
    encode_frame: unsafe extern "C" fn(*mut *const Vtbl, *const c_void, *mut c_void) -> c_int,
    encode_parameter_sets: unsafe extern "C" fn(*mut *const Vtbl, *mut c_void) -> c_int,
    force_intra_frame: unsafe extern "C" fn(*mut *const Vtbl, bool) -> c_int,
    set_option: unsafe extern "C" fn(*mut *const Vtbl, c_int, *mut c_void) -> c_int,
    get_option: unsafe extern "C" fn(*mut *const Vtbl, c_int, *mut c_void) -> c_int,
}

type Create = unsafe extern "C" fn(*mut *mut *const Vtbl) -> c_int;
type Destroy = unsafe extern "C" fn(*mut *const Vtbl);
type Version = unsafe extern "C" fn(*mut [u32; 4]);

struct Lib(*mut c_void);

#[cfg(unix)]
impl Lib {
    fn open(path: &Path) -> Res<Lib> {
        let c = std::ffi::CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        let h = unsafe { libc::dlopen(c.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL) };
        if h.is_null() {
            return Err(format!("could not load {}", path.display()));
        }
        Ok(Lib(h))
    }
    fn sym(&self, name: &str) -> Res<*mut c_void> {
        let c = std::ffi::CString::new(name).map_err(|e| e.to_string())?;
        let p = unsafe { libc::dlsym(self.0, c.as_ptr()) };
        if p.is_null() { Err(format!("OpenH264 has no {name}")) } else { Ok(p) }
    }
}

#[cfg(unix)]
impl Drop for Lib {
    fn drop(&mut self) {
        unsafe {
            libc::dlclose(self.0);
        }
    }
}

#[cfg(windows)]
impl Lib {
    fn open(path: &Path) -> Res<Lib> {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let h = unsafe { windows_sys::Win32::System::LibraryLoader::LoadLibraryW(wide.as_ptr()) };
        if h.is_null() {
            return Err(format!("could not load {}", path.display()));
        }
        Ok(Lib(h as *mut c_void))
    }
    fn sym(&self, name: &str) -> Res<*mut c_void> {
        let c = std::ffi::CString::new(name).map_err(|e| e.to_string())?;
        let p = unsafe { windows_sys::Win32::System::LibraryLoader::GetProcAddress(self.0 as _, c.as_ptr() as *const u8) };
        match p {
            Some(f) => Ok(f as *mut c_void),
            None => Err(format!("OpenH264 has no {name}")),
        }
    }
}

#[cfg(windows)]
impl Drop for Lib {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::FreeLibrary(self.0 as _);
        }
    }
}

const PARAM_EXT_SIZE: usize = 924;
const LAYER: usize = 32;
const FRAME_INFO_SIZE: usize = 7192;

pub struct Settings {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bitrate: u32,
    pub max_bitrate: u32,
    pub quality: Option<u32>,
    pub keyint: u32,
    pub profile: String,
    pub threads: u32,
    pub bt709: bool,
}

pub struct Encoder {
    destroy: Destroy,
    enc: *mut *const Vtbl,
    info: Vec<u64>,
    out: File,
    width: u32,
    height: u32,
    frames: u64,
    fps: f64,
    _lib: Lib,
}

fn put_i32(buf: &mut [u8], at: usize, v: i32) {
    buf[at..at + 4].copy_from_slice(&v.to_ne_bytes());
}

fn put_f32(buf: &mut [u8], at: usize, v: f32) {
    buf[at..at + 4].copy_from_slice(&v.to_ne_bytes());
}

impl Encoder {
    pub fn new(lib_path: &Path, s: &Settings, out: &Path) -> Res<Encoder> {
        let lib = Lib::open(lib_path)?;
        let version: Version = unsafe { std::mem::transmute(lib.sym("WelsGetCodecVersionEx")?) };
        let mut v = [0u32; 4];
        unsafe { version(&mut v) };
        if v[0] != 2 || v[1] != 6 {
            return Err(format!("formencoder drives OpenH264 {VERSION}; the library at {} is {}.{}.{}", lib_path.display(), v[0], v[1], v[2]));
        }
        let create: Create = unsafe { std::mem::transmute(lib.sym("WelsCreateSVCEncoder")?) };
        let destroy: Destroy = unsafe { std::mem::transmute(lib.sym("WelsDestroySVCEncoder")?) };
        let mut enc: *mut *const Vtbl = std::ptr::null_mut();
        if unsafe { create(&mut enc) } != 0 || enc.is_null() {
            return Err("OpenH264 could not create an encoder".into());
        }
        let vt = unsafe { &**enc };
        let mut words = vec![0u32; PARAM_EXT_SIZE / 4];
        let p = unsafe { std::slice::from_raw_parts_mut(words.as_mut_ptr() as *mut u8, PARAM_EXT_SIZE) };
        unsafe { (vt.get_default_params)(enc, p.as_mut_ptr() as *mut c_void) };
        let rc_quality = s.quality.is_some();
        put_i32(p, 0, 0);
        put_i32(p, 4, s.width as i32);
        put_i32(p, 8, s.height as i32);
        put_i32(p, 12, s.bitrate as i32);
        put_i32(p, 16, if rc_quality { 0 } else { 1 });
        put_f32(p, 20, s.fps as f32);
        put_i32(p, 24, 1);
        put_i32(p, 28, 1);
        put_i32(p, LAYER, s.width as i32);
        put_i32(p, LAYER + 4, s.height as i32);
        put_f32(p, LAYER + 8, s.fps as f32);
        put_i32(p, LAYER + 12, s.bitrate as i32);
        put_i32(p, LAYER + 16, s.max_bitrate as i32);
        let profile = match s.profile.as_str() { "baseline" => 66, "main" => 77, _ => 100 };
        put_i32(p, LAYER + 20, profile);
        put_i32(p, LAYER + 24, 0);
        let threads = s.threads.clamp(1, 4);
        put_i32(p, LAYER + 32, if threads > 1 { 1 } else { 0 });
        put_i32(p, LAYER + 36, threads as i32);
        if s.bt709 {
            p[LAYER + 184] = 1;
            p[LAYER + 187] = 1;
            p[LAYER + 188] = 1;
            p[LAYER + 189] = 1;
            p[LAYER + 190] = 1;
        }
        put_i32(p, 832, 2);
        put_i32(p, 836, s.keyint.max(1) as i32);
        put_i32(p, 856, if profile == 66 { 0 } else { 1 });
        p[860] = 0;
        put_i32(p, 864, s.max_bitrate as i32);
        if let Some(q) = s.quality {
            put_i32(p, 868, (q + 4).min(51) as i32);
            put_i32(p, 872, q.saturating_sub(4) as i32);
        }
        put_i32(p, 892, threads as i32);
        let mut quiet: c_int = 0;
        unsafe { (vt.set_option)(enc, 25, &mut quiet as *mut c_int as *mut c_void) };
        let r = unsafe { (vt.initialize_ext)(enc, p.as_ptr() as *const c_void) };
        if r != 0 {
            unsafe { destroy(enc) };
            return Err(format!("OpenH264 refused the settings ({r}) for {}x{} at {} fps", s.width, s.height, s.fps));
        }
        let out = File::create(out).map_err(|e| e.to_string())?;
        Ok(Encoder { destroy, enc, info: vec![0u64; FRAME_INFO_SIZE / 8], out, width: s.width, height: s.height, frames: 0, fps: s.fps, _lib: lib })
    }

    pub fn frame_bytes(&self) -> usize {
        (self.width * self.height * 3 / 2) as usize
    }

    pub fn encode(&mut self, frame: &mut [u8]) -> Res<()> {
        let (w, h) = (self.width as usize, self.height as usize);
        let mut pic = [0u64; 10];
        let pb = unsafe { std::slice::from_raw_parts_mut(pic.as_mut_ptr() as *mut u8, 80) };
        put_i32(pb, 0, 23);
        put_i32(pb, 4, w as i32);
        put_i32(pb, 8, (w / 2) as i32);
        put_i32(pb, 12, (w / 2) as i32);
        let base = frame.as_mut_ptr() as u64;
        pic[3] = base;
        pic[4] = base + (w * h) as u64;
        pic[5] = base + (w * h + w * h / 4) as u64;
        put_i32(pb, 56, w as i32);
        put_i32(pb, 60, h as i32);
        pic[8] = ((self.frames as f64) * 1000.0 / self.fps.max(1.0)) as u64;
        for x in self.info.iter_mut() {
            *x = 0;
        }
        let vt = unsafe { &**self.enc };
        let r = unsafe { (vt.encode_frame)(self.enc, pic.as_ptr() as *const c_void, self.info.as_mut_ptr() as *mut c_void) };
        if r != 0 {
            return Err(format!("OpenH264 failed on frame {} ({r})", self.frames));
        }
        self.frames += 1;
        let ib = unsafe { std::slice::from_raw_parts(self.info.as_ptr() as *const u8, FRAME_INFO_SIZE) };
        let layers = i32::from_ne_bytes(ib[0..4].try_into().unwrap()).max(0) as usize;
        for l in 0..layers.min(128) {
            let at = 8 + l * 56;
            let nals = i32::from_ne_bytes(ib[at + 16..at + 20].try_into().unwrap()).max(0) as usize;
            let lens = u64::from_ne_bytes(ib[at + 24..at + 32].try_into().unwrap()) as *const i32;
            let buf = u64::from_ne_bytes(ib[at + 32..at + 40].try_into().unwrap()) as *const u8;
            if nals == 0 || lens.is_null() || buf.is_null() {
                continue;
            }
            let total: usize = (0..nals).map(|i| unsafe { *lens.add(i) }.max(0) as usize).sum();
            let bytes = unsafe { std::slice::from_raw_parts(buf, total) };
            self.out.write_all(bytes).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn finish(mut self) -> Res<u64> {
        self.out.flush().map_err(|e| e.to_string())?;
        Ok(self.frames)
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        unsafe {
            let vt = &**self.enc;
            (vt.uninitialize)(self.enc);
            (self.destroy)(self.enc);
        }
    }
}

unsafe impl Send for Encoder {}
