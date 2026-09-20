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

/* 真实 MX 轴体 / 定位板尺寸（mm → u，1u = 19.05mm）：
   定位板上表面定在 y = 0；上盖 9.9×5.5、法兰填满 14mm 开孔、
   十字外包 4.1mm、臂厚 1.17mm（Cherry 规格 14±0.05 / 4.1+0.05） */
const MX = {
  hole: 14.0 / 19.05,     // 定位板开孔
  plateT: 1.5 / 19.05,    // 定位板厚
  flange: 13.9 / 19.05,   // 穿过开孔的法兰（单边留 0.05 间隙）
  upperW: 9.9 / 19.05,    // 上盖宽
  upperH: 5.5 / 19.05,    // 上盖高（板面以上）
  cross: 4.1 / 19.05,     // 十字外包尺寸
  arm: 1.17 / 19.05,      // 十字臂厚
  crossH: 3.0 / 19.05     // 十字露出高度
};
const MX_Y = {            // 轴体各件中心高度（u）—— 下壳中心见下方 LOWER_H
  housing: MX.upperH / 2,
  stem: MX.upperH + MX.crossH / 2
};
/* 其余底盘件的参考尺寸（mm → u）：
   PCB 厚 1.6（FR4 标准）、定位板下沿到 PCB 面 5.0（常见设计值）；
   卫星轴距轴心 11.938（Cherry 规格）、钢丝 Ø1.6、定位板过孔按轴心 4.1 单边留 0.45；
   热插拔轴座 ≈10.5×5.5×3.2（卧贴常见体型，按简化体建）；
   USB-C 插座口 8.34×2.56（USB 规范）、面板开孔常用 9.0×3.3；
   脚垫 20×10×2、脚撑两级 7°/0° —— 取自开源套件 PH60（ph-design/PH60）的 BOM。 */
