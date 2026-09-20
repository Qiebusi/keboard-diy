/* =========================================================
 * 2D 形状工具（Shape / Path / 键位开孔合并）
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";
import { MX, REF } from "./spec.js";

export function sqPath(x, z, half) {
  const p = new THREE.Path();
  p.moveTo(x - half, z - half);
  p.lineTo(x + half, z - half);
  p.lineTo(x + half, z + half);
  p.lineTo(x - half, z + half);
  p.closePath();
  return p;
}

/* C 形环：外轮廓为圆角矩形、缺掉 z < zCut 那一段（后壁单独做），两端是平口。
   用来做下壳的三面壁（前 + 左右）：x0/x1/z0/z1 为外轮廓，r 外圆角，t 壁厚 */
export function cRingShape(x0, z0, x1, z1, r, t, zCut) {
  const p = new THREE.Shape();
  const ri = r - t;
  p.moveTo(x0, zCut);
  p.lineTo(x0, z1 - r);
  p.absarc(x0 + r, z1 - r, r, Math.PI, Math.PI / 2, true);
  p.lineTo(x1 - r, z1);
  p.absarc(x1 - r, z1 - r, r, Math.PI / 2, 0, true);
  p.lineTo(x1, zCut);
  p.lineTo(x1 - t, zCut);
  p.lineTo(x1 - t, z1 - r);
  p.absarc(x1 - r, z1 - r, ri, 0, Math.PI / 2, false);
  p.lineTo(x0 + r, z1 - t);
  p.absarc(x0 + r, z1 - r, ri, Math.PI / 2, Math.PI, false);
  p.lineTo(x0 + t, zCut);
  p.closePath();
  return p;
}

/* 圆角矩形（外壳轮廓/内口都用它；p 传 new THREE.Shape() 或 new THREE.Path()） */
export function roundRectShape(x0, z0, x1, z1, r, p) {
  const rr = Math.min(r, (x1 - x0) / 2, (z1 - z0) / 2);
  p.moveTo(x0 + rr, z0);
  p.lineTo(x1 - rr, z0);
  p.absarc(x1 - rr, z0 + rr, rr, -Math.PI / 2, 0, false);
  p.lineTo(x1, z1 - rr);
  p.absarc(x1 - rr, z1 - rr, rr, 0, Math.PI / 2, false);
  p.lineTo(x0 + rr, z1);
  p.absarc(x0 + rr, z1 - rr, rr, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, z0 + rr);
  p.absarc(x0 + rr, z0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return p;
}

/* 长边 ≥2u 的大键才配卫星轴（1.75u 及以下没有）：
   2u–6u 的大键：轴心两侧各 11.938mm（Cherry MX 标准偏移）；
   空格（≥6u）：安装点按长度取 —— 6.25u = 100mm、7u = 114.3mm，
   即安装点间距 = 100 + (w − 6.25) × 19.05，再取一半作为偏移。
   竖向键沿 z 排，横向键沿 x 排。定位板、卫星轴、键帽副轴柱共用这一份坐标。 */
export function stabPositions(k) {
  if (Math.max(k.w, k.h) < 2) return [];
  const cx = k.x + k.w / 2, cz = k.y + k.h / 2;
  const horiz = k.w >= k.h;
  const span = horiz ? k.w : k.h;
  /* 换算成 u：6.25u → 100mm/2 = 2.625u，7u → 114.3mm/2 = 3u */
  const o = span >= 6 ? (100 / 19.05 + (span - 6.25)) / 2 : REF.stabX;
  return horiz ? [[cx - o, cz], [cx + o, cz]] : [[cx, cz - o], [cx, cz + o]];
}

/* 铭牌贴图（只建一次） */
/* ---------- 键位开孔合并 ----------
 * 相邻键帽之间不该有隔板：把每个键位矩形各向外放 m，再把相交的并成互不重叠的矩形。
 * 并集正好是矩形（同向对齐 / 包含）就直接合并；否则精确做差，保证只吃掉键位本身，
 * 布局里真正没有键的地方（留白、分组间隙）一点不动，仍然保留外壳塑料。 */
export function mergeKeyRects(keys, m) {
  const eps = 1e-9;
  const inter = (a, b) => [
    Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])
  ];
  const area = r => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  /* b 扣掉 a 之后剩下的矩形（最多 4 块，只留面积 > 0 的） */
  const subtract = (b, a) => {
    const x0 = Math.max(a[0], b[0]), x1 = Math.min(a[2], b[2]);
    const z0 = Math.max(a[1], b[1]), z1 = Math.min(a[3], b[3]);
    if (x1 - x0 <= eps || z1 - z0 <= eps) return [b];      // 不相交
    const r = [];
    for (const q of [[b[0], b[1], b[2], z0], [b[0], z1, b[2], b[3]],
                     [b[0], z0, x0, z1], [x1, z0, b[2], z1]]) {
      if (area(q) > eps) r.push(q);
    }
    return r;
  };
  /* 反复扫，直到一轮下来完全合不动：先把每排并成整条，再把各排并成整片 */
  let list = keys.map(k => [k.x - m, k.y - m, k.x + k.w + m, k.y + k.h + m]);
  let changed = true;
  while (changed) {
    changed = false;
    const out = [];
    while (list.length) {
      const a = list.pop();
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        const it = inter(a, b);
        const ovx = it[2] - it[0], ovz = it[3] - it[1];
        if (ovx < -eps || ovz < -eps) continue;                    // 有缝：不相交
        const sameX = Math.abs(a[0] - b[0]) <= eps && Math.abs(a[2] - b[2]) <= eps;
        const sameZ = Math.abs(a[1] - b[1]) <= eps && Math.abs(a[3] - b[3]) <= eps;
        const bIn = b[0] >= a[0] - eps && b[2] <= a[2] + eps && b[1] >= a[1] - eps && b[3] <= a[3] + eps;
        const aIn = a[0] >= b[0] - eps && a[2] <= b[2] + eps && a[1] >= b[1] - eps && a[3] <= b[3] + eps;
        if (ovx <= eps || ovz <= eps) {                            // 只是相接：同向对齐才合
          if (!sameX && !sameZ) continue;
          a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]);
          a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]);
          list.splice(i, 1);
          changed = true;
          continue;
        }
        if (sameX || sameZ) {                                      // 并集仍是矩形 → 直接合
          a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]);
          a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]);
          list.splice(i, 1);
        } else if (bIn) {
          list.splice(i, 1);
        } else if (aIn) {
          a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; a[3] = b[3];
          list.splice(i, 1);
        } else {                                                   // 部分相交：精确做差
          list.splice(i, 1);
          for (const q of subtract(b, a)) list.push(q);
        }
        changed = true;
      }
      out.push(a);
    }
    list = out;
  }
  return list;
}
