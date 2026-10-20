# Desktop

```bash
./formencoder install-desktop   # PyInstaller and the Tauri toolchain check (Linux also needs the webkit2gtk-4.1 packages)
./formencoder desktop dev       # the app, with the engine frozen as its sidecar
./formencoder desktop build     # bundles in src-tauri/target/release/bundle
```

`desktop build` builds the interface, freezes the engine service with `fe_core`, the interface, the agent templates, the skills and the bundled LUTs into the `formencoder-engine` sidecar, stages the pinned LGPL FFmpeg for the target into `src-tauri/ffmpeg` (every file checked against `src-tauri/binaries/ffmpeg-licence.json`), then runs `tauri build`.

From a fresh clone, `./build_app` (macOS and Linux) runs the whole chain in one go: it checks Python, Node and Rust (installing Rust with rustup when missing), installs the engine service, the encoding engine and the interface, installs the desktop packages, then does what `desktop build` does. On macOS it bundles the `.app` (ad-hoc signed unless `APPLE_SIGNING_IDENTITY` is set), packs a DMG and copies the app to Applications; on Linux it builds the `.deb`. Flags: `--no-install`, `--install` (Linux, apt), `--open`, `--clean`. The log is `build_app.log`. `build_app.bat` is the Windows equivalent, producing the MSI and setup `.exe`.

| OS | Bundles |
| --- | --- |
| macOS Apple silicon and Intel | `.app`, `.dmg` |
| Windows x64 | `.msi`, setup `.exe` |
| Linux x64 | `.deb`, `.rpm`, `.AppImage` |

The app starts the sidecar on a free loopback port, shows the splash until the engine answers, then opens the interface. Files opened with the app (media, `.fequeue`, `.fepreset`) are queued, opened or imported. The sidecar exits with the app.
