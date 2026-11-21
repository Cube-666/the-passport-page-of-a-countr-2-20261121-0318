// The Passport Page of a Country That Isn't There.
// A deterministic program (Node 22, stdlib only, no network) that draws one
// invented passport spread — the Republic of Kestria — and writes it to
// /output/entry.png (1024x1024 PNG, at most 1 MiB).
//
// The spread is drawn with a tiny software rasterizer and a 5x7 bitmap font.
// Every date on it agrees: the passport was issued 12 MAR 2024, the Aldor
// visa was issued 03 MAY 2024, and every stamp falls between issue and the
// 11 MAR 2034 expiry, in a plausible travel order.
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

type RGB = [number, number, number];

const PAPER: RGB = [246, 241, 226];
const INK: RGB = [34, 48, 74];
const SOFT: RGB = [90, 107, 132];
const GOLD: RGB = [154, 123, 45];
const GOLD_LT: RGB = [232, 217, 168];
const GUI_A: RGB = [220, 224, 210];
const GUI_B: RGB = [224, 228, 236];
const BLUE: RGB = [44, 79, 138];
const RED: RGB = [160, 58, 42];
const GREEN: RGB = [47, 107, 78];
const PURPLE: RGB = [90, 74, 134];
const BRONZE: RGB = [122, 92, 32];
const SKIN: RGB = [200, 165, 134];
const SKIN_DK: RGB = [176, 138, 106];
const HAIR: RGB = [58, 50, 48];
const SUIT: RGB = [44, 54, 68];

// ---------------------------------------------------------------- canvas
class Canvas {
  w: number;
  h: number;
  data: Uint8Array;
  clip: [number, number, number, number] | null = null;

  constructor(w: number, h: number, bg: RGB | null) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    if (bg) {
      for (let i = 0; i < w * h; i++) {
        this.data[i * 4] = bg[0];
        this.data[i * 4 + 1] = bg[1];
        this.data[i * 4 + 2] = bg[2];
        this.data[i * 4 + 3] = 255;
      }
    }
  }

  static blank(w: number, h: number): Canvas {
    return new Canvas(w, h, null);
  }

  setClip(x0: number, y0: number, x1: number, y1: number): void {
    this.clip = [x0, y0, x1, y1];
  }

  clearClip(): void {
    this.clip = null;
  }

  set(x: number, y: number, c: RGB, a: number = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (this.clip) {
      if (x < this.clip[0] || x > this.clip[2] || y < this.clip[1] || y > this.clip[3]) return;
    }
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = 255;
      return;
    }
    const s = a / 255;
    const d = 1 - s;
    this.data[i] = Math.round(c[0] * s + this.data[i] * d);
    this.data[i + 1] = Math.round(c[1] * s + this.data[i + 1] * d);
    this.data[i + 2] = Math.round(c[2] * s + this.data[i + 2] * d);
    if (this.data[i + 3] < a) this.data[i + 3] = a;
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB, a: number = 255): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, t: number = 1): void {
    for (let k = 0; k < t; k++) {
      this.hline(x, y + k, x + w - 1, c);
      this.hline(x, y + h - 1 - k, x + w - 1, c);
      this.vline(x + k, y, y + h - 1, c);
      this.vline(x + w - 1 - k, y, y + h - 1, c);
    }
  }

  hline(x0: number, y: number, x1: number, c: RGB, a: number = 255): void {
    const a0 = Math.min(x0, x1);
    const a1 = Math.max(x0, x1);
    for (let x = a0; x <= a1; x++) this.set(x, y, c, a);
  }

  vline(x: number, y0: number, y1: number, c: RGB, a: number = 255): void {
    const b0 = Math.min(y0, y1);
    const b1 = Math.max(y0, y1);
    for (let y = b0; y <= b1; y++) this.set(x, y, c, a);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a: number = 255): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGB, a: number = 255): void {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -w; x <= w; x++) this.set(cx + x, cy + y, c, a);
    }
  }

  circle(cx: number, cy: number, r: number, c: RGB, a: number = 255): void {
    for (let deg = 0; deg < 360; deg++) {
      const t = (deg * Math.PI) / 180;
      this.set(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c, a);
    }
  }

  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB, a: number = 255): void {
    for (let deg = a0; deg <= a1; deg++) {
      const t = (deg * Math.PI) / 180;
      this.set(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c, a);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number = 255): void {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      for (let x = -w; x <= w; x++) this.set(cx + x, cy + y, c, a);
    }
  }

  fillPath(pts: Array<[number, number]>, c: RGB, a: number = 255): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y)) {
          const t = (y - p0[1]) / (p1[1] - p0[1]);
          xs.push(p0[0] + t * (p1[0] - p0[0]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.set(x, y, c, a);
      }
    }
  }

  star(cx: number, cy: number, r: number, c: RGB, a: number = 255): void {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.42;
      pts.push([cx + Math.round(rr * Math.cos(ang)), cy + Math.round(rr * Math.sin(ang))]);
    }
    this.fillPath(pts, c, a);
  }

  blit(src: Canvas, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        this.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], a);
      }
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph is 7 rows of 5 bits, most significant bit on the left.
const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  ">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  ":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  "=": [0, 0, 0b11111, 0, 0b11111, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 0b11111],
  ";": [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  "[": [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  "]": [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  "*": [0, 0b10101, 0b01110, 0b10101, 0, 0, 0],
};

function textWidth(s: string, scale: number, spacing: number = 1): number {
  if (s.length === 0) return 0;
  return s.length * (5 * scale + spacing) - spacing;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, spacing: number = 1): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row & (1 << (4 - col))) {
          cv.fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 5 * scale + spacing;
  }
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB, spacing: number = 1): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale, spacing) / 2), y, scale, c, spacing);
}

