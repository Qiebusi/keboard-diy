/* =========================================================
 * 纸样展开（取模）：尺寸 / 映射 / 凹面 / 画布绘制
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import { Render } from "../render.js";
import { PXU, BP } from "./spec.js";

/* ---------- 绘制工具 ---------- */
export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

export function legendColor(d) {
  return (d && d.legendColor) ||
    (Render.luminance((d && d.bg) || "#e9ecf5") > 0.55 ? "#3a3d46" : "#e8eaf2");
}

/* ---------- 纸样尺寸与布局（u 单位；画布像素 = u × PXU） ----------
 * 纸样 = 把键帽沿四条折缝（顶面四缘）剪开、各壁绕自己的折缝摊平得到的纸样：
 *
 *            [   北壁   ]            北/南壁：折缝是水平边，外缘与折缝平行，
 *   [西壁][ 顶面 tw×L ][东壁]         臂高 = 折缝到裙边底缘的真实斜长
 *            [   南壁   ]            东/西壁：折缝是斜边（顶面有坡度），
 *                                    沿折缝量 a、垂直折缝量 h —— 外缘既不
 *                                    与折缝平行、臂高也沿折缝变化
 *
 * 顶面纸样纵向长 L = th / cos(倾角)（坡度方向的真实边长，不是投影长度）。
 * 画布坐标（u）：纸样包围盒左上角为原点。                          */
export function netDims(k, rowP) {
  const gap = rowP.gap, xi = rowP.xi;
  /* 前后壁分别取值（keycapProfileFor 已拆好）：后壁恒向内、前壁保持大幅内收 */
  const zB = rowP.zB != null ? rowP.zB : rowP.zi;   // 后壁内收
  const zF = rowP.zF != null ? rowP.zF : rowP.zi;   // 前壁内收
  const tw = k.w - 2 * (gap + xi);
  const th = k.h - 2 * gap - zB - zF;               // 顶面纵向（前后）边长
  const ch = rowP.h, tilt = rowP.tilt || 0;
  const tan = Math.tan(tilt), ct = Math.cos(tilt), st = Math.sin(tilt);
  const yB = ch + tan * th / 2;      // 北（后）缘高
  const yF = ch - tan * th / 2;      // 南（前）缘高
  const L = th / ct;                 // 顶面纵向真实边长
  const hN = Math.hypot(yB, zB);     // 北壁臂高（折缝→底环斜长）
  const hS = Math.hypot(yF, zF);     // 南壁臂高
  /* 东壁外缘两角：以折缝后角点为原点，沿折缝取 a、垂直折缝取 h */
  const aOf = wz => -st * (-yB) + ct * wz;
  const hOf = wz => Math.sqrt(xi * xi + yB * yB + wz * wz - aOf(wz) * aOf(wz));
  const a0 = aOf(-zB), h0 = hOf(-zB);            // 底环后缘角
  const a1 = aOf(th + zF), h1 = hOf(th + zF);    // 底环前缘角
  const hMax = Math.max(h0, h1);                 // 东/西壁最外点
  const offX = hMax, offY = hN;                  // 纸样 (0,0) 在画布中的位置
  const wU = tw + 2 * hMax, hU = hN + L + hS;
  return {
    tw, th, ch, yB, yF, xi, zB, zF, gap, ct, st, L, hN, hS, a0, a1, h0, h1,
    zBt: gap + zB,                 // 顶面后缘的局部 z（自底环后缘内收 zB）
    offX, offY,                    // 顶面纸样原点在画布中的位置
    topX: offX, topY: offY,
    wU, hU,                        // 纸样包围盒（u）
    NW: Math.max(8, Math.round(wU * PXU)),
    NH: Math.max(8, Math.round(hU * PXU))
  };
}

