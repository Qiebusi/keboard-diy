/* =========================================================
 * 3D 键盘预览（Three.js / WebGL，UMD 全局 THREE）
 *
 * 架构（对齐轻量渲染器的设计）：
 *   每颗键帽 = 1 份几何 + 1 张纹理 + 1 个材质 + 1 次 draw call
 *
 * 核心设计：十字展开图即纹理图集。
 *   每键一张"展开图画布"（顶面 + 四壁 + 底面色条），
 *   几何 UV 直接映射到展开图各区域——折叠翻转/转置全部在 UV 中完成，
 *   不存在侧壁纹理、材质数组、分组切换。
 *   - 未包裹模式：图片只画进顶面区域，四壁为纯底色
 *   - 十字包裹模式：图片铺满整张展开图，自然延续到四壁
 *
 * 性能约定：
 *   - 按需渲染（脏标记），静止零 GPU 开销
 *   - 阴影贴图仅在场景几何变化时烘焙
 *   - 轴体使用 InstancedMesh（整盘共 3 次 draw call）
 *   - 键帽/底板矩阵冻结（静态物件）
 * ========================================================= */

(() => {
if (!window.THREE) {
  console.warn("[KeycapStudio] three.min.js 未加载，3D 预览不可用");
  return;
}

const PXU = 200;           // 纹理分辨率（px / u）
const FOV = 40;
const FLOAT = 0.34;        // 裙边底部离底板高度（露出轴体上座）
const BP = 6;              // 展开图画布底部预留色条高度（底面采样区，px）
const STEM = new THREE.Color(0x17181d);   // 轴体颜色
const ACCENT = new THREE.Color(0xd9480f); // 选中强调色

/* 键帽纹理：禁 mipmap + 线性过滤（NPOT 画布必需；mipmap 会采样到陈旧链层） */
function makeCapTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

let _studioEnv = null;
/* 程序化工作室环境贴图：柔和顶光 + 两侧灯带，供 PBR 材质反射 */
function makeStudioEnv() {
  if (_studioEnv) return _studioEnv;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#d8dee8");
  grad.addColorStop(0.45, "#70747c");
  grad.addColorStop(1, "#23252a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(28, 16, 195, 62);
  g.fillRect(298, 24, 172, 54);
  g.fillStyle = "rgba(255,240,220,0.5)";
  g.fillRect(180, 92, 210, 30);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.encoding = THREE.sRGBEncoding;
  _studioEnv = t;
  return t;
}

/* ---------- 绘制工具 ---------- */
function roundRect(g, x, y, w, h, r) {
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

function legendColor(d) {
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
function netDims(k, rowP) {
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
function makeNetMap(k, dims) {
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
function netOutline(k, rowP) {
  const dims = netDims(k, rowP);
  return { dims, polys: makeNetMap(k, dims).polys() };
}

/* ---------- 顶面凹面（KeyV2 dish） ----------
 * 返回 (dx, dz) → 凹陷量（≤0，u 单位），dx/dz 为距顶面中心的偏移 */
function makeDish(dish, tw, th) {
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
function drawNetCanvas(cv, dims, d, k, getImg) {
  const { NW, NH } = dims;
  if (cv.width !== NW || cv.height !== NH + BP) { cv.width = NW; cv.height = NH + BP; }
  const g = cv.getContext("2d");
  const bg = (d && d.bg) || "#e9ecf5";

  g.clearRect(0, 0, NW, NH + BP);
  g.fillStyle = bg;
  g.fillRect(0, 0, NW, NH + BP);
  g.fillStyle = Render.shade(bg, -58);          // 底面（深一档）
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

/* ---------- 键帽几何（单段直斜裙边 + 锥度 + 分排倾角 + 顶面凹面） ----------
 * 横截面按真实键帽：底环内缩 gap，顶面再按 xi（左右）/ zB（后壁）/ zF（前壁）内缩
 *   —— 四壁全部向里收分，后壁近垂直（zB 小）、前壁大幅内收（zF 大），绝不外扩
 * 裙边自底环一条直线直达顶环，不在中途折出台阶
 * 顶面与四壁上缘共用同一凹面函数，网格在折缝处闭合
 * UV 直接映射到纸样画布：
 *   顶面 → 顶面矩形；四壁 → 各自绕折缝摊平后的四边形（东/西壁因顶面坡度是斜楔形）；
 *   底面 → 画布底部色条
 * 壁面 UV 约定：t 沿壁横向（北/南为 x，东/西为 z），
 *               v=0 底缘 / v=1 折缝（与顶面相邻）                    */
function capGeometry(k, params, dims) {
  const ch = params.h;
  const tw = dims.tw, th = dims.th;
  const pos = [], uvs = [];
  const S = PXU;
  const U = px => px / dims.NW;
  const V = py => 1 - py / (dims.NH + BP);

  /* 两个环：底环（y=0，内缩 gap）→ 顶环（内缩 xi/zB/zF，高度由倾角与凹面决定）
     环尺寸取自展开映射，与取模预览共用同一份定义 */
  const nm = makeNetMap(k, dims);
  const bx0 = nm.bx0, bx1 = nm.bx1, bz0 = nm.bz0, bz1 = nm.bz1;
  const tx0 = nm.tx0, tx1 = nm.tx1, tz0 = nm.tz0, tz1 = nm.tz1;
  const xc = (tx0 + tx1) / 2, zc = (tz0 + tz1) / 2;
  const tan = Math.tan(params.tilt || 0);
  const dish = makeDish(params.dish, tw, th);
  /* 顶面高度：分排倾角（绕顶面中心）+ 凹面下凹量 */
  const topY = (x, z) => {
    const y = ch + tan * (zc - z);
    return dish ? y + dish(x - xc, z - zc) : y;
  };
  const lerp = (a, b, s) => a + (b - a) * s;
  const NX = Math.max(4, Math.min(48, Math.round(tw * 20)));
  const NZ = Math.max(4, Math.min(48, Math.round(th * 20)));

  /* 四壁 UV：face 0北 1东 2南 3西（映射与纸样轮廓同源，折缝两侧图案连续） */
  const wUV = (face, t, v) => {
    const p = nm.wall(face, t, v);
    return [U(p[0] * S), V(p[1] * S)];
  };
  const tUV = (x, z) =>        // 顶面：后缘（z = tz0）为纹理上缘
    [U(nm.x(x) * S), V(nm.z(z) * S)];
  const bUV = [U(1), V(dims.NH + BP / 2)];

  function quad(n, a, b, c, d, ua, ub, uc, ud) {
    /* 自动修正绕向，使面法线与 n 同向 */
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
      [b, d] = [d, b];
      [ub, ud] = [ud, ub];
    }
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    pos.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    uvs.push(ua[0], ua[1], uc[0], uc[1], ud[0], ud[1]);
  }

  /* 北 / 南壁（壁高 yB / yF）：底环 → 顶环单段直斜，顶缘跟随凹面起伏 */
  for (let i = 0; i < NX; i++) {
    const s0 = i / NX, s1 = (i + 1) / NX;
    const xa0 = lerp(bx0, bx1, s0), xa1 = lerp(bx0, bx1, s1);
    const xt0 = lerp(tx0, tx1, s0), xt1 = lerp(tx0, tx1, s1);

    quad([0, 0, -1], [xa0, 0, bz0], [xa1, 0, bz0],
      [xt1, topY(xt1, tz0), tz0], [xt0, topY(xt0, tz0), tz0],
      wUV(0, xa0, 0), wUV(0, xa1, 0), wUV(0, xt1, 1), wUV(0, xt0, 1));

    quad([0, 0, 1], [xa0, 0, bz1], [xa1, 0, bz1],
      [xt1, topY(xt1, tz1), tz1], [xt0, topY(xt0, tz1), tz1],
      wUV(2, xa0, 0), wUV(2, xa1, 0), wUV(2, xt1, 1), wUV(2, xt0, 1));
  }

  /* 东 / 西壁（壁高 ch）：底环 → 顶环单段直斜，顶缘沿 z 跟随倾角与凹面
      （圆柱凹面在左右边缘为 0，球面凹面在中段仍下凹，故同样按 z 取样） */
  for (let i = 0; i < NZ; i++) {
    const s0 = i / NZ, s1 = (i + 1) / NZ;
    const za0 = lerp(bz0, bz1, s0), za1 = lerp(bz0, bz1, s1);
    const zt0 = lerp(tz0, tz1, s0), zt1 = lerp(tz0, tz1, s1);

    quad([1, 0, 0], [bx1, 0, za0], [bx1, 0, za1],
      [tx1, topY(tx1, zt1), zt1], [tx1, topY(tx1, zt0), zt0],
      wUV(1, za0, 0), wUV(1, za1, 0), wUV(1, zt1, 1), wUV(1, zt0, 1));

    quad([-1, 0, 0], [bx0, 0, za0], [bx0, 0, za1],
      [tx0, topY(tx0, zt1), zt1], [tx0, topY(tx0, zt0), zt0],
      wUV(3, za0, 0), wUV(3, za1, 0), wUV(3, zt1, 1), wUV(3, zt0, 1));
  }

  /* 底面（防止低角度看穿裙边） */
  quad([0, -1, 0], [bx0, 0, bz0], [bx0, 0, bz1], [bx1, 0, bz1], [bx1, 0, bz0], bUV, bUV, bUV, bUV);

  /* 顶面：网格化以承载凹面（圆柱 / 球面） */
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const xa = lerp(tx0, tx1, i / NX), xb = lerp(tx0, tx1, (i + 1) / NX);
    const za = lerp(tz0, tz1, j / NZ), zb = lerp(tz0, tz1, (j + 1) / NZ);
    quad([0, 1, 0],
      [xa, topY(xa, za), za], [xb, topY(xb, za), za], [xb, topY(xb, zb), zb], [xa, topY(xa, zb), zb],
      tUV(xa, za), tUV(xb, za), tUV(xb, zb), tUV(xa, zb));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/* ---------- 通用视图 ---------- */
class View {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.single = !!opts.single;
    this.getImg = opts.getImg || (() => null);
    this.onPick = opts.onPick || null;
    this.onDoubleClick = opts.onDoubleClick || null;
    this.active = false;
    this.autorotate = this.single;
    this._idleUntil = 0;
    this.plateColor = "#23252f";
    this.profile = "oem";
    this._hasFRow = false;

    this.orbit = { yaw: 0.55, elev: 0.88, zoom: 1 };

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false
    });
    this.renderer.setClearColor(0xedeae3, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;   // 仅场景几何变化时烘焙
    this._needsRender = true;                     // 按需渲染脏标记

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

    /* 灯光：主光（左前上，投射阴影）+ 冷补光（右后）+ 顶部逆光 + 环境光 */
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    const key = new THREE.DirectionalLight(0xfff1de, 1.15);
    key.position.set(-6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.32);
    fill.position.set(7, 4, -6);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(0, 10, -3);
    this.scene.add(amb, key, fill, rim);
    this.scene.environment = makeStudioEnv();

    this.keys = [];
    this.designs = {};
    this._group = new THREE.Group();
    this.scene.add(this._group);
    this.caps = [];
    this.capMeshes = [];
    this._stems = [];                // 轴体实例化网格（3 次 draw call）
    this._m4 = new THREE.Matrix4();
    this._plate = null;
    this._targetKey = null;
    this._targetDesign = null;
    this._singleCap = null;
    this._singlePlate = null;
    this._raycaster = new THREE.Raycaster();
    this.selected = -1;

    /* 共享轴体几何/材质 */
    this._stemMat = new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.5, metalness: 0.15 });
    this._housingGeo = new THREE.BoxGeometry(0.52, 0.3, 0.52);
    this._stemGeoA = new THREE.BoxGeometry(0.13, 0.09, 0.42);
    this._stemGeoB = new THREE.BoxGeometry(0.42, 0.09, 0.13);

    this._bindPointer();
    /* 渲染循环必须免疫单帧异常：抛错时仍继续调度 rAF，否则画面永久冻结 */
    const loop = () => {
      if (this.active) {
        try { this._frame(); } catch (e) { console.error("[3D] render:", e && e.message, e); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ----- 场景构建 ----- */
  setScene(keys, designs, plateColor, profile) {
    this._clearCaps();
    this._clearStems();
    this.keys = keys;
    this.designs = designs;
    this.plateColor = plateColor;
    this.profile = profile || "oem";
    const bounds = layoutBounds(keys);
    this._hasFRow = bounds.H >= 5.9;
    this.W = bounds.W; this.H = bounds.H;

    /* 底板：铝质定位板（接收键帽阴影） */
    if (this._plate) {
      this._group.remove(this._plate);
      this._plate.geometry.dispose();
      this._plate.material.dispose();
    }
    const pm = 0.35;
    this._plate = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.W + 2 * pm, 0.42, bounds.H + 2 * pm),
      new THREE.MeshStandardMaterial({
        color: plateColor, roughness: 0.28, metalness: 0.6,
        envMap: makeStudioEnv(), envMapIntensity: 0.85
      }));
    this._plate.receiveShadow = true;
    this._plate.position.set(bounds.W / 2, -0.21, bounds.H / 2);
    this._plate.updateMatrix();
    this._plate.matrixAutoUpdate = false;
    this._group.add(this._plate);

    keys.forEach((k, i) => this._buildCap(k, designs[i], i, k.x, k.y, false));
    this._buildStems(keys);
    this._needsRender = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /* ----- 键帽构建：1 几何 + 1 材质 + 1 纹理 ----- */
  _buildCap(k, d, index, px, py, single, rowParams) {
    const rowP = rowParams || keycapProfileFor(k, this._hasFRow, this.profile);
    const dims = netDims(k, rowP);

    const canvas = document.createElement("canvas");
    canvas.width = dims.NW; canvas.height = dims.NH + BP;
    drawNetCanvas(canvas, dims, d, k, this.getImg);

    const tex = makeCapTexture(canvas);
    /* 单材质：顶面/四壁共用展开图纹理；透明用于顶面圆角 */
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.35, metalness: 0.05,
      envMap: makeStudioEnv(), envMapIntensity: 0.6
    });

    const mesh = new THREE.Mesh(capGeometry(k, rowP, dims), mat);
    mesh.position.set(px, FLOAT, py);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;   // 静态物件：冻结世界矩阵
    mesh.userData.index = single ? -1 : index;
    this._group.add(mesh);

    /* 轴体上座 + 十字轴心：仅单键模式独立创建（整盘走 InstancedMesh） */
    let housing = null, stemA = null, stemB = null;
    if (single) {
      housing = new THREE.Mesh(this._housingGeo, this._stemMat);
      housing.position.set(px + k.w / 2, 0.17, py + k.h / 2);
      stemA = new THREE.Mesh(this._stemGeoA, this._stemMat);
      stemA.position.set(px + k.w / 2, 0.36, py + k.h / 2);
      stemB = new THREE.Mesh(this._stemGeoB, this._stemMat);
      stemB.position.set(px + k.w / 2, 0.36, py + k.h / 2);
      this._group.add(housing, stemA, stemB);
    }

    const cap = {
      mesh, mat, tex, canvas, dims, k, index,
      d: d || null,
      v: -1, wrapState: null,        // 纹理内容版本 / 包裹状态
      housing, stemA, stemB
    };
    this.caps.push(cap);
    this.capMeshes.push(mesh);
    if (single) {
      /* 单键视图：不进入整盘拾取/刷新列表，由 _singleCap 单独管理 */
      this.caps.pop();
      this.capMeshes.pop();
    }
    return cap;
  }

  /* 轴体实例化：上座 + 双向十字轴心，各 1 次 draw call */
  _buildStems(keys) {
    const mk = (geo, y) => {
      const im = new THREE.InstancedMesh(geo, this._stemMat, keys.length);
      keys.forEach((k, i) => {
        this._m4.makeTranslation(k.x + k.w / 2, y, k.y + k.h / 2);
        im.setMatrixAt(i, this._m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      im.matrixAutoUpdate = false;
      im.frustumCulled = false;      // 实例包围球不含实例位移
      this._group.add(im);
      this._stems.push(im);
    };
    mk(this._housingGeo, 0.17);
    mk(this._stemGeoA, 0.36);
    mk(this._stemGeoB, 0.36);
  }

  _clearStems() {
    for (const im of this._stems) {
      this._group.remove(im);
      im.dispose();                  // 仅释放实例矩阵缓冲（几何/材质共享）
    }
    this._stems = [];
  }

  setPlateColor(c) {
    this.plateColor = c;
    if (this._plate) this._plate.material.color.set(c);
    this._needsRender = true;
  }

  /* 视口背景色（跟随界面主题） */
  setClearColor(c) {
    this.renderer.setClearColor(new THREE.Color(c), 1);
    this._needsRender = true;
  }

  setSelected(i) {
    this.selected = i;
    this._applyTint();
    this._needsRender = true;
  }

  /* 选中高亮：整帽向强调色着色（材质色与纹理相乘） */
  _applyTint() {
    const apply = c => {
      const sel = !this.single && c.index === this.selected;
      c.mat.color.set(0xffffff);
      if (sel) c.mat.color.lerp(ACCENT, 0.45);
    };
    for (const c of this.caps) apply(c);
    if (this._singleCap) apply(this._singleCap);
  }

  setActive(a) { this.active = !!a; }

  /* ----- 单键模式 ----- */
  setTarget(k, d, rowParams) {
    this._targetKey = k;
    this._targetDesign = d;
    if (this._singleCap) { this._removeCap(this._singleCap); this._singleCap = null; }
    if (this._singlePlate) {
      this.scene.remove(this._singlePlate);
      this._singlePlate.geometry.dispose();
      this._singlePlate.material.dispose();
      this._singlePlate = null;
    }
    if (!k) return;

    const pm = 0.55;
    this._singlePlate = new THREE.Mesh(
      new THREE.BoxGeometry(k.w + 2 * pm, 0.42, k.h + 2 * pm),
      new THREE.MeshStandardMaterial({
        color: this.plateColor, roughness: 0.28, metalness: 0.6,
        envMap: makeStudioEnv(), envMapIntensity: 0.85
      }));
    this._singlePlate.receiveShadow = true;
    this._singlePlate.position.set(k.w / 2, -0.21, k.h / 2);
    this._singlePlate.updateMatrix();
    this._singlePlate.matrixAutoUpdate = false;
    this.scene.add(this._singlePlate);

    this._singleCap = this._buildCap(k, d, 0, 0, 0, true, rowParams);
    this._needsRender = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  _removeCap(c) {
    this._group.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mat.dispose();
    c.tex.dispose();
    [c.housing, c.stemA, c.stemB].forEach(m => { if (m) this._group.remove(m); });
  }

  _clearCaps() {
    for (const c of this.caps) this._removeCap(c);
    this.caps = [];
    this.capMeshes = [];
  }

  /* ----- 纹理刷新（每帧按需；返回是否有变更） ----- */
  _refreshCaps() {
    let changed = false;
    if (this.single) {
      if (this._singleCap) { this._singleCap.d = this._targetDesign; changed = this._refreshOne(this._singleCap); }
    } else {
      for (const c of this.caps) {
        c.d = this.designs[c.index];
        if (this._refreshOne(c)) changed = true;
      }
    }
    if (this._plate && this._plate.material.color.getHexString() !==
        this.plateColor.replace("#", "").toLowerCase()) {
      this._plate.material.color.set(this.plateColor);
      changed = true;
    }
    return changed;
  }

  _refreshOne(c) {
    const d = c.d;
    if (!d) return false;
    const img = d.img ? this.getImg(d.img.data) : null;
    /* 图片加载中：保持当前画面，加载完成后的帧自动重绘 */
    if (d.img && !(img && img.complete && img.naturalWidth > 0)) return false;

    let changed = false;
    if (d.v !== c.v) {
      drawNetCanvas(c.canvas, c.dims, d, c.k, this.getImg);
      const wrapNet = !!(d.img && d.img.wrap === "net");
      if (wrapNet !== c.wrapState) {
        /* 切换包裹状态时换新纹理对象：规避个别环境对同一 CanvasTexture
         * 反复上传时的 GPU 残留（旧帧叠加） */
        c.tex.dispose();
        c.tex = makeCapTexture(c.canvas);
        c.mat.map = c.tex;
        c.mat.needsUpdate = true;
      } else {
        c.tex.needsUpdate = true;
      }
      c.v = d.v;
      c.wrapState = wrapNet;
      changed = true;
    }
    return changed;
  }

  /* ----- 取模预览：当前键帽的十字展开图与布局 ----- */
  getNetCanvas() {
    const c = this.single ? this._singleCap : this.caps[this.selected];
    return (c && c.canvas.width > 8) ? c.canvas : null;
  }

  getNetLayout() {
    const c = this.single ? this._singleCap : this.caps[this.selected];
    if (!c) return null;
    const d = c.dims;
    return { px: PXU, L: d.L * PXU, kh: c.k.h * PXU, topX: d.topX * PXU, topY: d.topY * PXU, topW: d.tw * PXU, topH: d.L * PXU };
  }

  /* 像素比上限 1.75：高 DPI 下填充率减半，肉眼无感差异 */
  _dpr() {
    return Math.min(window.devicePixelRatio || 1, 1.75);
  }

  _updateCamera() {
    let resized = false;
    const cw = this.canvas.clientWidth, chh = this.canvas.clientHeight;
    if (cw > 4 && chh > 4) {
      const dpr = this._dpr();
      if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(chh * dpr)) {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(cw, chh, false);
        this.camera.aspect = cw / chh;
        this.camera.updateProjectionMatrix();
        resized = true;
      }
    }

    let target, radius;
    if (this.single) {
      const k = this._targetKey;
      if (!k) return resized;
      target = new THREE.Vector3(k.w / 2, FLOAT + 0.15, k.h / 2);
      radius = 0.62 * Math.hypot(k.w, k.h) + 0.9;
    } else {
      target = new THREE.Vector3(this.W / 2, FLOAT, this.H / 2);
      radius = 0.62 * Math.hypot(this.W, this.H) + 1.2;
    }
    const dist = radius / (Math.tan((FOV * Math.PI / 180) / 2) * Math.min(1, this.camera.aspect)) * 0.8 / this.orbit.zoom;
    const { yaw, elev } = this.orbit;
    this.camera.position.set(
      target.x + dist * Math.sin(yaw) * Math.cos(elev),
      target.y + dist * Math.sin(elev),
      target.z + dist * Math.cos(yaw) * Math.cos(elev)
    );
    this.camera.lookAt(target);
    return resized;
  }

  _frame() {
    if (this.single && !this._targetKey) return;
    const spinning = this.autorotate && !this._dragging && Date.now() > this._idleUntil;
    let contentDirty = false;
    if (spinning) { this.orbit.yaw += 0.006; this._needsRender = true; }
    if (this._refreshCaps()) { this._needsRender = true; contentDirty = true; }
    if (this._updateCamera()) { this._needsRender = true; contentDirty = true; }
    if (!this._needsRender) return;            // 静止帧：跳过渲染
    if (!contentDirty && performance.now() - (this._lastSpinRender || 0) < 40) {
      return;                                  // 仅自动旋转的脏帧限流 ~25fps
    }
    this._needsRender = false;
    if (!contentDirty) this._lastSpinRender = performance.now();
    this.renderer.render(this.scene, this.camera);
  }

  /* ----- 交互 ----- */
  _bindPointer() {
    const cv = this.canvas;
    let down = null;
    cv.style.cursor = "grab";
    cv.addEventListener("pointerdown", e => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      this._dragging = true;
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = "grabbing";
    });
    cv.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
      if (down.moved) {
        this.orbit.yaw -= dx * 0.005;
        /* 俯仰几乎全放开：可绕到地平线以下看底面，也可压到接近正俯视。
           只留 ±1.5rad（≈±86°）防止 camera.up 与视线共线导致 lookAt 退化 */
        this.orbit.elev = Math.max(-1.5, Math.min(1.5, this.orbit.elev + dy * 0.005));
        this._idleUntil = Date.now() + 2400;
        this._needsRender = true;
        down.x = e.clientX; down.y = e.clientY;
      }
    });
    cv.addEventListener("pointerup", e => {
      this._dragging = false;
      cv.style.cursor = "grab";
      if (down && !down.moved && this.onPick) {
        this.onPick(this.pickAt(e.clientX, e.clientY));
      }
      down = null;
    });
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      this.orbit.zoom = Math.max(0.5, Math.min(2.5, this.orbit.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      this._idleUntil = Date.now() + 2400;
      this._needsRender = true;
    }, { passive: false });
    cv.addEventListener("dblclick", e => {
      if (this.onDoubleClick) this.onDoubleClick(this.pickAt(e.clientX, e.clientY));
    });
  }

  pickAt(clientX, clientY) {
    if (!this.capMeshes.length) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this.capMeshes, false);
    return hits.length ? hits[0].object.userData.index : null;
  }

  /* ----- 高清导出 ----- */
  snapshot(scale = 2) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w * scale, h * scale, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._refreshCaps();
    this._updateCamera();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/png");
    this.renderer.setPixelRatio(this._dpr());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    return url;
  }
}

/* ---------- 对外 API ---------- */
function createBoardView(canvas, opts = {}) {
  return new View(canvas, { ...opts, single: false });
}

function createSingleView(canvas, opts = {}) {
  const v = new View(canvas, { ...opts, single: true });
  v.autorotate = true;
  v.setActive(true);
  return v;
}

window.Preview3D = { createBoardView, createSingleView, netDims, netOutline };
})();