function blitRotated(dst: Canvas, src: Canvas, cx: number, cy: number, deg: number): void {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = src.w / 2;
  const hh = src.h / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let dy = Math.floor(minY); dy <= Math.ceil(maxY); dy++) {
    for (let dx = Math.floor(minX); dx <= Math.ceil(maxX); dx++) {
      const sx = Math.round(dx * cos + dy * sin + hw);
      const sy = Math.round(-dx * sin + dy * cos + hh);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const i = (sy * src.w + sx) * 4;
      const a = src.data[i + 3];
      if (a === 0) continue;
      dst.set(cx + dx, cy + dy, [src.data[i], src.data[i + 1], src.data[i + 2]], a);
    }
  }
}

// ---------------------------------------------------------------- MRZ
function mrzVal(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  return 0;
}

function mrzCheck(s: string): string {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += mrzVal(s[i]) * w[i % 3];
  return String(sum % 10);
}

function mrzLines(): [string, string] {
  const line1 = "P<KTRVOSS<<MARA<ELIN" + "<".repeat(24);
  const doc = "KTR482913";
  const c1 = mrzCheck(doc);
  const dob = "880614";
  const c2 = mrzCheck(dob);
  const exp = "340311";
  const c3 = mrzCheck(exp);
  const opt = "<".repeat(15);
  const comp = mrzCheck(doc + c1 + dob + c2 + exp + c3 + opt);
  const line2 = doc + c1 + "KTR" + dob + c2 + "F" + exp + c3 + opt + comp;
  return [line1, line2];
}

// ---------------------------------------------------------------- pieces
function guilloche(cv: Canvas, x0: number, x1: number, y0: number, y1: number): void {
  for (let k = 0; k < 14; k++) {
    const yb = y0 + 20 + (k * (y1 - y0 - 40)) / 13;
    const col = k % 2 === 0 ? GUI_A : GUI_B;
    for (let x = x0; x <= x1; x += 2) {
      const y = Math.round(yb + 3 * Math.sin(((x / 64 + k * 0.7) * Math.PI) / 1));
      cv.set(x, y, col);
    }
  }
}