/* ---------- 展开映射（纸样坐标，u 单位） ----------
 * 坐标轴：x 向东（画布右）、y 向南（画布下）。
 * 顶面占 [offX, offX+tw] × [offY, offY+L]；四壁的折缝（v = 1）与顶面四缘逐点
 * 重合，底缘（v = 0）落在裙边底环上。
 * "壁面摊平"= 绕折缝旋转：到折缝的距离取真实垂距、沿折缝的位置取真实位置，
 * 因此顶面有坡度时东/西壁必然是斜的楔形。顶面凹面不参与纸样（只在 3D 里起伏），
 * 故折缝上的点按"去掉凹面"的高度展开，保证折缝两侧图案严格连续。
 * 3D 几何的 UV 与"取模预览"的纸样轮廓都由这里生成。 */
export function makeNetMap(k, dims) {
  const { ct, st, tw, L, yB, xi } = dims;
  const x2 = xi * xi;
  const bx0 = dims.gap, bx1 = k.w - dims.gap;        // 底环（裙边底缘）
  const bz0 = dims.gap, bz1 = k.h - dims.gap;
  const tx0 = bx0 + dims.xi, tx1 = bx1 - dims.xi;    // 顶环（顶面四缘）
  const tz0 = dims.zBt, tz1 = tz0 + dims.th;
  const { offX, offY, hN, hS } = dims;
  const m = {
    bx0, bx1, bz0, bz1, tx0, tx1, tz0, tz1, L,
    x: x => offX + x - tx0,               // 顶面世界 x → 纸样 x
    z: z => offY + (z - tz0) / ct,        // 顶面世界 z → 纸样 y（按坡度真实边长）
    /* 壁面角点：face 0北 1东 2南 3西；t 为壁横向坐标（北/南壁取 x，东/西壁取 z），
       v = 1 折缝（贴顶面） / v = 0 底缘 */
    wall: (face, t, v) => {
      if (face === 0) return [offX + t - tx0, v ? offY : offY - hN];
      if (face === 2) return [offX + t - tx0, v ? offY + L : offY + L + hS];
      const wz = t - tz0;                 // 底环点相对顶面后缘的 z
      /* 折缝：与顶面左右缘逐点重合（沿坡度的真实边长） */
      if (v) return [face === 1 ? offX + tw : offX, offY + wz / ct];
      const a = -st * (-yB) + ct * wz;    // 沿折缝（自折缝后角点起算）
      const h = Math.sqrt(x2 + yB * yB + wz * wz - a * a);   // 垂直折缝
      return [face === 1 ? offX + tw + h : offX - h, offY + a];
    }
  };
  /* 各面在纸样上的四边形（u，扁平数组）：顶面 + 北/东/南/西壁，
     与上面 UV 采样到的区域完全一致 */
  m.polys = () => [
    [m.x(tx0), m.z(tz0), m.x(tx1), m.z(tz0), m.x(tx1), m.z(tz1), m.x(tx0), m.z(tz1)],
    [...m.wall(0, bx0, 0), ...m.wall(0, bx1, 0), ...m.wall(0, tx1, 1), ...m.wall(0, tx0, 1)],
    [...m.wall(1, tz0, 1), ...m.wall(1, tz1, 1), ...m.wall(1, bz1, 0), ...m.wall(1, bz0, 0)],
    [...m.wall(2, tx0, 1), ...m.wall(2, tx1, 1), ...m.wall(2, bx1, 0), ...m.wall(2, bx0, 0)],
    [...m.wall(3, tz0, 1), ...m.wall(3, tz1, 1), ...m.wall(3, bz1, 0), ...m.wall(3, bz0, 0)]
  ];
  return m;
}

/* ---------- 纸样（取模预览用）：展开尺寸 + 各面轮廓 ---------- */
export function netOutline(k, rowP) {
  const dims = netDims(k, rowP);
  return { dims, polys: makeNetMap(k, dims).polys() };
}

/* ---------- 顶面凹面（KeyV2 dish） ----------
 * 返回 (dx, dz) → 凹陷量（≤0，u 单位），dx/dz 为距顶面中心的偏移 */
