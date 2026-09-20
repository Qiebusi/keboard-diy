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
 * 键帽高度档案（真实键帽分排规格，数值取自 KeyV2 对 GMK / SP 实物的实测建模）
 * 高度单位 mm（裙边底到顶面），倾角单位度（正 = 前缘低）
 * rows 依次为：R1 数字排 / R2 Q 排 / R3 home 排 / R4 Z 排 / 底排（空格键所在排）
 * f = F 功能排，space = 空格（与底排同一排，规格必须一致，否则空格与两侧 Ctrl/Alt 高低不齐）
 * 映射自 KeyV2 的行号：R1~R4 = row 1~4，F 排与底排/空格 = row 0/5（数值相同），
 * 倾角按本文件约定取反（KeyV2 的 -3° → 本文件的 +3°）。
 * 注意：空格不是「底排高度 + 倾角 0」—— OEM 的空格排是整板最高的一排（11.2mm），
 * 与 F 排等高；Cherry 的空格排则与 Z 排同高（7.35mm）且带 11.5° 倾角。
 *
 * 横截面参数（mm，均为每侧值）：
 *   gap  底面相对键位格的内缩（相邻键帽之间的缝隙）
 *   xi   顶面相对底面的内缩（左右方向）
 *   zi   顶面相对底面的同名内缩（前后方向），OEM / Cherry 取自 KeyV2 的 height_difference/2
 *   skew 顶面整体后移量：原厂实物「后壁近垂直、前壁大幅内收」即由此而来。
 *        前后壁分别取值（见 keycapProfileFor）：
 *          后壁内收 zB = |zi − skew|  —— 恒为正、永远向内收，绝不外扩；
 *          前壁内收 zF = zi + skew   —— 保持大幅内收，skew 只作用在前壁这一侧。
 *        SA / DSA / XDA 的顶面本身前后对称（KeyV2 的 top_skew = 0），故 skew = 0。
 *   dish 顶面凹面：cyl 圆柱（Cherry / OEM，只左右弯曲）/ sph 球面（SA / DSA）
 * ========================================================= */
const KEYCAP_PROFILES = {
  oem: {
    label: "OEM（标准）", gap: 0.5, xi: 2.9, zi: 2.0, skew: 1.75, dish: { type: "cyl", depth: 1.0 },
    f: [11.2, 3], rows: [[9.45, -1], [9.0, -6], [9.25, -9], [9.25, -10], [11.2, 3]], space: [11.2, 3]
  },
  cherry: {
    label: "Cherry（原厂）", gap: 0.445, xi: 3.155, zi: 1.76, skew: 2.0, dish: { type: "cyl", depth: 0.65 },
    f: [9.8, 0], rows: [[9.8, 0], [7.45, -2.5], [6.55, -5], [7.35, -11.5], [7.35, -11.5]], space: [7.35, -11.5]
  },
  sa: {
    label: "SA（球帽）", gap: 0.325, xi: 2.85, zi: 2.85, skew: 0, dish: { type: "sph", depth: 0.85 },
    f: [14.89, 13], rows: [[14.89, 13], [12.925, 7], [12.5, 0], [12.925, -7], [12.5, 0]], space: [12.5, 0]
  },
  dsa: {
    label: "DSA（等高）", gap: 0.405, xi: 3.0, zi: 3.0, skew: 0, dish: { type: "sph", depth: 1.2 },
    f: [8.1, 0], rows: [[8.1, 0], [8.1, 0], [8.1, 0], [8.1, 0], [8.1, 0]], space: [8.1, 0]
  },
  xda: {
    label: "XDA（等高）", gap: 0.325, xi: 2.381, zi: 2.381, skew: 0, dish: null,
    f: [8.4, 0], rows: [[8.4, 0], [8.4, 0], [8.4, 0], [8.4, 0], [8.4, 0]], space: [8.4, 0]
  }
};

const MM_PER_U = 19.05;

/* 根据键位求所在排的高度参数（长度统一换算为 u，供几何使用）
 * hasFRow：布局是否含 F 功能排（TKL / 104 的第 0 行） */
function keycapProfileFor(k, hasFRow, profileName) {
  const P = KEYCAP_PROFILES[profileName] || KEYCAP_PROFILES.oem;
  let r = P.space;
  if (k.w < 5) {
    let ri = hasFRow ? k.y : k.y + 1;
    ri = Math.max(0, Math.min(5, ri));
    r = ri === 0 ? P.f : P.rows[ri - 1];
  }
  const u = mm => mm / MM_PER_U;
  const zi = u(P.zi), skew = u(P.skew || 0);
  return {
    h: u(r[0]), tilt: r[1] * Math.PI / 180,
    gap: u(P.gap), xi: u(P.xi), zi,
    /* 前后壁各自的内收量：后壁 |zi − skew|（向内，绝不外扩），前壁 zi + skew */
    zB: Math.abs(zi - skew), zF: zi + skew,
    dish: P.dish ? { type: P.dish.type, depth: u(P.dish.depth) } : null
  };
}

export {
  KEYBOARD_LAYOUTS, KEYCAP_PROFILES, MM_PER_U,
  parseKLE, getLayoutRows, layoutBounds, keycapProfileFor
};