function drawArms(cv: Canvas, cx: number, top: number, s: number): void {
  const w = Math.round(64 * s);
  const h = Math.round(76 * s);
  const x0 = cx - Math.round(w / 2);
  const y0 = top;
  const pts: Array<[number, number]> = [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y0 + Math.round(h * 0.55)],
    [cx, y0 + h],
    [x0, y0 + Math.round(h * 0.55)],
  ];
  cv.fillPath(pts, GOLD_LT);
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    cv.line(p0[0], p0[1], p1[0], p1[1], INK);
  }
  cv.star(cx, y0 + Math.round(26 * s), Math.round(13 * s), INK);
  for (let k = 0; k < 2; k++) {
    const yb = y0 + Math.round((48 + k * 9) * s);
    for (let x = x0 + 8; x <= x0 + w - 8; x += 2) {
      const y = Math.round(yb + 2 * s * Math.sin((x / 14) * Math.PI));
      cv.set(x, y, BLUE);
    }
  }
}

function drawPortrait(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, x + w - 1, y + h - 1);
  for (let yy = y; yy < y + h; yy++) {
    const t = (yy - y) / h;
    const r = Math.round(198 - 42 * t);
    const g = Math.round(206 - 40 * t);
    const b = Math.round(212 - 36 * t);
    cv.hline(x, yy, x + w - 1, [r, g, b]);
  }
  cv.fillRect(x, y, w, 10, [206, 212, 218]);
  const cx = x + Math.floor(w / 2);
  const headCy = y + Math.floor(h * 0.34);
  // shoulders / suit
  cv.ellipse(cx, y + h + 34, Math.floor(w * 0.62), Math.floor(h * 0.42), SUIT);
  // shirt
  cv.fillPath(
    [
      [cx - 16, y + Math.floor(h * 0.62)],
      [cx + 16, y + Math.floor(h * 0.62)],
      [cx, y + h],
    ],
    [233, 233, 229]
  );
  // tie
  cv.fillPath(
    [
      [cx - 6, y + Math.floor(h * 0.66)],
      [cx + 6, y + Math.floor(h * 0.66)],
      [cx + 9, y + Math.floor(h * 0.86)],
      [cx, y + h],
      [cx - 9, y + Math.floor(h * 0.86)],
    ],
    [122, 42, 42]
  );
  // neck
  cv.fillRect(cx - 13, y + Math.floor(h * 0.52), 26, Math.floor(h * 0.14), SKIN_DK);
  // ears
  cv.ellipse(cx - 35, headCy, 5, 9, SKIN);
  cv.ellipse(cx + 35, headCy, 5, 9, SKIN);
  // head
  cv.ellipse(cx, headCy, 34, 44, SKIN);
  // hair: cap over the top of the head, swept to one side
  cv.ellipse(cx - 2, y + Math.floor(h * 0.16), 36, 20, HAIR);
  cv.ellipse(cx - 26, y + Math.floor(h * 0.24), 12, 18, HAIR);
  cv.ellipse(cx + 26, y + Math.floor(h * 0.24), 12, 18, HAIR);
  // brows
  cv.line(cx - 22, headCy - 12, cx - 10, headCy - 14, HAIR);
  cv.line(cx + 10, headCy - 14, cx + 22, headCy - 12, HAIR);
  // eyes
  cv.fillRect(cx - 20, headCy - 6, 7, 3, [40, 40, 44]);
  cv.fillRect(cx + 13, headCy - 6, 7, 3, [40, 40, 44]);
  // nose
  cv.line(cx, headCy + 2, cx - 2, headCy + 14, SKIN_DK);
  cv.line(cx - 2, headCy + 14, cx + 3, headCy + 15, SKIN_DK);
  // mouth
  cv.line(cx - 9, headCy + 26, cx + 9, headCy + 26, [150, 92, 80]);
  // cheek shading, engraved hatching on the lit side
  for (let k = 0; k < 4; k++) {
    cv.line(cx + 14 + k * 4, headCy + 4, cx + 10 + k * 4, headCy + 18, SKIN_DK, 90);
  }
  // printed-photo halftone dots
  for (let yy = y + 2; yy < y + h; yy += 5) {
    for (let xx = x + 2; xx < x + w; xx += 5) {
      cv.set(xx, yy, [40, 50, 66], 16);
    }
  }
  cv.clearClip();
}

