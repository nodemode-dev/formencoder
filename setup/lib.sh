#!/usr/bin/env bash
FORMENCODER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORMENCODER_ROOT
fe_say() { printf '[formencoder] %s\n' "$*"; }
fe_die() { printf '[formencoder] error: %s\n' "$*" >&2; exit 1; }
fe_os() {
  case "$(uname -s 2>/dev/null)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}
fe_python() {
  local c
  for c in python3.14 python3.13 python3.12 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
      echo "$c"
      return 0
    fi
  done
  return 1
}
fe_venv() {
  [ -f "$FORMENCODER_ROOT/backend/venv/bin/activate" ] || fe_die "engine venv missing, run ./formencoder install"
  # shellcheck disable=SC1091
  source "$FORMENCODER_ROOT/backend/venv/bin/activate"
}
fe_target_triple() {
  if [ -n "${FORMENCODER_TARGET:-}" ]; then echo "$FORMENCODER_TARGET"; return 0; fi
  command -v rustc >/dev/null 2>&1 || return 1
  rustc -vV | awk '/^host:/ {print $2}'
}
fe_exe() { [ "$(fe_os)" = windows ] && echo ".exe" || echo ""; }
fe_rust_env() {
  [ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
  export PATH
  unset RUSTC RUSTC_WORKSPACE_WRAPPER RUSTFLAGS CARGO_ENCODED_RUSTFLAGS CARGO_BUILD_RUSTFLAGS CARGO_BUILD_TARGET CARGO_TARGET_DIR CARGO_BUILD_TARGET_DIR CARGO_BUILD_RUSTC
  export RUSTC_WRAPPER="" CARGO_BUILD_RUSTC_WRAPPER=""
  if command -v rustup >/dev/null 2>&1 && rustup toolchain list 2>/dev/null | grep -q '^stable'; then
    export RUSTUP_TOOLCHAIN="${FORMENCODER_RUST_TOOLCHAIN:-stable}"
  fi
}
fe_rust_fresh() {
  local dir="$FORMENCODER_ROOT/$1" target now
  target="$dir/target"
  now="$(rustc -vV 2>/dev/null | tr '\n' ' ')"
  if [ -d "$target/release" ] && [ "$(cat "$target/.formencoder-rustc" 2>/dev/null)" != "$now" ]; then
    fe_say "the Rust compiler differs from the one that built $1/target; cleaning it"
    ( cd "$dir" && cargo clean )
  fi
  mkdir -p "$target"
  printf '%s' "$now" > "$target/.formencoder-rustc"
}
