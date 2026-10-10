# Desktop

```bash
./formencoder install-desktop   # PyInstaller and the Tauri toolchain check (Linux also needs the webkit2gtk-4.1 packages)
./formencoder desktop dev       # the app, with the engine frozen as its sidecar
./formencoder desktop build     # bundles in src-tauri/target/release/bundle
```

`desktop build` builds the interface, freezes the engine service with `fe_core`, the interface, the agent templates, the skills and the bundled LUTs into the `formencoder-engine` sidecar, stages the pinned LGPL FFmpeg for the target into `src-tauri/ffmpeg` (every file checked against `src-tauri/binaries/ffmpeg-licence.json`), then runs `tauri build`.

| OS | Bundles |
| --- | --- |
| macOS Apple silicon and Intel | `.app`, `.dmg` |
| Windows x64 | `.msi`, setup `.exe` |
| Linux x64 | `.deb`, `.rpm`, `.AppImage` |

The app starts the sidecar on a free loopback port, shows the splash until the engine answers, then opens the interface. Files opened with the app (media, `.fequeue`, `.fepreset`) are queued, opened or imported. The sidecar exits with the app.