function drawSignature(cv: Canvas, x: number, y: number, w: number): void {
  let prevX = x;
  let prevY = y;
  for (let dx = 0; dx <= w; dx += 2) {
    const yy = Math.round(y + 6 * Math.sin(dx / 16) + 3 * Math.sin(dx / 6 + 1) - (dx / w) * 4);
    cv.line(prevX, prevY, x + dx, yy, INK);
    prevX = x + dx;
    prevY = yy;
  }
  cv.line(x + Math.floor(w * 0.55), y - 14, x + Math.floor(w * 0.62), y + 8, INK);
  cv.line(x + Math.floor(w * 0.1), y + 10, x + Math.floor(w * 0.9), y + 6, INK);
}

function drawFingerprint(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const cx = x + Math.floor(w / 2);
  const cy = y + h - 8;
  for (let r = 8; r <= 34; r += 5) {
    cv.arc(cx, cy, r, 195, 345, SOFT, 170);
  }
  for (let r = 11; r <= 32; r += 5) {
    cv.arc(cx, cy, r, 200, 340, INK, 110);
  }
}

interface StampLine {
  t: string;
  s: number;
}

function rectStamp(w: number, h: number, ink: RGB, lines: StampLine[]): Canvas {
  const cv = Canvas.blank(w, h);
  cv.rect(3, 3, w - 6, h - 6, ink, 2);
  cv.rect(8, 8, w - 16, h - 16, ink, 1);
  const total = lines.reduce((sum, ln) => sum + 7 * ln.s + 6, 0) - 6;
  let y = Math.floor((h - total) / 2);
  for (const ln of lines) {
    drawTextCentered(cv, ln.t, Math.floor(w / 2), y, ln.s, ink);
    y += 7 * ln.s + 6;
  }
  cv.star(17, 17, 5, ink);
  cv.star(w - 17, 17, 5, ink);
  cv.star(17, h - 17, 5, ink);
  cv.star(w - 17, h - 17, 5, ink);
  return cv;
}

function circleStamp(d: number, ink: RGB, lines: StampLine[]): Canvas {
  const cv = Canvas.blank(d, d);
  const c = Math.floor(d / 2);
  cv.circle(c, c, c - 4, ink);
  cv.circle(c, c, c - 11, ink);
  const total = lines.reduce((sum, ln) => sum + 7 * ln.s + 6, 0) - 6;
  let y = Math.floor((d - total) / 2);
  for (const ln of lines) {
    drawTextCentered(cv, ln.t, c, y, ln.s, ink);
    y += 7 * ln.s + 6;
  }
  cv.star(c, 14, 5, ink);
  cv.star(c, d - 14, 5, ink);
  return cv;
}