export function makeDish(dish, tw, th) {
  if (!dish || !(dish.depth > 0)) return null;
  const d = dish.depth;
  if (dish.type === "sph") {
    /* 球面：以顶面对角线为弦的球冠，中心最深、四角恰好落在原平面，沿径向单调回升 */
    const hc = Math.hypot(tw, th) / 2;            // 半对角线（弦半径）
    const rad = (hc * hc + d * d) / (2 * d);      // 球半径（弦 2hc、矢高 d）
    const drop = rad - d;                         // 球心到原平面距离
    return (dx, dz) => {
      const r2 = dx * dx + dz * dz;
      return r2 >= hc * hc ? 0 : drop - Math.sqrt(rad * rad - r2);
    };
  }
  /* 圆柱：圆弧以顶面宽度为弦，前后方向等深；左右边缘贴合、中间最深 */
  const hw = tw / 2;
  const rad = (tw * tw + 4 * d * d) / (8 * d);   // 圆弧半径（弦宽 tw、矢高 d）
  const drop = rad - d;                          // 圆心到原平面的距离
  return dx => {
    const ax = Math.abs(dx);
    return ax >= hw ? 0 : drop - Math.sqrt(rad * rad - ax * ax);
  };
}

/* ---------- 展开图绘制（唯一的纹理内容来源） ----------
 * 底色铺满 → 底面色条 → 图片（顶面 cover / 十字包裹）→ 顶面图例与光影 */
export function drawNetCanvas(cv, dims, d, k, getImg) {
  const { NW, NH } = dims;
  if (cv.width !== NW || cv.height !== NH + BP) { cv.width = NW; cv.height = NH + BP; }
  const g = cv.getContext("2d");
  const bg = (d && d.bg) || "#e9ecf5";

  g.clearRect(0, 0, NW, NH + BP);
  g.fillStyle = bg;
  g.fillRect(0, 0, NW, NH + BP);
  g.fillStyle = Render.shade(bg, -12);          // 底面（帽身同色，只压一点点暗）
  g.fillRect(0, NH, NW, BP);

  const S = PXU;
  /* 顶面在纸样画布中的矩形：图片/图例/光影都以它为基准 */
  const tx = dims.topX * S, ty = dims.topY * S, tw = dims.tw * S, th = dims.L * S;

  /* 图片：cover 以顶面纸样矩形为基准；wrap=net 时不裁剪，越出部分自然包住四壁 */
  const img = d && d.img && d.img.data ? getImg(d.img.data) : null;
  if (img && img.complete && img.naturalWidth > 0) {
    const wrapNet = d.img.wrap === "net";
    const s = Math.max(tw / img.naturalWidth, th / img.naturalHeight) * (d.img.scale || 1);
    g.save();
    if (!wrapNet) { roundRect(g, tx, ty, tw, th, 0.10 * PXU); g.clip(); }
    g.translate(tx + tw / 2 + (d.img.ox || 0) * tw, ty + th / 2 + (d.img.oy || 0) * th);
    g.rotate((d.img.rot || 0) * Math.PI / 180);
    g.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2,
      img.naturalWidth * s, img.naturalHeight * s);
    g.restore();
  }

  /* 顶面图例 + 冠部光影（仅顶面区域） */
  g.save();
  roundRect(g, tx, ty, tw, th, 0.10 * PXU);
  g.clip();
  const legend = d && d.legend != null ? d.legend : k.label;
  if (legend) {
    const fs = Math.min(th * 0.36 * ((d && d.legendSize) || 1), 0.28 * PXU);
    g.fillStyle = legendColor(d);
    g.font = `600 ${Math.max(8, fs)}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "top";
    const pad = Math.min(tw, th) * 0.11;
    g.fillText(legend, tx + pad, ty + pad * 0.9);
  }
  const gr = g.createLinearGradient(0, ty, 0, ty + th);
  gr.addColorStop(0, "rgba(255,255,255,0.13)");
  gr.addColorStop(0.55, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.07)");
  g.fillStyle = gr;
  g.fillRect(tx, ty, tw, th);
  g.restore();
}
