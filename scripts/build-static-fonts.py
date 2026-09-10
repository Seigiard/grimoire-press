# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.65.0", "brotli>=1.1.0"]
# ///
"""Regenerate the theme's static font instances from its variable sources.

Run with `npm run fonts:build` (which is `uv run scripts/build-static-fonts.py`);
uv installs the two pinned dependencies above into a throwaway environment, so
nothing has to be added to package.json or to a developer's machine.

Why static instances exist at all (issue #9). Chromium's PDF backend falls back
to Type 3 -- a per-glyph drawing procedure rather than an embedded outline font
program -- for any typeface whose file declares variation axes. It tests for the
presence of `fvar`, not for a non-default coordinate, so no CSS declaration can
talk it out of it: `SkPDFFont::FontType()` forces the fallback on
`kVariable_FontFlag`, and every platform backend sets that flag from axis
presence alone. The only fix is to hand the browser files that have no axes.

Each output is therefore pinned to one weight, which drops `fvar`/`gvar`/`avar`,
and then subsetted to the four scripts this theme supports, which removes about
fifteen hundred glyphs a rulebook never uses. The pin buys the font type; the
subset buys the size. Both outputs are committed next to their sources, because
the theme imports them through Vite's `?inline` and a build that had to run
Python would break `npm run build` for everyone.

Layout, per family, under src/core/themes/default-ru/fonts: the upstream
variable file in `upstream`, this script's output beside it, and the licence
next to both.

The generated files are derived work under the same SIL Open Font License as the
sources; each family's OFL.txt sits beside them. Neither family reserves its
name, so the instances keep the upstream family names.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

REPO_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = REPO_ROOT / "src/core/themes/default-ru/fonts"

# The two weights magick.css and the theme's @page block between them can ask
# for: 400 for body text and the running header, 600 for headings and <strong>.
# A weight with no file of its own is synthesised by the browser, and a
# synthesised face gives up the original font data -- back to Type 3, or to a
# fake oblique that does not match the real italic.
WEIGHTS = (400, 600)

# Named so the file name says which weight it carries; 600 is "SemiBold" in the
# name records because that is what both families call it, even though Alegreya
# has no SemiBold named instance of its own (see instantiate() below).
WEIGHT_NAMES = {400: "", 600: "SemiBold"}


@dataclass(frozen=True)
class Source:
    """One upstream variable file and the four names its instances need."""

    family: str
    directory: str
    filename: str
    italic: bool


SOURCES = (
    Source("Alegreya", "alegreya", "Alegreya.woff2", italic=False),
    Source("Alegreya", "alegreya", "Alegreya-Italic.woff2", italic=True),
    Source("Vollkorn", "vollkorn", "Vollkorn.woff2", italic=False),
    Source("Vollkorn", "vollkorn", "Vollkorn-Italic.woff2", italic=True),
)

# Google Fonts' own `latin`, `latin-ext`, `cyrillic` and `cyrillic-ext` subsets,
# copied verbatim from the unicode-range declarations its CSS API serves. Latin
# and Cyrillic together are what CONTEXT.md's Theme entry means by the alphabets
# this theme can set a book in; the two -ext ranges carry the accented and
# historic letters a rulebook's proper nouns reach for.
UNICODE_RANGES = ",".join(
    (
        # latin
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
        "U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,"
        "U+2212,U+2215,U+FEFF,U+FFFD",
        # latin-ext
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,"
        "U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,"
        "U+2113,U+2C60-2C7F,U+A720-A7FF",
        # cyrillic
        "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
        # cyrillic-ext
        "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    )
)

# On top of fontTools' default layout features. The stylistic sets and
# discretionary ligatures are the ones these two families put their alternates
# behind; keeping them costs little and means a later theme edit that turns one
# on finds it still in the file rather than silently doing nothing.
EXTRA_LAYOUT_FEATURES = ["ss01", "ss02", "ss03", "ss04", "dlig"]

# fontTools' subsetter keeps name IDs 0-6 by default and drops the rest, which
# would throw away the typographic family/subfamily records instantiate() writes
# to keep the 600 instances grouped under their real family name.
KEPT_NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 16, 17]

# The subsetter drops legacy (Macintosh) name records, so the Windows Unicode
# BMP record is the only one worth writing.
WINDOWS_UNICODE_BMP = (3, 1, 0x409)


def instantiate(font: TTFont, source: Source, weight: int) -> None:
    """Pin `font` to one weight and rewrite the records that name the result.

    `updateFontNames=True` is the usual way to do the second half, and it is not
    usable here: it looks the requested coordinate up in `STAT` and raises when
    it is not there, and Alegreya declares no axis value at 600. The naive
    recipe therefore yields Alegreya 400 only, silently, and the heading weight
    falls back to whatever else matches. So the names are written by hand below,
    for every family, rather than only where the shortcut fails.
    """
    instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True, updateFontNames=False)
    assert "fvar" not in font, f"{source.filename} at {weight} still declares variation axes"

    style = " ".join(part for part in (WEIGHT_NAMES[weight], "Italic" if source.italic else "") if part)
    # nameID 1/2 are the "family, and a style within it" pair that CSS matching
    # and old applications read, and a family may only carry four styles there,
    # so anything past regular/italic/bold/bold-italic moves into its own
    # family. nameID 16/17 are the typographic pair that puts them back
    # together, which is what a modern shaper and a font menu use.
    typographic_subfamily = style or "Regular"
    legacy_family = f"{source.family} {WEIGHT_NAMES[weight]}".strip()
    legacy_subfamily = "Italic" if source.italic else "Regular"
    full_name = f"{source.family} {typographic_subfamily}"
    postscript_name = f"{source.family}-{typographic_subfamily.replace(' ', '')}"

    name_table = font["name"]
    old_postscript_name = name_table.getDebugName(6)
    unique_id = name_table.getDebugName(3).replace(old_postscript_name, postscript_name)

    for name_id, value in (
        (1, legacy_family),
        (2, legacy_subfamily),
        (3, unique_id),
        (4, full_name),
        (6, postscript_name),
        (16, source.family),
        (17, typographic_subfamily),
    ):
        name_table.setName(value, name_id, *WINDOWS_UNICODE_BMP)

    # The one metric a static instance must carry itself: with the axis gone,
    # this is the only place left that says how heavy the file is, and it is
    # what the browser matches `font-weight: 600` against.
    font["OS/2"].usWeightClass = weight


def subset_font(font: TTFont) -> None:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = list(options.layout_features) + EXTRA_LAYOUT_FEATURES
    options.name_IDs = KEPT_NAME_IDS
    options.notdef_outline = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODE_RANGES))
    subsetter.subset(font)


def build(source: Source, weight: int) -> Path:
    family_dir = FONTS_DIR / source.directory
    source_path = family_dir / "upstream" / source.filename
    suffix = "-Italic" if source.italic else ""
    output_path = family_dir / f"{source.family}{suffix}-{weight}.woff2"

    # recalcTimestamp=False: fontTools otherwise stamps `head.modified` with the
    # time of the run, which would make every regeneration produce eight
    # different files and turn a no-op rebuild into a diff nobody can review.
    with TTFont(source_path, recalcTimestamp=False) as font:
        instantiate(font, source, weight)
        subset_font(font)
        # Round-trip through memory so the WOFF2 on disk is only ever written
        # from a font that compressed cleanly, and so `glyphs` below counts what
        # actually shipped rather than what the subsetter intended.
        buffer = io.BytesIO()
        font.save(buffer)

    output_path.write_bytes(buffer.getvalue())
    with TTFont(io.BytesIO(buffer.getvalue())) as written:
        glyphs = written["maxp"].numGlyphs

    print(f"{output_path.relative_to(REPO_ROOT)}  {len(buffer.getvalue())} bytes  {glyphs} glyphs")
    return output_path


def main() -> None:
    total = 0
    for source in SOURCES:
        for weight in WEIGHTS:
            total += build(source, weight).stat().st_size
    print(f"total {total} bytes")


if __name__ == "__main__":
    main()