const REF = {
  pcbT: 1.6 / 19.05,
  pcbGap: 5.0 / 19.05,
  socket: [10.5 / 19.05, 5.5 / 19.05, 3.2 / 19.05],
  stabX: 11.938 / 19.05,
  stabHole: 5.0 / 19.05,
  wire: 1.6 / 19.05,
  /* USB-C 母座：外形 8.94×3.16（圆角 R1.5）、口内 8.34×2.56、
     舌片厚 0.65、插入深度 6.65 —— 取自连接器厂商规格表 */
  usbShell: [8.94 / 19.05, 3.16 / 19.05, 1.5 / 19.05],
  usbMouth: [8.34 / 19.05, 2.56 / 19.05, 1.2 / 19.05],
  usbTongue: [6.5 / 19.05, 0.65 / 19.05]
};
const PCB_Y = -(MX.plateT + REF.pcbGap);   // PCB 上表面（板面下 6.5mm）
const LOWER_H = -PCB_Y;                    // 轴体下壳高（板下沿 → PCB 面，6.5mm）
MX_Y.flange = -LOWER_H / 2;                // 轴体下壳中心
const CASE_BOT = -0.72;                    // 下壳底面（要容下 PCB + 轴座）
const CASE_LIP = 8.0 / 19.05;              // 上盖高出板面的量（高边框：键帽下半截落在里面）
const CASE_R = 0.16;                       // 外壳四角圆角（≈3mm）
const SEAM = 0.02;                         // 上/下壳分模线的错台量
const TOP_BOT = -0.157;                    // 上盖底面（分模线位置，板面下 3mm）
const INNER_GAP = 1.2 / 19.05;             // 键位区到外壳内壁的间隙
const PLATE_PM = 3.6 / 19.05;              // 定位板外扩量（要小于下壳内腔半径 3.9mm）
const PLATE_SLOT = PLATE_PM + 0.1 / 19.05; // 定位板在壳里那圈卡槽的内口（比板大 0.1）
const WALL_T = 2.4 / 19.05;                // 下壳壁厚
const PCUT = [9.2 / 19.05, 3.4 / 19.05, 1.7 / 19.05];  // 后壁 USB-C 开孔（母座 8.94×3.16 留 0.13 单边）
const CASE_ANG = 6 * Math.PI / 180;        // 外壳底面斜坡角度（后面高，键帽面保持水平）
const CASE_K = Math.tan(CASE_ANG);         // 位移系数：正号 = 后面（小 z）压低 → 后面更高

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
function capGeometry(k, params, dims, withSocket) {
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

  /* ---------- 内壳：真键帽是空腔壳体，顶/壁/底缘都有厚度 ---------- */
  const WT = 1.5 / 19.05;                       // 侧壁厚（ABS 行业标准 1.5mm）
  const TT = 1.5 / 19.05;                       // 顶面厚
  const ix0 = bx0 + WT, ix1 = bx1 - WT, iz0 = bz0 + WT, iz1 = bz1 - WT;     // 内腔底环
  const itx0 = tx0 + WT, itx1 = tx1 - WT, itz0 = tz0 + WT, itz1 = tz1 - WT; // 内顶环

  /* 底缘（帽壁断面）：外底环 → 内腔底环 */
  quad([0, -1, 0], [bx0, 0, bz0], [bx0, 0, bz1], [ix0, 0, iz1], [ix0, 0, iz0], bUV, bUV, bUV, bUV);
  quad([0, -1, 0], [ix1, 0, iz0], [ix1, 0, iz1], [bx1, 0, bz1], [bx1, 0, bz0], bUV, bUV, bUV, bUV);
  quad([0, -1, 0], [ix0, 0, iz0], [ix1, 0, iz0], [bx1, 0, bz0], [bx0, 0, bz0], bUV, bUV, bUV, bUV);
  quad([0, -1, 0], [bx0, 0, bz1], [bx1, 0, bz1], [ix1, 0, iz1], [ix0, 0, iz1], bUV, bUV, bUV, bUV);

  /* 内壁：外壁四片向腔内缩进 WT，上缘接内顶 */
  for (let i = 0; i < NX; i++) {
    const s0 = i / NX, s1 = (i + 1) / NX;
    const xa0 = lerp(ix0, ix1, s0), xa1 = lerp(ix0, ix1, s1);
    const xt0 = lerp(itx0, itx1, s0), xt1 = lerp(itx0, itx1, s1);
    quad([0, 0, 1], [xa0, 0, iz0], [xa1, 0, iz0],
      [xt1, topY(xt1, itz0) - TT, itz0], [xt0, topY(xt0, itz0) - TT, itz0], bUV, bUV, bUV, bUV);
    quad([0, 0, -1], [xa0, 0, iz1], [xa1, 0, iz1],
      [xt1, topY(xt1, itz1) - TT, itz1], [xt0, topY(xt0, itz1) - TT, itz1], bUV, bUV, bUV, bUV);
  }
  for (let i = 0; i < NZ; i++) {
    const s0 = i / NZ, s1 = (i + 1) / NZ;
    const za0 = lerp(iz0, iz1, s0), za1 = lerp(iz0, iz1, s1);
    const zt0 = lerp(itz0, itz1, s0), zt1 = lerp(itz0, itz1, s1);
    quad([1, 0, 0], [ix0, 0, za0], [ix0, 0, za1],
      [itx0, topY(itx0, zt1) - TT, zt1], [itx0, topY(itx0, zt0) - TT, zt0], bUV, bUV, bUV, bUV);
    quad([-1, 0, 0], [ix1, 0, za0], [ix1, 0, za1],
      [itx1, topY(itx1, zt1) - TT, zt1], [itx1, topY(itx1, zt0) - TT, zt0], bUV, bUV, bUV, bUV);
  }

  /* 内顶：外顶网格整体下移 TT（腔体天花，法线朝下） */
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const xa = lerp(itx0, itx1, i / NX), xb = lerp(itx0, itx1, (i + 1) / NX);
    const za = lerp(itz0, itz1, j / NZ), zb = lerp(itz0, itz1, (j + 1) / NZ);
    quad([0, -1, 0],
      [xa, topY(xa, za) - TT, za], [xb, topY(xb, za) - TT, za],
      [xb, topY(xb, zb) - TT, zb], [xa, topY(xa, zb) - TT, zb],
      bUV, bUV, bUV, bUV);
  }

  /* ---------- 轴心柱 + 十字插槽（底部可见；整盘视图里看不见，跳过） ----------
   * 真实键帽轴心柱不止一个：窄键只有中心 1 个；大键按卫星轴位置加副轴柱；
   * 空格键（≥6u）是中心 + 左右各 1 个，距中心 2u（19.05×2 = 38.1mm）。 */
  const bossRanges = [];
  if (withSocket) {
    const BR = 2.75 / 19.05;                    // 轴心柱半径（Ø5.5，常见值，未查到权威数据）
    const SL = 2.05 / 19.05;                    // 十字臂半长（全长 4.1⁺⁰·⁰⁵，Deskthority wiki / SP 4.04）
    const SW = 0.585 / 19.05;                   // 十字臂半宽（1.17±0.02，SP 1.19）
    const SD = 5.0 / 19.05;                     // 插槽深（轴心十字高约 5mm）
    const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
    const mounts = [[0, 0]];
    /* 副轴柱与定位板/卫星轴同源：2u–6u 大键 ±11.938mm，空格按键长取值 */
    for (const [sx, sz] of stabPositions(k)) {
      mounts.push([sx - (k.x + k.w / 2), sz - (k.y + k.h / 2)]);
    }

    const drawSocket = (ox, oz) => {
      const bx = cx + ox, bz = cz + oz;
      const bh = Math.max(SD + 0.6 / 19.05, topY(bx, bz) - TT);   // 柱高：顶到腔内顶
      const from = pos.length / 3;
      /* 柱外壁：36 段，稍后单独给径向平滑法线（不然棱面感很重） */
      for (let i = 0; i < 36; i++) {
        const a0 = i / 36 * Math.PI * 2, a1 = (i + 1) / 36 * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        quad([c0, 0, s0],
          [bx + BR * c0, 0, bz + BR * s0], [bx + BR * c1, 0, bz + BR * s1],
          [bx + BR * c1, bh, bz + BR * s1], [bx + BR * c0, bh, bz + BR * s0],
          bUV, bUV, bUV, bUV);
      }
      bossRanges.push([from, pos.length / 3, bx, bz]);
      /* 柱底面：圆盘到十字轮廓的环（每象限 2 片 + 每臂端 1 片） */
      const onArc = (x, z) => {
        const L = Math.hypot(x, z) || 1;
        return [bx + x / L * BR, bz + z / L * BR];
      };
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const x0 = SW * sx, z0 = SW * sz, x1 = SL * sx, z1 = SW * sz, x2 = SW * sx, z2 = SL * sz;
        const a0 = onArc(x0, z0), a1 = onArc(x1, z1), a2 = onArc(x2, z2);
        quad([0, -1, 0], [bx + x0, 0, bz + z0], [bx + x1, 0, bz + z1], [a1[0], 0, a1[1]], [a0[0], 0, a0[1]],
          bUV, bUV, bUV, bUV);
        quad([0, -1, 0], [bx + x0, 0, bz + z0], [a0[0], 0, a0[1]], [a2[0], 0, a2[1]], [bx + x2, 0, bz + z2],
          bUV, bUV, bUV, bUV);
        if (sz > 0) {   // 臂端区域（每个臂只算一次）
          const t0 = onArc(SL * sx, -SW), t1 = onArc(SL * sx, SW);
          quad([0, -1, 0], [bx + SL * sx, 0, bz - SW], [bx + SL * sx, 0, bz + SW],
            [t1[0], 0, t1[1]], [t0[0], 0, t0[1]], bUV, bUV, bUV, bUV);
        }
      }
      /* 十字插槽内壁（每臂 2 侧面 + 1 端面） */
      const slotWall = (ax, az, ex, ez) => quad([0, 0, 0],
        [bx + ax, 0, bz + az], [bx + ex, 0, bz + ez],
        [bx + ex, SD, bz + ez], [bx + ax, SD, bz + az], bUV, bUV, bUV, bUV);
      for (const s of [1, -1]) {
        slotWall(SW * s, SW, SL * s, SW);  slotWall(SW * s, -SW, SL * s, -SW);  // 水平臂两侧
        slotWall(SL * s, -SW, SL * s, SW);                                       // 水平臂端面
        slotWall(SW, SW * s, SW, SL * s);  slotWall(-SW, SW * s, -SW, SL * s);   // 竖直臂两侧
        slotWall(-SW, SL * s, SW, SL * s);                                       // 竖直臂端面
      }
      /* 槽底（十字形，5 片） */
      quad([0, -1, 0], [bx - SW, SD, bz - SW], [bx + SW, SD, bz - SW], [bx + SW, SD, bz + SW], [bx - SW, SD, bz + SW], bUV, bUV, bUV, bUV);
      for (const s of [1, -1]) {
        quad([0, -1, 0], [bx + SW * s, SD, bz - SW], [bx + SL * s, SD, bz - SW], [bx + SL * s, SD, bz + SW], [bx + SW * s, SD, bz + SW], bUV, bUV, bUV, bUV);
        quad([0, -1, 0], [bx - SW, SD, bz + SW * s], [bx + SW, SD, bz + SW * s], [bx + SW, SD, bz + SL * s], [bx - SW, SD, bz + SL * s], bUV, bUV, bUV, bUV);
      }
    };
    for (const [ox, oz] of mounts) drawSocket(ox, oz);
  }

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
  /* 轴心柱外壁换成径向平滑法线：不然分段再多也还是棱面 */
  if (bossRanges.length) {
    const nrm = geo.attributes.normal;
    for (const [from, to, bcx, bcz] of bossRanges) {
      for (let i = from; i < to; i++) {
        const dx = pos[i * 3] - bcx, dz = pos[i * 3 + 2] - bcz;
        const L = Math.hypot(dx, dz) || 1;
        nrm.setXYZ(i, dx / L, 0, dz / L);
      }
    }
    nrm.needsUpdate = true;
  }
  return geo;
}

