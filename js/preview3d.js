/* =========================================================
 * 3D 键盘预览（Three.js / WebGL，UMD 全局 THREE）
 * - 全部使用 MeshBasicMaterial + CPU 烘焙明暗：
 *   不依赖灯光/驱动，任何机器渲染结果一致（杜绝发黑）
 * - 真实键帽结构：裙边悬浮于底板上方，露出轴体上座与十字轴心
 * - 分排高度/倾角（OEM / Cherry / SA / DSA / XDA）
 * - 贴图十字展开：图片按“十字展开图”取模贴装，
 *   顶面取图案中心，四壁取相邻区域，跨界连续（真正的包裹）
 * ========================================================= */

(() => {
if (!window.THREE) {
  console.warn("[KeycapStudio] three.min.js 未加载，3D 预览不可用");
  return;
}

const TI = 0.125;          // 顶面内缩（1u 顶面 ≈ 0.66u，与实物一致）
const PXU = 200;           // 纹理分辨率（px / u）——全模式统一，避免画布反复 resize
const PXS = PXU;           // 包裹展开图分辨率（与顶面一致）
const FOV = 40;
const FLOAT = 0.34;        // 裙边底部离底板高度（露出轴体上座）
const STEM = new THREE.Color(0x17181d);   // 轴体颜色
const ACCENT = new THREE.Color(0xd9480f);
const SIDE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

/* 侧向明暗烘焙系数（固定光向：左前上方）北 东 南 西 */
const SIDE_SHADE = [ -18, -38, -26, -30 ];
const SIDE_BLEND = [0.45, 0.6, 0.5, 0.55];

/* 键帽纹理统一创建：禁 mipmap + 线性过滤（NPOT 画布必需）
 * 注意：纹理画布不要加 willReadFrequently —— 该选项使画布走软件光栅化，
 * Chromium 下作为 WebGL 纹理上传时会读到陈旧副本（表现为贴图残留/图中小图） */
function makeCapTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

/* ---------- 顶面纹理绘制（仅顶面模式，与平面渲染一致） ---------- */
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function drawLegend(g, d, k, regionW, regionH) {
  const legend = d && d.legend != null ? d.legend : k.label;
  if (!legend) return;
  const bg = (d && d.bg) || "#e9ecf5";
  const color = (d && d.legendColor) || (Render.luminance(bg) > 0.55 ? "#3a3d46" : "#e8eaf2");
  const fs = Math.min(regionH * 0.36 * ((d && d.legendSize) || 1), 0.28 * PXU);
  g.fillStyle = color;
  g.font = `600 ${Math.max(8, fs)}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
  g.textAlign = "left";
  g.textBaseline = "top";
  const pad = Math.min(regionW, regionH) * 0.11;
  g.fillText(legend, pad, pad * 0.9);
}

function drawTopCanvas(cv, k, d, getImg) {
  const tw = k.w - 2 * TI, th = k.h - 2 * TI;
  const TW = Math.max(8, Math.round(tw * PXU));
  const TH = Math.max(8, Math.round(th * PXU));
  if (cv.width !== TW || cv.height !== TH) { cv.width = TW; cv.height = TH; }
  /* 注意：纹理画布不要加 willReadFrequently —— 该选项使画布走软件光栅化，
   * Chromium 下作为 WebGL 纹理上传时会读到陈旧副本（表现为贴图残留/图中小图） */
  const g = cv.getContext("2d");
  g.clearRect(0, 0, TW, TH);

  const bg = (d && d.bg) || "#e9ecf5";
  const r = 0.10 * PXU;

  roundRect(g, 0, 0, TW, TH, r);
  g.fillStyle = bg;
  g.fill();

  if (d && d.img && d.img.data) {
    const el = getImg(d.img.data);
    if (el && el.complete && el.naturalWidth > 0) {
      g.save();
      roundRect(g, 0, 0, TW, TH, r);
      g.clip();
      const base = Math.max(TW / el.naturalWidth, TH / el.naturalHeight);
      const s = base * (d.img.scale || 1);
      g.translate(TW / 2 + (d.img.ox || 0) * TW, TH / 2 + (d.img.oy || 0) * TH);
      g.rotate((d.img.rot || 0) * Math.PI / 180);
      g.drawImage(el, -el.naturalWidth * s / 2, -el.naturalHeight * s / 2, el.naturalWidth * s, el.naturalHeight * s);
      g.restore();
    }
  }

  /* 顶面冠部光影 */
  g.save();
  roundRect(g, 0, 0, TW, TH, r);
  g.clip();
  const gr = g.createLinearGradient(0, 0, 0, TH);
  gr.addColorStop(0, "rgba(255,255,255,0.13)");
  gr.addColorStop(0.55, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.07)");
  g.fillStyle = gr;
  g.fillRect(0, 0, TW, TH);
  g.restore();

  drawLegend(g, d, k, TW, TH);

  roundRect(g, 0.75, 0.75, TW - 1.5, TH - 1.5, Math.max(1, r - 0.75));
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = 1.5;
  g.stroke();
}

/* ---------- 键帽几何（三段裙边 + 锥度 + 分排倾角，带 UV） ---------- */
function pushQuad(pos, uvs, n, a, b, c, d, uv) {
  /* 自动修正绕向，使面法线与 n 同向；uv 为四角纹理坐标（可空） */
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ];
  if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
    [b, d] = [d, b];
    if (uv) uv = [uv[0], uv[3], uv[2], uv[1]];
  }
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  pos.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  const U = uv || [[0, 0], [0, 0], [0, 0], [0, 0]];
  uvs.push(U[0][0], U[0][1], U[1][0], U[1][1], U[2][0], U[2][1]);
  uvs.push(U[0][0], U[0][1], U[2][0], U[2][1], U[3][0], U[3][1]);
}

/**
 * 键帽几何（局部坐标，Y 向上）
 * 结构：底缘(微收) → 中段裙边(近垂直) → 锥形收分 → 顶面
 * 分组：[北, 东, 南, 西, 底, 顶] → 材质数组 6 项
 */
function capGeometry(k, params) {
  const w = k.w, hh = k.h, ch = params.h, tilt = params.tilt || 0;
  const yB = ch + Math.sin(tilt) * (hh / 2 - TI);
  const yF = ch - Math.sin(tilt) * (hh / 2 - TI);
  const z1 = ch * 0.32, r1 = 0.03;
  const pos = [], uvs = [], groups = [];
  let start = 0;

  function quad(n, a, b, c, d, uv) { pushQuad(pos, uvs, n, a, b, c, d, uv); }

  /* 侧面 UV：u 沿壁横向、v 按高度分段（裙边 [0, z1/H]，锥形段 [z1/H, 1]）。
   * 方向与印刷展开图折叠一致：北/南 u 沿展开图 x（西→东），东 u 沿展开图 y（北→南），西反向闭合 */
  /* 北（后缘，-z），壁高 yB */
  quad([0, 0, -1], [0, 0, 0], [w, 0, 0], [w - r1, z1, r1], [r1, z1, r1],
       [[0, 0], [1, 0], [1 - r1 / w, z1 / yB], [r1 / w, z1 / yB]]);
  quad([0, 0, -1], [r1, z1, r1], [w - r1, z1, r1], [w - TI, yB, TI], [TI, yB, TI],
       [[r1 / w, z1 / yB], [1 - r1 / w, z1 / yB], [1 - TI / w, 1], [TI / w, 1]]);
  groups.push([start, (pos.length / 3) - start, 0]); start = pos.length / 3;

  /* 东（+x），壁高 ch */
  quad([1, 0, 0], [w, 0, 0], [w, 0, hh], [w - r1, z1, hh - r1], [w - r1, z1, r1],
       [[0, 0], [1, 0], [1 - r1 / hh, z1 / ch], [r1 / hh, z1 / ch]]);
  quad([1, 0, 0], [w - r1, z1, r1], [w - r1, z1, hh - r1], [w - TI, yF, hh - TI], [w - TI, yB, TI],
       [[r1 / hh, z1 / ch], [1 - r1 / hh, z1 / ch], [1 - TI / hh, 1], [TI / hh, 1]]);
  groups.push([start, (pos.length / 3) - start, 1]); start = pos.length / 3;

  /* 南（前缘，+z），壁高 yF */
  quad([0, 0, 1], [w, 0, hh], [0, 0, hh], [r1, z1, hh - r1], [w - r1, z1, hh - r1],
       [[1, 0], [0, 0], [r1 / w, z1 / yF], [1 - r1 / w, z1 / yF]]);
  quad([0, 0, 1], [w - r1, z1, hh - r1], [r1, z1, hh - r1], [TI, yF, hh - TI], [w - TI, yF, hh - TI],
       [[1 - r1 / w, z1 / yF], [r1 / w, z1 / yF], [TI / w, 1], [1 - TI / w, 1]]);
  groups.push([start, (pos.length / 3) - start, 2]); start = pos.length / 3;

  /* 西（-x），壁高 ch */
  quad([-1, 0, 0], [0, 0, hh], [0, 0, 0], [r1, z1, r1], [r1, z1, hh - r1],
       [[0, 0], [1, 0], [1 - r1 / hh, z1 / ch], [r1 / hh, z1 / ch]]);
  quad([-1, 0, 0], [r1, z1, r1], [r1, z1, hh - r1], [TI, yF, hh - TI], [TI, yB, TI],
       [[1 - r1 / hh, z1 / ch], [r1 / hh, z1 / ch], [TI / hh, 1], [1 - TI / hh, 1]]);
  groups.push([start, (pos.length / 3) - start, 3]); start = pos.length / 3;

  /* 底面（防止低角度看穿裙边） */
  quad([0, -1, 0], [0, 0, 0], [0, 0, hh], [w, 0, hh], [w, 0, 0]);
  groups.push([start, (pos.length / 3) - start, 4]); start = pos.length / 3;

  /* 顶面（UV：后缘为纹理上缘） */
  quad([0, 1, 0],
    [TI, yB, TI], [w - TI, yB, TI], [w - TI, yF, hh - TI], [TI, yF, hh - TI],
    [[0, 1], [1, 1], [1, 0], [0, 0]]);
  groups.push([start, (pos.length / 3) - start, 5]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  for (const g of groups) geo.addGroup(g[0], g[1], g[2]);
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
      canvas, antialias: true, alpha: false, preserveDrawingBuffer: true
    });
    this.renderer.setClearColor(0xedeae3, 1);
    /* 线性直通：颜色不做编码转换，所见即所得（与平面渲染一致） */

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

    this.keys = [];
    this.designs = {};
    this._group = new THREE.Group();
    this.scene.add(this._group);
    this.caps = [];
    this.capMeshes = [];
    this._plate = null;
    this._targetKey = null;
    this._targetDesign = null;
    this._singleCap = null;
    this._raycaster = new THREE.Raycaster();
    this.selected = -1;

    /* 共享几何/材质（轴体上座 + 十字轴心） */
    this._stemMat = new THREE.MeshBasicMaterial({ color: STEM });
    this._housingGeo = new THREE.BoxGeometry(0.52, 0.3, 0.52);
    this._stemGeoA = new THREE.BoxGeometry(0.13, 0.09, 0.42);
    this._stemGeoB = new THREE.BoxGeometry(0.42, 0.09, 0.13);

    this._bindPointer();
    /* 渲染循环必须免疫单帧异常：_frame 抛错时若不继续调度 rAF，
     * 循环会永久死亡（画面冻结在旧帧 = 模型"卡住"） */
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
    this.keys = keys;
    this.designs = designs;
    this.plateColor = plateColor;
    this.profile = profile || "oem";
    const bounds = layoutBounds(keys);
    this._hasFRow = bounds.H >= 5.9;
    this.W = bounds.W; this.H = bounds.H;

    /* 底板（六面烘焙明暗） */
    if (this._plate) {
      this._group.remove(this._plate);
      this._plate.geometry.dispose();
      (Array.isArray(this._plate.material) ? this._plate.material : [this._plate.material]).forEach(m => m.dispose());
    }
    const pm = 0.35;
    const pg = new THREE.BoxGeometry(bounds.W + 2 * pm, 0.42, bounds.H + 2 * pm);
    const pc = new THREE.Color(plateColor);
    const sideC = new THREE.Color(Render.shade(plateColor, -34));
    const sideC2 = new THREE.Color(Render.shade(plateColor, -24));
    const botC = new THREE.Color(Render.shade(plateColor, -58));
    const pMats = [
      new THREE.MeshBasicMaterial({ color: sideC }),
      new THREE.MeshBasicMaterial({ color: sideC }),
      new THREE.MeshBasicMaterial({ color: pc }),
      new THREE.MeshBasicMaterial({ color: botC }),
      new THREE.MeshBasicMaterial({ color: sideC2 }),
      new THREE.MeshBasicMaterial({ color: sideC2 })
    ];
    this._plate = new THREE.Mesh(pg, pMats);
    this._plate.position.set(bounds.W / 2, -0.21, bounds.H / 2);
    this._group.add(this._plate);

    keys.forEach((k, i) => this._buildCap(k, designs[i], i, k.x, k.y, false));
  }

  _buildCap(k, d, index, px, py, single, rowParams) {
    const rowP = rowParams || keycapProfileFor(k, this._hasFRow, this.profile);
    const bg0 = (d && d.bg) || "#e9ecf5";
    const sideMats = SIDE_SHADE.map((s, j) => new THREE.MeshBasicMaterial({
      color: Render.shade(bg0, s)
    }));
    /* 纹理画布按最终尺寸一次性分配，之后绝不 resize——
     * 带纹理的画布反复 resize 会触发 WebGL 上传越界（贴图残留/错乱的元凶） */
    const texCanvas = document.createElement("canvas");
    texCanvas.width = Math.round((k.w - 2 * TI) * PXS);
    texCanvas.height = Math.round(rowP.h * PXS);
    if (d) drawTopCanvas(texCanvas, k, d, this.getImg);
    const tex = makeCapTexture(texCanvas);
    tex.anisotropy = 8;
    const topMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const bottomMat = new THREE.MeshBasicMaterial({ color: Render.shade(bg0, -58) });

    /* 十字展开包裹：每侧面一张裁剪纹理 + 展开图画布（尺寸同样一次分配） */
    const yBpx = Math.round((rowP.h + Math.sin(rowP.tilt || 0) * (k.h / 2 - TI)) * PXS);
    const yFpx = Math.round((rowP.h - Math.sin(rowP.tilt || 0) * (k.h / 2 - TI)) * PXS);
    const sideTexs = [
      [Math.round(k.w * PXS), yBpx],
      [Math.round(k.h * PXS), Math.round(rowP.h * PXS)],
      [Math.round(k.w * PXS), yFpx],
      [Math.round(k.h * PXS), Math.round(rowP.h * PXS)]
    ].map(([w, h]) => {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      return makeCapTexture(cv);
    });
    const netCanvas = document.createElement("canvas");
    netCanvas.width = Math.round((rowP.h * 2 + (k.w - 2 * TI)) * PXS);
    netCanvas.height = Math.round((yBpx / PXS + (k.w - 2 * TI) + yFpx / PXS) * PXS);

    const mesh = new THREE.Mesh(capGeometry(k, rowP), [...sideMats, bottomMat, topMat]);
    mesh.position.set(px, FLOAT, py);
    mesh.userData.index = single ? -1 : index;
    this._group.add(mesh);

    /* 轴体上座 + 十字轴心（键帽悬浮露出） */
    const housing = new THREE.Mesh(this._housingGeo, this._stemMat);
    housing.position.set(px + k.w / 2, 0.17, py + k.h / 2);
    const stemA = new THREE.Mesh(this._stemGeoA, this._stemMat);
    stemA.position.set(px + k.w / 2, 0.36, py + k.h / 2);
    const stemB = new THREE.Mesh(this._stemGeoB, this._stemMat);
    stemB.position.set(px + k.w / 2, 0.36, py + k.h / 2);
    this._group.add(housing, stemA, stemB);

    const cap = { mesh, sideMats, bottomMat, topMat, tex, texCanvas, sideTexs, netCanvas,
                  v: d ? d.v : -1, wrapState: null, index, k, ch: rowP.h, tilt: rowP.tilt || 0,
                  housing, stemA, stemB };
    this.caps.push(cap);
    this.capMeshes.push(mesh);
    if (single) {
      /* 单键视图：不进入整盘拾取/刷新列表，由 _singleCap 单独管理 */
      this.caps.pop();
      this.capMeshes.pop();
    }
    return cap;
  }

  setPlateColor(c) {
    this.plateColor = c;
    this._applyPlate();
  }

  _applyPlate() {
    if (!this._plate) return;
    const mats = Array.isArray(this._plate.material) ? this._plate.material : null;
    if (!mats) { this._plate.material.color.set(this.plateColor); return; }
    mats[0].color.set(Render.shade(this.plateColor, -34));
    mats[1].color.set(Render.shade(this.plateColor, -34));
    mats[2].color.set(this.plateColor);
    mats[3].color.set(Render.shade(this.plateColor, -58));
    mats[4].color.set(Render.shade(this.plateColor, -24));
    mats[5].color.set(Render.shade(this.plateColor, -24));
  }

  setSelected(i) {
    this.selected = i;
    this._applyCapColors();
  }

  _applyCapColors() {
    const apply = (c, d) => {
      if (!d) return;
      const sel = c.index === this.selected;
      const wrapped = !!c.sideMats[0].map;
      SIDE_SHADE.forEach((s, j) => {
        if (wrapped) {
          /* 包裹模式下明暗已在贴图中，材质色仅用于选中高亮 */
          c.sideMats[j].color.set(sel ? 0xd9480f : 0xffffff);
        } else {
          const base = new THREE.Color(Render.shade(d.bg || "#e9ecf5", s));
          if (sel) base.lerp(ACCENT, SIDE_BLEND[j]);
          c.sideMats[j].color.copy(base);
        }
      });
    };
    for (const c of this.caps) apply(c, this.designs[c.index]);
    if (this._singleCap && this._singleCap.d) apply(this._singleCap, this._singleCap.d);
  }

  setActive(a) { this.active = !!a; }

  /* ----- 单键模式 ----- */
  setTarget(k, d, rowParams) {
    this._targetKey = k;
    this._targetDesign = d;
    if (this._singleCap) {
      this._removeCap(this._singleCap);
      this._singleCap = null;
    }
    if (this._singlePlate) {
      this.scene.remove(this._singlePlate);
      this._singlePlate.geometry.dispose();
      (Array.isArray(this._singlePlate.material) ? this._singlePlate.material : [this._singlePlate.material]).forEach(m => m.dispose());
      this._singlePlate = null;
    }
    if (!k) return;

    /* 小底板 */
    const pm = 0.55;
    const pg = new THREE.BoxGeometry(k.w + 2 * pm, 0.42, k.h + 2 * pm);
    const pc = new THREE.Color(this.plateColor);
    this._singlePlate = new THREE.Mesh(pg, [
      new THREE.MeshBasicMaterial({ color: Render.shade(this.plateColor, -34) }),
      new THREE.MeshBasicMaterial({ color: Render.shade(this.plateColor, -34) }),
      new THREE.MeshBasicMaterial({ color: pc }),
      new THREE.MeshBasicMaterial({ color: Render.shade(this.plateColor, -58) }),
      new THREE.MeshBasicMaterial({ color: Render.shade(this.plateColor, -24) }),
      new THREE.MeshBasicMaterial({ color: Render.shade(this.plateColor, -24) })
    ]);
    this._singlePlate.position.set(k.w / 2, -0.21, k.h / 2);
    this.scene.add(this._singlePlate);

    this._singleCap = this._buildCap(k, d, 0, 0, 0, true, rowParams);
    this._singleCap.d = d;
    this._singleCap.k = k;
  }

  _removeCap(c) {
    this._group.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.sideMats.forEach(m => m.dispose());
    c.bottomMat.dispose();
    c.topMat.dispose();
    c.tex.dispose();
    c.sideTexs.forEach(t => t.dispose());
    [c.housing, c.stemA, c.stemB].forEach(m => { if (m) this._group.remove(m); });
  }

  _clearCaps() {
    for (const c of this.caps) {
      this._group.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.sideMats.forEach(m => m.dispose());
      c.bottomMat.dispose();
      c.topMat.dispose();
      c.tex.dispose();
      c.sideTexs.forEach(t => t.dispose());
      [c.housing, c.stemA, c.stemB].forEach(m => { if (m) this._group.remove(m); });
    }
    this.caps = [];
    this.capMeshes = [];
  }

  /* ----- 纹理 / 颜色刷新（每帧按需） ----- */
  _refreshCaps() {
    const list = this.single
      ? (this._singleCap ? [this._singleCap] : [])
      : this.caps.map(c => { c.d = this.designs[c.index]; return c; });

    for (const c of list) {
      const d = c.d;
      if (!d) continue;
      const img = d.img ? this.getImg(d.img.data) : null;
      const imgOk = img && img.complete && img.naturalWidth > 0;
      const imgPending = d.img && !imgOk;
      const wrap = !!(d.img && d.img.wrap === "net") && imgOk;
      /* 新图加载中：保持当前包裹画面不变，避免中途回退成仅顶面 */
      if (imgPending && c.wrapState) continue;
      if (d.v !== c.v || imgPending || wrap !== c.wrapState) {
        if (wrap) this._applyWrapNet(c, d, img);
        else {
          drawTopCanvas(c.texCanvas, c.k, d, this.getImg);
          c.tex.needsUpdate = true;
          this._clearSideWrap(c, d);
        }
        if (!imgPending) { c.v = d.v; c.wrapState = wrap; }
      }
      if (!wrap) {
        const bg = d.bg || "#e9ecf5";
        c.sideMats.forEach((m, j) => m.color.set(Render.shade(bg, SIDE_SHADE[j])));
      }
    }

    const hex = this._plate && this._plate.material[2].color.getHexString();
    if (hex && hex !== this.plateColor.replace("#", "").toLowerCase()) this._applyPlate();
  }

  /* ----- 十字展开取模：按真实展开尺寸取样（与取模预览完全一致）
   * 展开图布局：北壁 | 西壁 · 顶面(tw×th) · 东壁 | 南壁
   * 顶面取样 tw×th（真实顶面），四壁按分排高度 yB/yF/ch 取样 ----- */
  _applyWrapNet(c, d, img) {
    /* 重建纹理对象：同一 CanvasTexture 反复更新后，部分环境的 GPU 上传会
     * 残留旧内容（重复标志 / 旧帧叠加 = "图中图"），每次应用换新对象根治 */
    c.tex.dispose();
    c.tex = makeCapTexture(c.texCanvas);
    c.topMat.map = c.tex;
    c.topMat.needsUpdate = true;
    c.sideTexs.forEach((t, j) => {
      t.dispose();
      c.sideTexs[j] = makeCapTexture(t.image);
      c.sideMats[j].map = c.sideTexs[j];
      c.sideMats[j].needsUpdate = true;
    });
    const k = c.k, PX = PXS;
    const tw = k.w - 2 * TI, th = k.h - 2 * TI;
    const tilt = c.tilt || 0;
    const chH = c.ch || 0.55;
    const yB = chH + Math.sin(tilt) * (k.h / 2 - TI);
    const yF = chH - Math.sin(tilt) * (k.h / 2 - TI);

    const netW = chH + tw + chH;  /* 西壁竖条 | 顶面 | 东壁竖条（壁条宽=壁高，高=键深） */
    const netH = yB + th + yF;    /* 北壁 | 顶面 | 南壁 */
    const NW = Math.max(8, Math.round(netW * PX));
    const NH = Math.max(8, Math.round(netH * PX));
    const net = c.netCanvas;
    if (net.width !== NW || net.height !== NH) { net.width = NW; net.height = NH; }
    const g = net.getContext("2d");
    g.clearRect(0, 0, NW, NH);
    /* 底色填充：图片未覆盖区域显示键帽底色（不透明） */
    g.fillStyle = (d && d.bg) || "#e9ecf5";
    g.fillRect(0, 0, NW, NH);

    /* 各面取样条带（真实展开：北/南横条，东/西竖条，折叠线处图案连续） */
    const topR = { x: chH * PX, y: yB * PX, w: tw * PX, h: th * PX };
    const sideR = [
      { x: (chH - TI) * PX, y: 0, w: k.w * PX, h: yB * PX, m: "n" },                // 北壁
      { x: (chH + tw) * PX, y: (yB - TI) * PX, w: chH * PX, h: k.h * PX, m: "e" },  // 东壁竖条
      { x: (chH - TI) * PX, y: (yB + th) * PX, w: k.w * PX, h: yF * PX, m: "s" },   // 南壁
      { x: 0, y: (yB - TI) * PX, w: chH * PX, h: k.h * PX, m: "w" }                 // 西壁竖条
    ];
    c.netLayout = { px: PX, ch: chH * PX, kh: k.h * PX, topX: topR.x, topY: topR.y, topW: topR.w, topH: topR.h };

    /* 原始比例放置 × 缩放/偏移/旋转可调，绝不拉伸变形：
     * fit=contain 完整放入模板（默认）；fit=cover 铺满模板（裁掉超出部分） */
    /* 原始比例放置 × 缩放/偏移/旋转可调，绝不拉伸变形：
     * fit=top（默认）与仅顶面画面一致，余出部分包四壁；
     * fit=contain 完整放入模板；fit=cover 铺满模板 */
    const fit = (d && d.img && d.img.fit) || "top";
    let fitS;
    if (fit === "contain") fitS = Math.min(NW / img.naturalWidth, NH / img.naturalHeight);
    else if (fit === "cover") fitS = Math.max(NW / img.naturalWidth, NH / img.naturalHeight);
    else fitS = Math.max(topR.w / img.naturalWidth, topR.h / img.naturalHeight);
    const s = fitS * ((d && d.img && d.img.scale) || 1);
    g.save();
    g.translate(topR.x + topR.w / 2 + ((d && d.img && d.img.ox) || 0) * topR.w,
                topR.y + topR.h / 2 + ((d && d.img && d.img.oy) || 0) * topR.h);
    g.rotate(((d && d.img && d.img.rot) || 0) * Math.PI / 180);
    g.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2,
                img.naturalWidth * s, img.naturalHeight * s);
    g.restore();

    /* 顶面区域 → 顶面纹理（真实顶面尺寸 tw × th） */
    if (c.texCanvas.width !== topR.w || c.texCanvas.height !== topR.h) {
      c.texCanvas.width = topR.w; c.texCanvas.height = topR.h;
    }
    const gt = c.texCanvas.getContext("2d");
    gt.clearRect(0, 0, topR.w, topR.h);
    gt.drawImage(net, topR.x, topR.y, topR.w, topR.h, 0, 0, topR.w, topR.h);

    /* 图例印在展开图的顶面区域（随包裹出现在键帽顶面） */
    const legend = d && d.legend != null ? d.legend : k.label;
    if (legend) {
      const bg = d.bg || "#e9ecf5";
      const color = (d && d.legendColor) || (Render.luminance(bg) > 0.55 ? "#3a3d46" : "#e8eaf2");
      const fs = Math.min(topR.h * 0.36 * ((d && d.legendSize) || 1), 0.28 * PXU);
      gt.fillStyle = color;
      gt.font = `600 ${Math.max(8, fs)}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
      gt.textAlign = "left";
      gt.textBaseline = "top";
      const pad = Math.min(topR.w, topR.h) * 0.11;
      gt.fillText(legend, pad, pad * 0.9);
    }

    /* 顶面光影 */
    gt.save();
    roundRect(gt, 0, 0, topR.w, topR.h, 0.10 * PXU);
    gt.clip();
    const gr = gt.createLinearGradient(0, 0, 0, topR.h);
    gr.addColorStop(0, "rgba(255,255,255,0.13)");
    gr.addColorStop(0.55, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.07)");
    gt.fillStyle = gr;
    gt.fillRect(0, 0, topR.w, topR.h);
    gt.restore();

    c.tex.needsUpdate = true;

    /* 四壁区域 → 侧面纹理（折叠刚体变换：北壁竖直翻转，东/西壁转置铺平） */
    sideR.forEach((r, j) => {
      const cv = c.sideTexs[j].image;
      const tp = r.m === "e" || r.m === "w";
      const rw = Math.max(4, Math.round(tp ? r.h : r.w));
      const rh = Math.max(4, Math.round(tp ? r.w : r.h));
      if (cv.width !== rw || cv.height !== rh) { cv.width = rw; cv.height = rh; }
      const gg = cv.getContext("2d");
      gg.clearRect(0, 0, rw, rh);
      gg.save();
      if (r.m === "n") {
        gg.translate(0, rh); gg.scale(1, -1);          // 折痕在下缘 → 接缝翻到纹理上缘
        gg.drawImage(net, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      } else if (r.m === "s") {
        gg.drawImage(net, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      } else if (r.m === "e") {
        gg.transform(0, 1, 1, 0, 0, 0);                // 竖条转置：折痕(左缘)→纹理上缘
        gg.drawImage(net, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      } else {
        gg.transform(0, -1, -1, 0, rw, rh);            // 西条：折痕(右缘)→纹理上缘
        gg.drawImage(net, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      }
      gg.restore();
      /* 烘焙侧面明暗（Basic 材质无灯光） */
      gg.fillStyle = "rgba(0,0,0," + (-SIDE_SHADE[j] / 100) + ")";
      gg.fillRect(0, 0, rw, rh);
      c.sideTexs[j].needsUpdate = true;
      if (c.sideMats[j].map !== c.sideTexs[j]) {
        c.sideMats[j].map = c.sideTexs[j];
        c.sideMats[j].needsUpdate = true;
      }
      c.sideMats[j].color.set(0xffffff);
    });
  }

  _clearSideWrap(c, d) {
    c.sideMats.forEach((m, j) => {
      if (m.map) { m.map = null; m.needsUpdate = true; }
      m.color.set(Render.shade((d && d.bg) || "#e9ecf5", SIDE_SHADE[j]));
    });
    c.wrapState = false;
  }

  /* ----- 取模预览：返回当前键帽的十字展开图与布局 ----- */
  getNetCanvas() {
    const c = this.single ? this._singleCap : this.caps[this.selected];
    return (c && c.netCanvas && c.netCanvas.width > 8) ? c.netCanvas : null;
  }

  getNetLayout() {
    const c = this.single ? this._singleCap : this.caps[this.selected];
    return (c && c.netLayout) ? c.netLayout : null;
  }

  _updateCamera() {
    const cw = this.canvas.clientWidth, chh = this.canvas.clientHeight;
    if (cw < 4 || chh < 4) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(chh * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(cw, chh, false);
      this.camera.aspect = cw / chh;
      this.camera.updateProjectionMatrix();
    }

    let target, radius;
    if (this.single) {
      const k = this._targetKey;
      if (!k) return;
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
  }

  _frame() {
    if (this.single && !this._targetKey) return;
    if (this.autorotate && !this._dragging && Date.now() > this._idleUntil) {
      this.orbit.yaw += 0.006;
    }
    this._refreshCaps();
    this._updateCamera();
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
        this.orbit.elev = Math.max(0.12, Math.min(1.42, this.orbit.elev + dy * 0.005));
        this._idleUntil = Date.now() + 2400;
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
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w * scale, h * scale, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._refreshCaps();
    this._updateCamera();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/png");
    this.renderer.setPixelRatio(dpr);
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

window.Preview3D = { createBoardView, createSingleView, TI };
})();
