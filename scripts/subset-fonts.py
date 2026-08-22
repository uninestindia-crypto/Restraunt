#!/usr/bin/env python3
"""
Narrow the latin-ext font files to what this restaurant actually renders.

Google's `latin-ext` subset is 83 KB for Inter, and the storefront downloads it on every page for
one character: the rupee sign. U+20B9 sits in `U+20AD-20C0`, which is in latin-ext and not in
latin, so every price on the page pulls the whole file. The rest of it is IPA extensions, Vietnamese
and Latin Extended Additional — none of which appears anywhere in this product.

What is kept is Latin Extended-A (the accented letters a dish name or a customer's name plausibly
needs — ā, ī, ś, é, ñ, ç) plus the currency block. Inter goes 83 KB → 20 KB, Plus Jakarta Sans
21 KB → 13 KB.

Run after scripts/fetch-fonts.js, which downloads Google's full files:

    node scripts/fetch-fonts.js && python3 scripts/subset-fonts.py

tests/font_subset.test.ts fails if the shipped files drift back to the full ones.
"""
import os
import re
import sys

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is required:  pip install fonttools brotli")

FONT_DIR = os.path.join("public", "assets", "fonts")
CSS_PATH = os.path.join("src", "styles", "fonts.css")

# Latin Extended-A, the dagger and script-l Google includes, and the currency block that holds ₹.
KEEP = "U+0100-017F,U+2020,U+2113,U+20A0-20C0"

FILES = ["inter-latin-ext.woff2", "plus-jakarta-sans-latin-ext.woff2"]


def ranges_of(path):
    """The unicode-range to declare — read from the file, never assumed.

    A declared range wider than the file's cmap renders a .notdef box instead of falling through
    to the next face, so this is derived rather than copied from the constant above.
    """
    with TTFont(path) as font:
        points = sorted(font.getBestCmap())
    out, start, prev = [], None, None
    for cp in points:
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in out)


def main():
    css = open(CSS_PATH, encoding="utf-8").read()

    for name in FILES:
        path = os.path.join(FONT_DIR, name)
        before = os.path.getsize(path)
        subset.main([path, f"--unicodes={KEEP}", f"--output-file={path}", "--flavor=woff2",
                     "--layout-features=*", "--no-hinting", "--desubroutinize"])
        after = os.path.getsize(path)

        declared = ranges_of(path)
        # Replace the unicode-range of the rule that points at this file.
        pattern = re.compile(
            r"(src: url\('/assets/fonts/" + re.escape(name) + r"'\)[^;]*;\s*\n\s*unicode-range: )[^;]+;")
        css, n = pattern.subn(lambda m: m.group(1) + declared + ";", css)
        if n != 1:
            sys.exit(f"could not find the @font-face rule for {name} in {CSS_PATH}")

        print(f"  {name}  {before / 1024:.1f} KB -> {after / 1024:.1f} KB")

    open(CSS_PATH, "w", encoding="utf-8").write(css)
    print(f"\nRewrote {CSS_PATH} with the narrowed ranges.")


if __name__ == "__main__":
    main()
