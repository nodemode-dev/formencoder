#![recursion_limit = "512"]

pub mod colour;
pub mod logs;
pub mod metadata;
pub mod paths;
pub mod plugins;
pub mod prefs;
pub mod text;
pub mod util;
pub mod vr;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
