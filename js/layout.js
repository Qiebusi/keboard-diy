/* =========================================================
 * 标准键盘布局数据（参考 Keyboard Layout Editor / KLE 规范）
 * 比例标准：1u = 19.05mm 键距；常规 1u 键帽顶面 ≈ 0.66u
 * 数据格式为 KLE 风格：字符串 = 1u 键，
 * 对象 = 修饰当前或后续键的 {w, h, x, y}
 * ========================================================= */

const KEYBOARD_LAYOUTS = {
  /* ---------- 75%（87 键，16u 宽，KLE 官方 Keycool 84 / KBD75 标准） ---------- */

  /* ---------- 60% ANSI（61 键，15u 宽） ---------- */
  "60": [
    ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", { w: 2 }, "Backspace"],
    [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\"],
    [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter"],
    [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", { w: 2.75 }, "Shift"],
    [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", { w: 1.25 }, "Alt", { w: 1.25 }, "Fn", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl"]
  ],

  "75": [
    ["Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "PrtSc", "ScrLk", "Del"],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", { w: 2 }, "Backspace", "Home"],
    [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\", "PgUp"],
    [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter", "PgDn"],
    [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", { w: 1.75 }, "Shift", "↑", "End"],
    [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", "Alt", "Fn", "Ctrl", "←", "↓", "→"]
  ],

  /* ---------- 87 键 TKL（18.25u 宽） ---------- */
  "tkl": [
    ["Esc", { x: 1.75 }, "F1", "F2", "F3", "F4", { x: 6.25 }, "F5", "F6", "F7", "F8", { x: 10.75 }, "F9", "F10", "F11", "F12", { x: 15.25 }, "PrtSc", "Scroll Lock", "Pause"],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", { w: 2 }, "Backspace"],
    [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\", { x: 15.25 }, "Ins", "Home", "PgUp"],
    [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter", { x: 15.25 }, "Del", "End", "PgDn"],
    [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", { w: 2.75 }, "Shift", { x: 16.25 }, "↑"],
    [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", { w: 1.25 }, "Alt", { w: 1.25 }, "Fn", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl", { x: 15.25 }, "←", "↓", "→"]
  ],

  /* ---------- 104 键 全尺寸（22.5u 宽） ---------- */
  "full": [
    ["Esc", { x: 1.75 }, "F1", "F2", "F3", "F4", { x: 6.25 }, "F5", "F6", "F7", "F8", { x: 10.75 }, "F9", "F10", "F11", "F12", { x: 15.25 }, "PrtSc", "Scroll Lock", "Pause"],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", { w: 2 }, "Backspace", { x: 18.5 }, "Num Lock", "/", "*", "-"],
    [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\", { x: 15.25 }, "Ins", "Home", "PgUp", { x: 18.5 }, "7", "8", "9", { h: 2 }, "+"],
    [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter", { x: 15.25 }, "Del", "End", "PgDn", { x: 18.5 }, "4", "5", "6"],
    [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", { w: 2.75 }, "Shift", { x: 16.25 }, "↑", { x: 18.5 }, "1", "2", "3", { h: 2 }, "Enter"],
    [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", { w: 1.25 }, "Alt", { w: 1.25 }, "Fn", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl", { x: 15.25 }, "←", "↓", "→", { x: 18.5 }, { w: 2 }, "0", "."]
  ]
};

/**
 * 解析 KLE 风格布局 → 扁平键位数组
 * 输出：{ label, x, y, w, h }（单位：u）
 */
function parseKLE(rows) {
  const keys = [];
  rows.forEach((row, ry) => {
    let x = 0;
    let cur = null;
    row.forEach(item => {
      if (typeof item === "string") {
        const w = (cur && cur.w) || 1;
        const h = (cur && cur.h) || 1;
        const kx = (cur && cur.x != null) ? cur.x : x;
        const ky = (cur && cur.y != null) ? cur.y : ry;
        keys.push({
          label: String(item).split("\n")[0],
          x: kx, y: ky, w, h
        });
        x = kx + w;
        cur = null;
      } else if (item && typeof item === "object") {
        cur = Object.assign({}, cur, item);
        if (item.x != null) x = item.x;
      }
    });
  });
  return keys;
}

function getLayoutRows(name) {
  return KEYBOARD_LAYOUTS[name] || KEYBOARD_LAYOUTS["60"];
}

/* 布局总尺寸（u） */
function layoutBounds(keys) {
  let W = 0, H = 0;
  for (const k of keys) {
    W = Math.max(W, k.x + k.w);
    H = Math.max(H, k.y + k.h);
  }
  return { W, H };
}

/* =========================================================
 * 键帽高度档案（真实键帽分排规格）
 * 高度单位 mm（键帽顶面到键盘定位板），倾角单位度（正 = 前缘低）
 * rows 依次为：R1 数字排 / R2 Q 排 / R3 home 排 / R4 Z 排 / 底排
 * f = F 功能排，space = 空格
 * ========================================================= */
const KEYCAP_PROFILES = {
  oem: { label: "OEM（标准）", f: [8.9, 13], rows: [[9.4, 10], [10.4, 6], [11.3, 0], [12.2, -10], [12.2, -10]], space: [11.6, -4] },
  cherry: { label: "Cherry（原厂）", f: [6.2, 15], rows: [[6.7, 12], [7.6, 7], [8.1, 0], [8.9, -13], [8.5, -13]], space: [8.0, -6] },
  sa: { label: "SA（球帽）", f: [11.9, 13], rows: [[12.7, 11], [13.7, 6], [14.3, 0], [13.0, -12], [12.6, -12]], space: [12.4, -5] },
  dsa: { label: "DSA（等高）", f: [7.3, 0], rows: [[7.3, 0], [7.3, 0], [7.3, 0], [7.3, 0], [7.3, 0]], space: [7.3, 0] },
  xda: { label: "XDA（等高）", f: [8.4, 0], rows: [[8.4, 0], [8.4, 0], [8.4, 0], [8.4, 0], [8.4, 0]], space: [8.4, 0] }
};

const MM_PER_U = 19.05;

/* 根据键位求所在排的高度参数
 * hasFRow：布局是否含 F 功能排（TKL / 104 的第 0 行） */
function keycapProfileFor(k, hasFRow, profileName) {
  const P = KEYCAP_PROFILES[profileName] || KEYCAP_PROFILES.oem;
  if (k.w >= 5) return { h: P.space[0] / MM_PER_U, tilt: P.space[1] * Math.PI / 180 };
  let ri = hasFRow ? k.y : k.y + 1;
  ri = Math.max(0, Math.min(5, ri));
  if (ri === 0) return { h: P.f[0] / MM_PER_U, tilt: P.f[1] * Math.PI / 180 };
  const r = P.rows[ri - 1];
  return { h: r[0] / MM_PER_U, tilt: r[1] * Math.PI / 180 };
}
