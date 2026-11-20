import { create, type Font, type FontCollection } from "fontkit";
import type { LoadedFont } from "../../../shared/font";

const PROBES = ["M", "H", "W", "0", "@", "A", "m", "#", "&", "?"];
const VERIFY_SIZE = 64;

let familySeq = 0;

function isCollection(font: Font | FontCollection): font is FontCollection {
  return (font as FontCollection).fonts !== undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function glyphAdvance(font: Font, cp: number): number | null {
  try {
    const glyph = font.glyphForCodePoint(cp);
    if (!glyph || glyph.id === 0) return null;
    return glyph.advanceWidth > 0 ? glyph.advanceWidth : null;
  } catch {
    return null;
  }
}

interface Probe {
  char: string;
  /** Advance in CSS pixels at VERIFY_SIZE, derived from the font binary. */
  expected: number;
}

function probesFor(font: Font): Probe[] {
  const probes: Probe[] = [];
  for (const char of PROBES) {
    const cp = char.codePointAt(0)!;
    if (!font.hasGlyphForCodePoint(cp)) continue;
    const advance = glyphAdvance(font, cp);
    if (advance == null) continue;
    probes.push({
      char,
      expected: (advance / font.unitsPerEm) * VERIFY_SIZE,
    });
  }
  return probes;
}

/**
 * Compare the browser's measured advance with the one in the parsed font.
 * A silent fallback reports the fallback's advance, so any mismatch means the
 * face is not actually active yet.
 */
function metricsMatch(
  ctx: CanvasRenderingContext2D,
  family: string,
  probes: Probe[],
): boolean {
  if (!probes.length) return true;
  ctx.font = `${VERIFY_SIZE}px "${family}"`;
  for (const probe of probes) {
    const measured = ctx.measureText(probe.char).width;
    const tolerance = Math.max(0.75, probe.expected * 0.025);
    if (Math.abs(measured - probe.expected) > tolerance) return false;
  }
  return true;
}

/** Block until the browser truly renders with this family, not a fallback. */
async function waitUntilUsable(
  family: string,
  probes: Probe[],
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法创建 2D 画布");
  for (let attempt = 0; attempt < 80; attempt++) {
    if (metricsMatch(ctx, family, probes)) return;
    await wait(25);
  }
  throw new Error("字体已解析，但浏览器没有真正启用它（可能格式不受支持）");
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

export interface InstalledFont {
  info: LoadedFont;
  parsed: Font;
  face: FontFace | null;
}

/**
 * Parse a font binary, install it into the document, and return only after the
 * browser can really render it. Throws (leaving the caller's previous font
 * untouched) when any stage fails.
 */
export async function installFont(
  bytes: ArrayBuffer,
  source: string,
  formatHint: string,
): Promise<InstalledFont> {
  let parsed: Font | FontCollection;
  try {
    // fontkit's browser build accepts any byte view; the Node typings only
    // mention Buffer, so narrow through unknown for a type-safe cast.
    parsed = create(new Uint8Array(bytes) as unknown as Buffer);
  } catch (e) {
    throw new Error(
      `无法解析字体文件${e instanceof Error ? `：${e.message}` : ""}`,
    );
  }
  const font = isCollection(parsed) ? parsed.fonts[0] : parsed;
  if (!font) throw new Error("字体集合中没有可用的字体");

  const supported = new Set<number>();
  for (const cp of font.characterSet ?? []) {
    if (Number.isFinite(cp) && cp > 0 && cp !== 0x7f) supported.add(cp);
  }
  if (!supported.size) throw new Error("该字体不包含任何可用字符");

  const probes = probesFor(font);
  let monospace = false;
  let advanceEm = 0;
  const asciiAdvances = PROBES.map((c) => c.codePointAt(0)!)
    .filter((cp) => supported.has(cp))
    .map((cp) => glyphAdvance(font, cp))
    .filter((v): v is number => v != null);
  if (asciiAdvances.length >= 3) {
    const min = Math.min(...asciiAdvances);
    const max = Math.max(...asciiAdvances);
    monospace = max - min <= Math.max(1, font.unitsPerEm * 0.002);
    const sorted = [...asciiAdvances].sort((a, b) => a - b);
    advanceEm = sorted[Math.floor(sorted.length / 2)]! / font.unitsPerEm;
  } else {
    advanceEm = 0.6;
  }
  advanceEm = Math.min(2, Math.max(0.05, advanceEm));

  const family = `GlyphCal${++familySeq}-${hash(source).toString(36)}`;
  const name =
    [font.familyName, font.subfamilyName].filter(Boolean).join(" ").trim() ||
    font.postscriptName ||
    source;

  let face: FontFace | null = null;
  try {
    if (typeof FontFace === "undefined") {
      throw new Error("当前浏览器不支持自定义字体");
    }
    face = new FontFace(family, bytes);
    await face.load();
    if (typeof document === "undefined" || !document.fonts) {
      throw new Error("当前浏览器不支持字体集合");
    }
    document.fonts.add(face);
    await waitUntilUsable(family, probes);
  } catch (e) {
    uninstallFont(face);
    throw e instanceof Error
      ? e
      : new Error("字体加载失败，浏览器无法使用该字体");
  }

  const resolvedFormat = /\.([a-z0-9]+)$/i.exec(source)?.[1]?.toUpperCase();
  return {
    face,
    parsed: font,
    info: {
      id: `${familySeq}:${source}:${bytes.byteLength}`,
      family,
      name,
      postscriptName: font.postscriptName ?? "",
      format: resolvedFormat ?? font.type ?? formatHint.toUpperCase(),
      unitsPerEm: font.unitsPerEm,
      advanceEm,
      monospace,
      supported,
      glyphCount: font.numGlyphs,
      source,
    },
  };
}

export function uninstallFont(face: FontFace | null): void {
  if (!face || typeof document === "undefined" || !document.fonts) return;
  try {
    document.fonts.delete(face);
  } catch {
    /* the document may already be gone */
  }
}