/* ---------- 底盘：定位板 / PCB / 轴座 / 卫星轴 / 外壳 ----------
 * 与键帽同一坐标系（板面 y = 0，厚度与外壳朝下），几何直接按世界坐标构建。
 * 尺寸见文件开头的 MX / REF 表；形体按实物简化，位置与规格照参考值。 */
function sqPath(x, z, half) {
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
function cRingShape(x0, z0, x1, z1, r, t, zCut) {
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
function roundRectShape(x0, z0, x1, z1, r, p) {
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
function stabPositions(k) {
  if (Math.max(k.w, k.h) < 2) return [];
  const cx = k.x + k.w / 2, cz = k.y + k.h / 2;
  const horiz = k.w >= k.h;
  const span = horiz ? k.w : k.h;
  /* 换算成 u：6.25u → 100mm/2 = 2.625u，7u → 114.3mm/2 = 3u */
  const o = span >= 6 ? (100 / 19.05 + (span - 6.25)) / 2 : REF.stabX;
  return horiz ? [[cx - o, cz], [cx + o, cz]] : [[cx, cz - o], [cx, cz + o]];
}

/* 铭牌贴图（只建一次） */
let _badgeTex = null;
function badgeTexture() {
  if (_badgeTex) return _badgeTex;
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#191a1e";
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#e9e5dd";
  g.font = "600 44px Inter, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("KEYCAP STUDIO", cv.width / 2, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false;
  _badgeTex = t;
  return t;
}

/* ---------- 外壳底面斜坡 ----------
 * 斜面就是**外壳底面**（贴地那面）：底面被斜切，越靠后外壳越高；
 * 装键帽的那面（直角面，分模线以上）一点不动，保持方正水平。
 * 位移场 y += k·(z − zMid)·w(y)：w 在分模线处为 0、往下线性升到底面为 1。 */
function wedgeGeo(geo, o, oy = 0, oz = 0) {
  const pos = geo.attributes.position;
  const span = o.yTop - o.yBot;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + oy;
    const w = Math.min(1, Math.max(0, (o.yTop - y) / span));   // 分模线 0 → 底面 1
    if (w <= 0) continue;
    pos.setY(i, pos.getY(i) + o.k * (pos.getZ(i) + oz - o.zMid) * w);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* 实例化网格（轴座）：每个实例按自己所在高度取位场，整体平移 */
function wedgeInstances(im, o) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const w = Math.min(1, Math.max(0, (o.yTop - p.y) / (o.yTop - o.yBot)));
    if (w <= 0) continue;
    m.setPosition(p.x, p.y + o.k * (p.z - o.zMid) * w, p.z);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
}

/* 落地姿态：整机绕（底面中心、x 轴）回转，让外壳的**斜面正好平行于桌面** ——
 * 也就是外壳真正坐在自己的斜面上（放在桌上不会再是翘着的）。 */
function caseRestMatrix(a, yBot, zMid) {
  return new THREE.Matrix4().makeTranslation(0, yBot, zMid)
    .multiply(new THREE.Matrix4().makeRotationX(a))
    .multiply(new THREE.Matrix4().makeTranslation(0, -yBot, -zMid));
}

function buildCase(keys, bounds, pm, mat) {
  const W = bounds.W, H = bounds.H;
  /* 外壳侧视斜坡位场：斜面就是底面；上面保持方正水平 */
  const WED = { k: CASE_K, zMid: H / 2, yBot: CASE_BOT, yTop: TOP_BOT };
  const REST = caseRestMatrix(CASE_ANG, CASE_BOT, H / 2);   // 落地姿态：斜面平行桌面
  const parts = [];                       // 定位板/下壳/边框之外的附属件
  const mats = [mat];
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x14251c, roughness: 0.6, metalness: 0.08 });
  const plasticMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55, metalness: 0.12 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xc9ced6, roughness: 0.25, metalness: 0.85,
    envMap: makeStudioEnv(), envMapIntensity: 0.8
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.95, metalness: 0 });
  mats.push(pcbMat, plasticMat, metalMat, rubberMat);

  /* ----- 定位板：每键 14mm 方孔 + 卫星轴过孔 ----- */
  const s = new THREE.Shape();
  s.moveTo(-PLATE_PM, -PLATE_PM);
  s.lineTo(W + PLATE_PM, -PLATE_PM);
  s.lineTo(W + PLATE_PM, H + PLATE_PM);
  s.lineTo(-PLATE_PM, H + PLATE_PM);
  s.closePath();
  const r = MX.hole / 2;
  const sh = REF.stabHole / 2;
  for (const k of keys) {
    s.holes.push(sqPath(k.x + k.w / 2, k.y + k.h / 2, r));
    for (const [px, pz] of stabPositions(k)) s.holes.push(sqPath(px, pz, sh));
  }
  const pg = new THREE.ExtrudeGeometry(s, { depth: MX.plateT, bevelEnabled: false });
  pg.rotateX(Math.PI / 2);                // shape 的 (x,y) → 世界 (x,z)，厚度朝下
  const plate = new THREE.Mesh(pg, mat);
  plate.receiveShadow = true;

  /* ----- 外壳 -----
     上盖：环形（内口 = 键位区、外轮廓圆角），从 CASE_LIP 到 TOP_BOT。
     下壳：真正的壳件 —— 底板 + C 形三面壁（前 + 左右）+ 带 USB-C 开孔的后壁 + 两根后角圆柱，
           壁厚 WALL_T，内部是空的（PCB / 轴座 / 卫星轴装在腔里）；整体内缩 SEAM 形成分模线。 */
  const mkCase = (shape, yTop, yBot) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: yTop - yBot, bevelEnabled: false });
    g.rotateX(Math.PI / 2);              // shape 的 (x,y) → 世界 (x,z)，厚度朝下
    g.translate(0, yTop, 0);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  };
  /* 上盖按高度分三段叠起来（高边框做法）：
     板面以上 → 上沿 8mm：内口比键位区大 INNER_GAP，键帽下半截就落在这一段里；
     板面以下 0 ~ −1.5mm：内口放大到 PLATE_SLOT，是定位板的卡槽；
     −1.5mm 以下：内口收到 INNER_GAP，形成承托定位板的一圈台阶。 */
  const topSeg = (yTop, yBot, half) => {
    const sh = roundRectShape(-pm, -pm, W + pm, H + pm, CASE_R, new THREE.Shape());
    sh.holes.push(roundRectShape(-half, -half, W + half, H + half, 0.08, new THREE.Path()));
    return mkCase(sh, yTop, yBot);
  };
  const caseTopUp = topSeg(CASE_LIP, 0, INNER_GAP);            // 高边框：围住键帽下半截
  const caseTopSlot = topSeg(0, -MX.plateT, PLATE_SLOT);       // 定位板卡槽
  const caseTopLo = topSeg(-MX.plateT, TOP_BOT, INNER_GAP);    // 承托定位板的台阶
  const rims = [caseTopUp, caseTopSlot, caseTopLo];

  const bx0 = -pm + SEAM, bx1 = W + pm - SEAM;
  const bz0 = -pm + SEAM, bz1 = H + pm - SEAM;
  const bR = CASE_R - SEAM, wallT = WALL_T;
  const caseMesh = mkCase(roundRectShape(bx0, bz0, bx1, bz1, bR, new THREE.Shape()),
    CASE_BOT + wallT, CASE_BOT);                                   // 底板
  const caseC = mkCase(cRingShape(bx0, bz0, bx1, bz1, bR, wallT, bz0 + wallT),
    TOP_BOT, CASE_BOT + wallT);                                    // 前 + 左右壁

  /* 后壁：整块板，中间挖 USB-C 开孔（沿 z 挤出，形状在 XY 平面） */
  const usbY = TOP_BOT - 0.12;
  const backShape = new THREE.Shape();
  backShape.moveTo(bx0, CASE_BOT + wallT);
  backShape.lineTo(bx1, CASE_BOT + wallT);
  backShape.lineTo(bx1, TOP_BOT);
  backShape.lineTo(bx0, TOP_BOT);
  backShape.closePath();
  backShape.holes.push(roundRectShape(
    W / 2 - PCUT[0] / 2, usbY - PCUT[1] / 2,
    W / 2 + PCUT[0] / 2, usbY + PCUT[1] / 2, PCUT[2], new THREE.Path()));
  const backWall = new THREE.Mesh(
    new THREE.ExtrudeGeometry(backShape, { depth: wallT, bevelEnabled: false }), mat);
  backWall.position.z = bz0;
  backWall.receiveShadow = true;

  /* 后角圆柱：把后壁与侧壁交出的直角补成圆角 */
  const cornerH = TOP_BOT - CASE_BOT - wallT;
  const cornerGeo = new THREE.CylinderGeometry(bR, bR, cornerH, 20);
  [[bx0 + bR, bz0 + bR], [bx1 - bR, bz0 + bR]].forEach(([cx, cz]) => {
    const m = new THREE.Mesh(cornerGeo.clone(), mat);   // 各自一份：后面加斜面要按各自位置变形
    m.position.set(cx, CASE_BOT + wallT + cornerH / 2, cz);
    m.receiveShadow = true;
    parts.push(m);
  });
  parts.push(caseC, backWall);

  /* ----- USB-C 插座：金属外壳环（深 6.5mm，与壁面齐平）+ 腔底 + 舌片 ----- */
  const [shW, shH, shR] = REF.usbShell;
  const [moW, moH, moR] = REF.usbMouth;
  const shellRing = roundRectShape(-shW / 2, -shH / 2, shW / 2, shH / 2, shR, new THREE.Shape());
  shellRing.holes.push(roundRectShape(-moW / 2, -moH / 2, moW / 2, moH / 2, moR, new THREE.Path()));
  const usbShell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shellRing, { depth: 6.5 / 19.05, bevelEnabled: false }), metalMat);
  usbShell.position.set(W / 2, usbY, bz0);                 // 口面与壁面齐平，沿 +z 伸进壳内 6.5mm
  const usbBack = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      roundRectShape(-moW / 2, -moH / 2, moW / 2, moH / 2, moR, new THREE.Shape()),
      { depth: 0.4 / 19.05, bevelEnabled: false }), rubberMat);
  usbBack.position.set(W / 2, usbY, bz0 + 6.1 / 19.05);    // 腔底
  const usbTongue = new THREE.Mesh(
    new THREE.BoxGeometry(REF.usbTongue[0], REF.usbTongue[1], 5.4 / 19.05), metalMat);
  usbTongue.position.set(W / 2, usbY, bz0 + 3.9 / 19.05);  // 舌片：口内 1.2mm 起，长 5.4mm
  parts.push(usbShell, usbBack, usbTongue);

  /* ----- 前侧边框：铭牌 ----- */
  const badgeMat = new THREE.MeshStandardMaterial({
    map: badgeTexture(), roughness: 0.3, metalness: 0.75,
    envMap: makeStudioEnv(), envMapIntensity: 0.7
  });
  mats.push(badgeMat);
  const badgeGeo = new THREE.PlaneGeometry(0.9, 0.16);
  badgeGeo.rotateX(-Math.PI / 2);            // 旋转烘进几何，便于后面按世界坐标加斜面
  const badge = new THREE.Mesh(badgeGeo, badgeMat);
  badge.position.set(W / 2, CASE_LIP + 0.002, H + pm / 2);
  parts.push(badge);

  /* ----- 脚垫：PH60 BOM 规格 20×10×2 硅胶垫 ×4 ----- */
  const padGeo = new THREE.ExtrudeGeometry(
    roundRectShape(-0.52, -0.26, 0.52, 0.26, 0.08, new THREE.Shape()),
    { depth: 2 / 19.05, bevelEnabled: false });
  padGeo.rotateX(Math.PI / 2);          // 厚度朝下
  const padAt = (px, pz) => {
    const m = new THREE.Mesh(padGeo.clone(), rubberMat);   // 各自一份：脚垫要跟着底面斜度各自动变形
    m.position.set(px, CASE_BOT, pz);
    parts.push(m);
  };
  [[0.6, 0.6], [W - 0.6, 0.6], [0.6, H - 0.6], [W - 0.6, H - 0.6]].forEach(([px, pz]) => padAt(px, pz));

  /* ----- 脚撑：PH60 是两级（7°/0°）折叠脚，这里按 0° 折叠态放在后侧 ----- */
  [W * 0.28, W * 0.72].forEach(px => padAt(px, -pm + 0.3));

  /* ----- PCB：1.6mm，位于板面下 6.5mm ----- */
  const pcbIns = 0.12;
  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(W + 2 * pm - 2 * pcbIns, REF.pcbT, H + 2 * pm - 2 * pcbIns), pcbMat);
  pcb.position.set(W / 2, PCB_Y - REF.pcbT / 2, H / 2);
  pcb.receiveShadow = true;
  parts.push(pcb);

  /* ----- 热插拔轴座：每键一个，贴在 PCB 下面 ----- */
  const [sockW, sockD, sockH] = REF.socket;
  const socks = new THREE.InstancedMesh(new THREE.BoxGeometry(sockW, sockH, sockD), plasticMat, keys.length);
  const m4 = new THREE.Matrix4();
  keys.forEach((k, i) => {
    m4.makeTranslation(k.x + k.w / 2, PCB_Y - REF.pcbT - sockH / 2, k.y + k.h / 2);
    socks.setMatrixAt(i, m4);
  });
  socks.instanceMatrix.needsUpdate = true;
  socks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  socks.frustumCulled = false;
  parts.push(socks);

  /* ----- 卫星轴：板下轴座 + 穿板的十字轴心 + Ø1.6 钢丝 ----- */
  const houseH = MX.plateT + REF.pcbGap;             // 板下沿 → PCB 面
  const yb = -MX.plateT, yt = MX.upperH + MX.crossH; // 轴心：板的下面 → 与轴体同高
  const bh = yt - yb;
  for (const k of keys) {
    const stabs = stabPositions(k);
    if (!stabs.length) continue;
    const horiz = k.w >= k.h;
    for (const [sx, sz] of stabs) {
      const house = new THREE.Mesh(new THREE.BoxGeometry(0.31, houseH, 0.31), plasticMat);
      house.position.set(sx, -houseH / 2, sz);
      const bladeA = new THREE.Mesh(new THREE.BoxGeometry(MX.arm, bh, MX.cross), plasticMat);
      bladeA.position.set(sx, (yb + yt) / 2, sz);
      const bladeB = new THREE.Mesh(new THREE.BoxGeometry(MX.cross, bh, MX.arm), plasticMat);
      bladeB.position.set(sx, (yb + yt) / 2, sz);
      parts.push(house, bladeA, bladeB);
    }
    /* 钢丝：两端插进轴座，中间横杆从轴体下壳外侧绕过去 */
    const [p0, p1] = stabs;
    const off = 0.42;                                 // 绕开 13.9mm 轴体下壳所需的偏移
    const yTop = -MX.plateT - 0.02, yMid = -MX.plateT - REF.pcbGap * 0.55;
    const dx = horiz ? 0 : off, dz = horiz ? off : 0;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(V(p0[0], yTop, p0[1]), V(p0[0], yMid, p0[1])));
    path.add(new THREE.LineCurve3(V(p0[0], yMid, p0[1]), V(p0[0] - dx, yMid, p0[1] - dz)));
    path.add(new THREE.LineCurve3(V(p0[0] - dx, yMid, p0[1] - dz), V(p1[0] + dx, yMid, p1[1] - dz)));
    path.add(new THREE.LineCurve3(V(p1[0] + dx, yMid, p1[1] - dz), V(p1[0], yMid, p1[1])));
    path.add(new THREE.LineCurve3(V(p1[0], yMid, p1[1]), V(p1[0], yTop, p1[1])));
    parts.push(new THREE.Mesh(new THREE.TubeGeometry(path, 24, REF.wire / 2, 6, false), metalMat));
  }

  return { plate, caseMesh, rims, parts, mats, wedge: WED, rest: REST };
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
    /* 底部反弹光：从下往上看键帽腔体/底面时不至于一片黑 */
    const bounce = new THREE.DirectionalLight(0xd8e4ff, 0.5);
    bounce.position.set(1, -8, 4);
    this.scene.add(amb, key, fill, rim, bounce);
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
    this._case = null;
    this._rims = [];
    this._parts = [];
    this._mats = [];
    this._targetKey = null;
    this._targetDesign = null;
    this._singleCap = null;
    this._singlePlate = null;
    this._singleCase = null;
    this._singleRims = [];
    this._singleParts = [];
    this._singleMats = [];
    this._raycaster = new THREE.Raycaster();
    this.selected = -1;

    /* 共享轴体几何/材质 */
    this._stemMat = new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.5, metalness: 0.15 });
    this._housingGeo = new THREE.BoxGeometry(MX.upperW, MX.upperH, MX.upperW);   // 上盖
    this._flangeGeo = new THREE.BoxGeometry(MX.flange, LOWER_H, MX.flange);      // 轴体下壳（填满定位板开孔、直达 PCB）
    this._stemGeoA = new THREE.BoxGeometry(MX.arm, MX.crossH, MX.cross);         // 十字（沿 z）
    this._stemGeoB = new THREE.BoxGeometry(MX.cross, MX.crossH, MX.arm);         // 十字（沿 x）

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

    /* 底盘：定位板 + PCB + 轴座 + 卫星轴 + 外壳（材质由 buildCase 统一给出） */
    for (const m of [this._plate, this._case].concat(this._rims || [], this._parts || [])) {
      if (!m) continue;
      this._group.remove(m);
      m.geometry.dispose();
      if (m.isInstancedMesh) m.dispose();
    }
    for (const mt of (this._mats || [])) mt.dispose();
    this._plate = null; this._case = null; this._rims = []; this._parts = []; this._mats = [];

    const pm = 0.35;
    const body = buildCase(keys, bounds, pm, new THREE.MeshStandardMaterial({
      color: plateColor, roughness: 0.28, metalness: 0.6,
      envMap: makeStudioEnv(), envMapIntensity: 0.85
    }));
    this._plate = body.plate;
    this._case = body.caseMesh;
    this._rims = body.rims;
    this._parts = body.parts;
    this._mats = body.mats;
    this._wedge = body.wedge;
    this._rest = body.rest;                      // 落地姿态：斜面平放桌面
    for (const m of [this._plate, this._case].concat(this._rims, this._parts)) {
      if (m.isInstancedMesh) wedgeInstances(m, body.wedge);
      else wedgeGeo(m.geometry, body.wedge, m.position.y, m.position.z);
      m.updateMatrix();
      m.matrixAutoUpdate = false;      // 静态件：几何即世界坐标，冻结矩阵
      m.matrix.premultiply(this._rest);
      this._group.add(m);
    }

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
      side: THREE.DoubleSide,          // 底部开口：内壁也要能看见（否则看穿到背景）
      envMap: makeStudioEnv(), envMapIntensity: 0.6
    });

    const mesh = new THREE.Mesh(capGeometry(k, rowP, dims, single), mat);
    mesh.position.set(px, FLOAT, py);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;   // 静态物件：冻结世界矩阵
    if (this._rest) mesh.matrix.premultiply(this._rest);       // 随外壳落地姿态
    mesh.userData.index = single ? -1 : index;
    this._group.add(mesh);

    /* 轴体只在整盘视图里出现（InstancedMesh）；单键预览只画键帽本身 */
    let flange = null, housing = null, stemA = null, stemB = null;

    const cap = {
      mesh, mat, tex, canvas, dims, k, index,
      d: d || null,
      v: -1, wrapState: null,        // 纹理内容版本 / 包裹状态
      flange, housing, stemA, stemB
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
      if (this._rest) im.matrix.premultiply(this._rest);
      im.frustumCulled = false;      // 实例包围球不含实例位移
      this._group.add(im);
      this._stems.push(im);
    };
    mk(this._flangeGeo, MX_Y.flange);
    mk(this._housingGeo, MX_Y.housing);
    mk(this._stemGeoA, MX_Y.stem);
    mk(this._stemGeoB, MX_Y.stem);
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
    for (const m of [this._singlePlate, this._singleCase].concat(this._singleRims || [], this._singleParts || [])) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      if (m.isInstancedMesh) m.dispose();
    }
    for (const mt of (this._singleMats || [])) mt.dispose();
    this._singlePlate = null; this._singleCase = null;
    this._singleRims = []; this._singleParts = []; this._singleMats = [];
    if (!k) return;

    /* 只看键帽本身：不带定位板/PCB/轴座/外壳，也不做落地倾斜（正姿便于看形与刻字） */
    this._rest = null;
    this._singleCap = this._buildCap(k, d, 0, 0, 0, true, rowParams);
    this._needsRender = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  _removeCap(c) {
    this._group.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mat.dispose();
    c.tex.dispose();
    [c.flange, c.housing, c.stemA, c.stemB].forEach(m => { if (m) this._group.remove(m); });
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