// ---------------------------------------------------------------- PNG
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(cv: Canvas): Buffer {
  const w = cv.w;
  const h = cv.h;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(cv.data.subarray(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- build
function field(cv: Canvas, x: number, y: number, label: string, value: string): void {
  drawText(cv, label, x, y, 1, SOFT);
  drawText(cv, value, x, y + 9, 2, INK);
}

function buildSpread(): Canvas {
  const cv = new Canvas(1024, 1024, PAPER);
  // page furniture
  cv.rect(6, 6, 1012, 1012, INK, 2);
  cv.rect(12, 12, 1000, 1000, GOLD, 1);
  guilloche(cv, 16, 506, 16, 1008);
  guilloche(cv, 518, 1008, 16, 1008);
  cv.vline(511, 14, 1010, SOFT);
  cv.vline(513, 14, 1010, SOFT);
  for (let y = 20; y < 1004; y += 12) cv.fillRect(510, y, 3, 5, GOLD);

  // ================= left page: data page =================
  drawArms(cv, 260, 36, 1);
  drawTextCentered(cv, "REPUBLIC OF KESTRIA", 260, 122, 3, INK);
  drawTextCentered(cv, "REPUBLIKA KESTRIJA", 260, 152, 2, SOFT);
  drawTextCentered(cv, "PASSPORT", 260, 180, 3, INK);
  drawTextCentered(cv, "PUTOVNICA", 260, 208, 2, SOFT);
  cv.hline(60, 232, 460, INK);
  cv.hline(60, 236, 460, GOLD);

  // portrait, framed
  drawPortrait(cv, 46, 258, 144, 208);
  cv.rect(40, 252, 156, 220, INK, 2);
  cv.rect(44, 256, 148, 212, GOLD, 1);
  // embossed seal overlapping the photo corner
  cv.circle(184, 452, 24, GOLD, 220);
  cv.circle(184, 452, 19, GOLD, 220);
  cv.star(184, 452, 9, GOLD, 220);

  // data fields
  drawText(cv, "TYPE", 216, 252, 1, SOFT);
  drawText(cv, "P", 216, 261, 2, INK);
  drawText(cv, "CODE", 276, 252, 1, SOFT);
  drawText(cv, "KTR", 276, 261, 2, INK);
  drawText(cv, "PASSPORT NO.", 340, 252, 1, SOFT);
  drawText(cv, "KTR4829137", 340, 261, 2, INK);
  field(cv, 216, 286, "SURNAME / PREZIME", "VOSS");
  field(cv, 216, 320, "GIVEN NAMES / IMENA", "MARA ELIN");
  field(cv, 216, 354, "NATIONALITY / DRZAVLJANSTVO", "KESTRIAN");
  field(cv, 216, 388, "DATE OF BIRTH / DATUM RODENJA", "14 JUN 1988");
  field(cv, 216, 422, "PLACE OF BIRTH / MJESTO RODENJA", "VARNHELM");
  field(cv, 216, 456, "SEX / SPOL", "F");
  field(cv, 216, 490, "DATE OF ISSUE / DATUM IZDAVANJA", "12 MAR 2024");
  field(cv, 216, 524, "DATE OF EXPIRY / DATUM ISTEKA", "11 MAR 2034");
  drawText(cv, "AUTHORITY / ORGAN", 216, 558, 1, SOFT);
  drawText(cv, "MINISTRY OF FOREIGN", 216, 567, 2, INK);
  drawText(cv, "AFFAIRS", 216, 583, 2, INK);

  // fingerprint + signature
  drawFingerprint(cv, 40, 622, 110, 78);
  cv.rect(40, 622, 110, 78, SOFT, 1);
  drawTextCentered(cv, "RIGHT INDEX FINGER", 95, 706, 1, SOFT);
  drawSignature(cv, 190, 648, 280);
  cv.hline(180, 668, 480, INK);
  drawTextCentered(cv, "HOLDER'S SIGNATURE / POTPIS", 330, 676, 1, SOFT);

  // small print
  drawText(cv, "THIS PASSPORT IS THE PROPERTY OF THE REPUBLIC OF KESTRIA.", 40, 736, 1, SOFT);
  drawText(cv, "THE HOLDER IS ENTITLED TO CONSULAR PROTECTION ABROAD.", 40, 748, 1, SOFT);
  drawText(cv, "IF FOUND, PLEASE RETURN TO THE NEAREST KESTRIAN MISSION.", 40, 760, 1, SOFT);
  cv.hline(40, 800, 480, INK);
  cv.hline(40, 804, 480, GOLD);

  // machine-readable zone (check digits computed, not typed)
  const [mrz1, mrz2] = mrzLines();
  drawText(cv, mrz1, 30, 850, 2, INK, 0);
  drawText(cv, mrz2, 30, 878, 2, INK, 0);
  drawText(cv, "32 PAGES", 40, 968, 1, SOFT);
  drawText(cv, "1", 484, 962, 2, INK);

  // ================= right page: visas and stamps =================
  drawTextCentered(cv, "VISAS", 764, 48, 3, INK);
  drawTextCentered(cv, "VIZE", 764, 78, 2, SOFT);
  cv.hline(600, 104, 928, INK);
  cv.hline(600, 108, 928, GOLD);

  // visa sticker: Republic of Aldor
  cv.fillRect(540, 122, 448, 30, INK);
  drawText(cv, "VISA", 556, 129, 3, GOLD_LT);
  drawText(cv, "REPUBLIC OF ALDOR", 700, 131, 2, GOLD_LT);
  cv.rect(540, 122, 448, 250, INK, 2);
  field(cv, 556, 166, "VISA NO.", "ALD-2024-11873");
  field(cv, 760, 166, "TYPE", "C - MULTIPLE ENTRY");
  field(cv, 556, 206, "VALID FROM", "03 MAY 2024");
  field(cv, 760, 206, "TO", "02 NOV 2024");
  field(cv, 556, 246, "DURATION OF STAY", "90 DAYS");
  field(cv, 760, 246, "ISSUED AT", "CONSULATE GENERAL");
  drawText(cv, "VARNHELM", 760, 271, 2, INK);
  drawText(cv, "CONDITION", 556, 286, 1, RED);
  drawText(cv, "EMPLOYMENT NOT PERMITTED", 556, 295, 2, RED);
  const issued = circleStamp(120, BLUE, [
    { t: "ISSUED", s: 2 },
    { t: "ALDOR", s: 1 },
    { t: "03 MAY 2024", s: 1 },
  ]);
  blitRotated(cv, issued, 936, 330, -12);

  // stamps: a coherent travel history, all after the 12 MAR 2024 issue
  const sHelvetia = rectStamp(240, 120, BLUE, [
    { t: "HELVETIA", s: 2 },
    { t: "ZURICH", s: 2 },
    { t: "ENTRY", s: 1 },
    { t: "28 MAY 2024", s: 2 },
  ]);
  blitRotated(cv, sHelvetia, 676, 452, -7);
  const sNordmark = circleStamp(160, GREEN, [
    { t: "NORDMARK", s: 2 },
    { t: "OSLO", s: 2 },
    { t: "ENTRY", s: 1 },
    { t: "02 SEP 2024", s: 1 },
  ]);
  blitRotated(cv, sNordmark, 890, 452, 8);
  const sAldor = rectStamp(230, 110, PURPLE, [
    { t: "ALDOR", s: 2 },
    { t: "DEPARTURE", s: 2 },
    { t: "14 JUN 2024", s: 2 },
  ]);
  blitRotated(cv, sAldor, 668, 592, 5);
  const sThalIn = rectStamp(230, 110, RED, [
    { t: "THALASSIA", s: 2 },
    { t: "ENTRY", s: 2 },
    { t: "11 NOV 2024", s: 2 },
  ]);
  blitRotated(cv, sThalIn, 896, 592, -6);
  const sThalOut = rectStamp(230, 110, RED, [
    { t: "THALASSIA", s: 2 },
    { t: "EXIT", s: 2 },
    { t: "19 NOV 2024", s: 2 },
  ]);
  blitRotated(cv, sThalOut, 668, 730, -3);
  const sFee = rectStamp(220, 110, BRONZE, [
    { t: "FEE PAID", s: 2 },
    { t: "25 KES", s: 3 },
    { t: "REC. NO. 004821", s: 1 },
  ]);
  blitRotated(cv, sFee, 890, 730, 4);

  // faint watermark ring behind the stamps
  cv.circle(764, 600, 180, GUI_B, 70);
  drawTextCentered(cv, "PAGE 12", 764, 940, 2, SOFT);
  drawTextCentered(cv, "THIS PASSPORT CONTAINS 32 PAGES", 764, 968, 1, SOFT);
  return cv;
}

// ---------------------------------------------------------------- main
function main(): void {
  const cv = buildSpread();
  const png = encodePNG(cv);
  fs.mkdirSync("/output", { recursive: true });
  fs.writeFileSync("/output/entry.png", png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`WROTE /output/entry.png ${png.length} bytes sha256=${sha} 1024x1024`);
  if (png.length > 1048576) {
    console.error("ERROR: entry.png exceeds the 1,048,576 byte cap");
    process.exit(1);
  }
}

main();
