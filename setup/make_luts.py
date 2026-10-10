#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "backend" / "app" / "resources" / "luts"
SIZE = 17


def clamp(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def luma(r: float, g: float, b: float) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def smooth(x: float, amount: float) -> float:
    s = x * x * (3 - 2 * x)
    return x + (s - x) * amount


def neutral(r, g, b):
    return r, g, b


def warm(r, g, b):
    return clamp(r * 1.06 + 0.01), clamp(g * 1.01), clamp(b * 0.9)


def cool(r, g, b):
    return clamp(r * 0.92), clamp(g * 1.0 + 0.005), clamp(b * 1.08 + 0.01)


def bleach_bypass(r, g, b):
    y = luma(r, g, b)
    mix = [0.55 * c + 0.45 * y for c in (r, g, b)]
    return tuple(clamp(smooth(c, 0.6)) for c in mix)


def faded(r, g, b):
    return tuple(clamp(0.08 + c * 0.86) for c in (r, g, b))


def mono(r, g, b):
    y = clamp(smooth(luma(r, g, b), 0.25))
    return y, y, y


def teal_orange(r, g, b):
    y = luma(r, g, b)
    w = clamp((y - 0.35) / 0.4)
    tr, tg, tb = (1.0 - w) * 0.92 + w * 1.08, 1.0, (1.0 - w) * 1.1 + w * 0.88
    return clamp(r * tr), clamp(g * tg), clamp(b * tb)


def high_contrast(r, g, b):
    return tuple(clamp(smooth(c, 0.8)) for c in (r, g, b))


LOOKS = {
    "formencoder Neutral": neutral,
    "formencoder Warm": warm,
    "formencoder Cool": cool,
    "formencoder Bleach Bypass": bleach_bypass,
    "formencoder Faded": faded,
    "formencoder Mono": mono,
    "formencoder Teal and Orange": teal_orange,
    "formencoder High Contrast": high_contrast,
}


def cube(name: str, fn) -> str:
    lines = [f'TITLE "{name}"', f"LUT_3D_SIZE {SIZE}", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
    n = SIZE - 1
    for bi in range(SIZE):
        for gi in range(SIZE):
            for ri in range(SIZE):
                r, g, b = fn(ri / n, gi / n, bi / n)
                lines.append(f"{r:.6f} {g:.6f} {b:.6f}")
    return "\n".join(lines) + "\n"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in LOOKS.items():
        path = OUT / f"{name}.cube"
        text = cube(name, fn)
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
