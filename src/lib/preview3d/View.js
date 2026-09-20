/* =========================================================
 * 通用视图：渲染循环 / 相机轨道 / 分层拆解 / 拾取 / 截图
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";
import { layoutBounds, keycapProfileFor } from "../layout.js";
import { PXU, FOV, FLOAT, EXPLODE_STEP, EXPLODE_LAYERS, EXPLODE_NAMES, BP, STEM, ACCENT, MX, MX_Y, LOWER_H } from "./spec.js";
import { makeCapTexture, makeStudioEnv } from "./textures.js";
import { netDims, drawNetCanvas } from "./paper.js";
import { capGeometry } from "./capGeometry.js";
import { wedgeGeo, wedgeInstances } from "./deform.js";
import { buildCase } from "./caseAssembly.js";

/* ---------- 通用视图 ---------- */
export class View {
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
    this.explode = false;          // 分层拆解开关（整盘视图）
    this.explodeGap = 1;           // 层间距倍数
    this._ex = 0;                  // 当前展开量 0..1（缓动插值）
    this._lastSize = null;         // 最近一次可用的画布尺寸（导出时画布若被隐藏用于兜底）
    this._stepWritten = -1;        // 上次写进矩阵的每层抬升量（用于层距改动即时生效）
    this._layerObjs = [];          // [物件, 原始矩阵, 层号]
    this._layerVis = null;         // 各层显示开关（null = 全显）
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
    this._layerObjs = [];
    for (const m of [this._plate, this._case].concat(this._rims, this._parts)) {
      if (m.isInstancedMesh) wedgeInstances(m, body.wedge);
      else wedgeGeo(m.geometry, body.wedge, m.position.y, m.position.z);
      m.updateMatrix();
      m.matrixAutoUpdate = false;      // 静态件：几何即世界坐标，冻结矩阵
      m.matrix.premultiply(this._rest);
      this._group.add(m);
      this._tag(m, m === this._plate ? "plate"
        : (this._rims.indexOf(m) >= 0 ? "rims" : (m.userData.layer || "bottom")));
    }

    keys.forEach((k, i) => this._buildCap(k, designs[i], i, k.x, k.y, false));
    this._buildStems(keys);
    this._ex = this.explode ? 1 : 0;
    this._writeExplode();              // 重建后保持当前展开量
    this._applyLayerVis();             // 重建后保持各层显示开关
    this._needsRender = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /* ----- 分层拆解 ----- */
  /* 登记一个分层件：记住它的原始世界矩阵，展开时在它前面左乘一个竖直位移 */
  _tag(obj, layer) {
    this._layerObjs.push([obj, obj.matrix.clone(), EXPLODE_LAYERS[layer] || 0]);
    return obj;
  }

  /* 按当前展开量重写所有分层件的矩阵（层号越大抬得越高） */
  _writeExplode() {
    const step = EXPLODE_STEP * this.explodeGap * this._ex;
    this._stepWritten = step;
    if (!this._layerObjs.length) return;
    for (const [obj, base, li] of this._layerObjs) {
      const dy = step * li;
      if (dy === 0) obj.matrix.copy(base);
      else obj.matrix.makeTranslation(0, dy, 0).multiply(base);
      obj.matrixWorldNeedsUpdate = true;
    }
    this._group.updateMatrixWorld(true);
  }

  /* 展开/收起的缓动；返回本帧是否有变化 */
  _applyExplode() {
    if (this.single || !this._layerObjs.length) return false;
    const want = this.explode ? 1 : 0;
    let moving = false;
    if (Math.abs(this._ex - want) > 1e-4) {
      this._ex += (want - this._ex) * 0.18;
      if (Math.abs(want - this._ex) < 0.002) this._ex = want;
      moving = true;
    }
    /* 层距（explodeGap）改动同样要立刻重写，不能只在展开量变化时重写 */
    const step = EXPLODE_STEP * this.explodeGap * this._ex;
    if (!moving && step === this._stepWritten) return false;
    this._writeExplode();
    this.renderer.shadowMap.needsUpdate = true;
    return true;
  }

