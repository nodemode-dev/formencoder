#![recursion_limit = "512"]

pub use fencoder_io::{VERSION, captions, colour, credentials, encoders, ffmpeg, formats, logs, metadata, openh264, paths, plugins, prefs, raw, text, tools, transcribe, util, vr, wrap};

pub mod pipeline;
pub mod presets;
pub mod settings;
pub mod sidecars;
