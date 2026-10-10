#![recursion_limit = "512"]

pub mod captions;
pub mod colour;
pub mod commands;
pub mod credentials;
pub mod encoders;
pub mod engine;
pub mod ffmpeg;
pub mod formats;
pub mod logs;
pub mod metadata;
pub mod openh264;
pub mod paths;
pub mod pipeline;
pub mod raw;
pub mod prefs;
pub mod presets;
pub mod preview;
pub mod runner;
pub mod settings;
pub mod sidecars;
pub mod text;
pub mod tools;
pub mod transcribe;
pub mod util;
pub mod vr;
pub mod wrap;

#[cfg(feature = "python")]
mod py;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