  /* 各层显示开关：map = { 层名: false } 的隐藏表（缺省/true 为显示） */
  setLayerVisible(map) {
    this._layerVis = { ...(map || {}) };
    this._applyLayerVis();
    this._needsRender = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  _applyLayerVis() {
    const v = this._layerVis;
    if (!v || !this._layerObjs.length) return;
    for (const [obj, , li] of this._layerObjs) {
      obj.visible = v[EXPLODE_NAMES[li]] !== false;
    }
  }

  /* 分层展开开关（gap：层间距倍数） */
  setExplode(on, gap) {
    this.explode = !!on;
    if (gap != null) this.explodeGap = Math.max(0.3, Math.min(2.5, +gap || 1));
    this._idleUntil = Date.now() + 2400;
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

    /* 整盘视图也带上轴心柱 + 十字插槽：分层拆解后键帽底面是看得见的 */
    const mesh = new THREE.Mesh(capGeometry(k, rowP, dims, true), mat);
    mesh.position.set(px, FLOAT, py);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;   // 静态物件：冻结世界矩阵
    if (this._rest) mesh.matrix.premultiply(this._rest);       // 随外壳落地姿态
    mesh.userData.index = single ? -1 : index;
    this._group.add(mesh);
    if (!single) this._tag(mesh, "cap");

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
    for (const im of this._stems) this._tag(im, "switch");
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
      this._lastSize = [cw, chh];          // 记下可用尺寸，供导出时画布被隐藏的情况兜底
      const dpr = this._dpr();
      if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(chh * dpr)) {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(cw, chh, false);
        this.camera.aspect = cw / chh;
        this.camera.updateProjectionMatrix();
        resized = true;
      }
    }
    this._placeCamera();
    return resized;
  }

  /* 只摆相机（不动画布尺寸）：渲染循环与导出共用 */
  _placeCamera() {
    let target, radius;
    if (this.single) {
      const k = this._targetKey;
      if (!k) return;
      target = new THREE.Vector3(k.w / 2, FLOAT + 0.15, k.h / 2);
      radius = 0.62 * Math.hypot(k.w, k.h) + 0.9;
    } else {
      /* 分层展开：视点抬到拆解堆叠的中部，并适当退远 */
      const ex = this._ex * this.explodeGap;
      target = new THREE.Vector3(this.W / 2, FLOAT + 2.0 * ex, this.H / 2);
      radius = (0.62 * Math.hypot(this.W, this.H) + 1.2) * (1 + 0.18 * ex);
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
    const spinning = this.autorotate && !this._dragging && Date.now() > this._idleUntil;
    let contentDirty = false;
    if (spinning) { this.orbit.yaw += 0.006; this._needsRender = true; }
    if (this._refreshCaps()) { this._needsRender = true; contentDirty = true; }
    if (this._applyExplode()) { this._needsRender = true; contentDirty = true; }
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
    const vis = this.capMeshes.filter(m => m.visible);       // 隐藏的键帽不参与拾取
    const hits = this._raycaster.intersectObjects(vis, false);
    return hits.length ? hits[0].object.userData.index : null;
  }

  /* ----- 高清导出 -----
     scale：倍率；minPx：导出图长边的最小像素（画布本身可能很小，比如单键卡片
     只有一百多像素，这时按比例放大渲染，导出才是高清图）。
     画布被 v-show 隐藏时 clientWidth 为 0，此时用上次记录的可用尺寸兜底，
     否则会 setSize(0,0) —— 既导不出东西，还会把画布弄坏。 */
  snapshot(scale = 2, minPx = 0) {
    let w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) {
      const ls = this._lastSize;
      w = (ls && ls[0]) || 480;
      h = (ls && ls[1]) || 320;
    }
    const s = minPx > 0 ? Math.max(scale, minPx / Math.max(w, h)) : scale;
    const W = Math.max(4, Math.round(w * s)), H = Math.max(4, Math.round(h * s));

    /* 临时按导出尺寸渲染一帧（不走 _updateCamera：它会按 DPR 把尺寸改回去） */
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this._refreshCaps();
    this._placeCamera();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/png");

    /* 还原到正常显示尺寸（画布隐藏时保持导出尺寸，别设成 0） */
    const cw = this.canvas.clientWidth, chh = this.canvas.clientHeight;
    if (cw > 4 && chh > 4) {
      this.renderer.setPixelRatio(this._dpr());
      this.renderer.setSize(cw, chh, false);
      this.camera.aspect = cw / chh;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
    this._needsRender = true;
    return url;
  }
}
