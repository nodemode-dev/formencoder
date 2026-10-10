#![recursion_limit = "512"]

pub mod captions;
pub mod colour;
pub mod commands;
pub mod encoders;
pub mod engine;
pub mod ffmpeg;
pub mod formats;
pub mod logs;
pub mod metadata;
pub mod paths;
pub mod pipeline;
pub mod prefs;
pub mod presets;
pub mod preview;
pub mod runner;
pub mod settings;
pub mod sidecars;
pub mod text;
pub mod util;
pub mod vr;

#[cfg(feature = "python")]
mod py;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
