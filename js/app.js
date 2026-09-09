/* =========================================================
 * 主逻辑：状态、交互（平面 / 3D 双模式）、面板、导入导出、存档
 * ========================================================= */

(() => {
  "use strict";

  /* ---------- 状态 ---------- */
  const state = {
    layoutName: "60",
    customRows: null,      // KLE 导入时保存原始 rows
    keys: [],
    designs: {},           // index -> design
    selected: null,
    hover: null,
    plateColor: "#23252f",
    mode: "flat",          // flat | 3d
    orbit: { yaw: 0.5, elev: 0.9, zoom: 1 },
    designVersion: 0,      // 设计变更计数（用于 3D 顶面纹理缓存失效）
    dragging: false,
    _down: null,
    _cssW: 0,
    _cssH: 0
  };

  const imgCache = new Map();   // dataURL -> HTMLImageElement
  const SAVE_KEY = "keycap-diy-v1";

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const scrollWrap = $("canvasScroll");
  const hintbar = document.querySelector(".hintbar");

  const HINT_FLAT = "单击选中键帽<i>·</i>双击 / 拖入图片上传<i>·</i>拖拽移动图片<i>·</i>滚轮缩放图片<i>·</i>Ctrl+V 粘贴图片到选中键";
  const HINT_3D = "拖拽旋转视角<i>·</i>滚轮缩放<i>·</i>点击选中键帽，右侧面板实时生效<i>·</i>导出整盘 PNG 可导出当前 3D 视角";

  let U = 56;            // 平面模式：每单位像素（CSS 像素）
  let PAD = 36;
  let dirty = true;

  /* ---------- 工具 ---------- */
  function markDirty() { dirty = true; }

  function getImg(data) {
    if (!imgCache.has(data)) {
      const el = new Image();
      el.onload = markDirty;
      el.src = data;
      imgCache.set(data, el);
    }
    return imgCache.get(data);
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function debounce(fn, ms) {
    let timer;
    return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
  }
  const autosave = debounce(saveProjectLocal, 400);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 设计数据 ---------- */
  const MOD_LABELS = new Set([
    "Esc", "Tab", "Caps Lock", "Enter", "Shift", "Backspace", "Ctrl", "Win",
    "Alt", "Fn", "Menu", "Insert", "Ins", "Home", "PgUp", "Delete", "Del",
    "End", "PgDn", "PrtSc", "Scroll Lock", "Pause", "Num Lock", "↑", "↓", "←", "→"
  ]);

  function defaultDesign(key) {
    const isMod = key.w > 1 || key.h > 1 || MOD_LABELS.has(key.label);
    return {
      bg: isMod ? "#ccd1dd" : "#eef0f6",
      legend: key.label,
      legendColor: null,     // null = 自动对比色
      legendSize: 1,
      img: null              // {data, scale, rot, ox, oy}
    };
  }

  /* ---------- 布局构建 ---------- */
  function buildLayout(rows, layoutName, keepDesigns) {
    const oldKeys = state.keys;
    const oldDesigns = state.designs;

    state.customRows = layoutName === "custom" ? rows : null;
    state.layoutName = layoutName;
    state.keys = parseKLE(rows);
    state.designs = {};
    state.keys.forEach((k, i) => { state.designs[i] = defaultDesign(k); });

    /* 尽量按 键名+尺寸 迁移旧设计 */
    if (keepDesigns) {
      state.keys.forEach((k, i) => {
        const oi = oldKeys.findIndex(o => o.label === k.label && o.w === k.w && o.h === k.h && oldDesigns[oldKeys.indexOf(o)]);
        if (oi >= 0 && oldDesigns[oi]) {
          const d = oldDesigns[oi];
          state.designs[i] = { ...state.designs[i], bg: d.bg, legendColor: d.legendColor, legendSize: d.legendSize, legend: d.legend, img: d.img };
          delete oldDesigns[oi];
        }
      });
    }

    state.selected = null;
    state.designVersion++;
    fitCanvas();
    syncPanel();
    markDirty();
  }

  /* ---------- 画布尺寸 ---------- */
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    let cssW, cssH;

    if (state.mode === "3d") {
      cssW = Math.max(320, scrollWrap.clientWidth - 48);
      cssH = Math.max(260, scrollWrap.clientHeight - 48);
    } else {
      const { W, H } = layoutBounds(state.keys);
      const cw = scrollWrap.clientWidth - PAD * 2;
      U = Math.max(24, Math.min(96, cw / W));
      cssW = W * U + PAD * 2;
      cssH = H * U + PAD * 2;
      PAD = Math.min(36, U * 0.6);
    }

    state._cssW = cssW;
    state._cssH = cssH;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    markDirty();
  }

  /* ---------- 3D 取景（透视） ---------- */
  function compute3DFit(cssW, cssH) {
    const { W, H } = layoutBounds(state.keys);
    const dist = Preview3D.distFor(W, H);
    const pm = 0.35, top = 0.65, bot = -0.4;
    const P = Preview3D.makeProjector(state.orbit.yaw, state.orbit.elev, 1, 0, 0, dist);
    const cs = [
      [-pm, -pm, top], [W + pm, -pm, top], [W + pm, H + pm, top], [-pm, H + pm, top],
      [-pm, -pm, bot], [W + pm, -pm, bot], [W + pm, H + pm, bot], [-pm, H + pm, bot]
    ].map(c => P(c[0], c[1], c[2]));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((cssW - 24) / (maxX - minX), (cssH - 24) / (maxY - minY));
    return {
      scale, dist,
      cx: cssW / 2 - (minX + maxX) / 2 * scale,
      cy: cssH / 2 - (minY + maxY) / 2 * scale
    };
  }

  function curProjector() {
    const fit = compute3DFit(state._cssW, state._cssH);
    return Preview3D.makeProjector(
      state.orbit.yaw, state.orbit.elev,
      fit.scale * state.orbit.zoom, fit.cx, fit.cy, fit.dist
    );
  }

  /* ---------- 绘制循环 ---------- */
  function frame() {
    if (dirty) {
      dirty = false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, state._cssW, state._cssH);

      if (state.mode === "3d") {
        const fit = compute3DFit(state._cssW, state._cssH);
        Preview3D.render(ctx, state.keys, state.designs, {
          yaw: state.orbit.yaw,
          elev: state.orbit.elev,
          scale: fit.scale * state.orbit.zoom,
          cx: fit.cx,
          cy: fit.cy,
          dist: fit.dist,
          plateColor: state.plateColor,
          selectedIndex: state.selected,
          getImg,
          version: state.designVersion
        });
      } else {
        ctx.save();
        ctx.translate(PAD, PAD);
        Render.drawBoard(ctx, state.keys, state.designs, {
          U,
          plateColor: state.plateColor,
          selectedIndex: state.selected,
          hoverIndex: state.hover,
          getImg
        });
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 命中检测（平面） ---------- */
  function keyAt(px, py) {
    for (let i = state.keys.length - 1; i >= 0; i--) {
      const k = state.keys[i];
      if (px >= k.x * U && px <= (k.x + k.w) * U && py >= k.y * U && py <= (k.y + k.h) * U) {
        return i;
      }
    }
    return null;
  }

  function pickAt(px, py) {
    return Preview3D.pick(state.keys, px, py, curProjector());
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ---------- 鼠标交互 ---------- */
  canvas.addEventListener("mousedown", e => {
    const p = canvasPos(e);
    if (state.mode === "3d") {
      state._down = { x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    const i = keyAt(p.x, p.y);
    if (i == null) return;
    state.selected = i;
    state.dragging = true;
    state.dragMoved = false;
    state._last = { x: p.x - PAD, y: p.y - PAD };
    syncPanel();
    markDirty();
  });

  window.addEventListener("mousemove", e => {
    if (state.mode === "3d") {
      if (state._down) {
        const dx = e.clientX - state._down.x;
        const dy = e.clientY - state._down.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) state._down.moved = true;
        state.orbit.yaw += dx * 0.006;
        state.orbit.elev = clamp(state.orbit.elev + dy * 0.006, 0.12, 1.45);
        state._down.x = e.clientX;
        state._down.y = e.clientY;
        markDirty();
      }
      return;
    }

    if (state.dragging && state.selected != null) {
      const p = canvasPos(e);
      const px = p.x - PAD, py = p.y - PAD;
      const dx = px - state._last.x;
      const dy = py - state._last.y;
      state._last = { x: px, y: py };
      const d = state.designs[state.selected];
      if (d && d.img) {
        const g = Render.capGeom(state.keys[state.selected], U);
        d.img.ox = clamp((d.img.ox || 0) + dx / g.tw, -1.5, 1.5);
        d.img.oy = clamp((d.img.oy || 0) + dy / g.th, -1.5, 1.5);
        state.dragMoved = true;
        syncImageSliders(d.img);
        markDirty();
        autosave();
      }
      return;
    }

    /* hover */
    if (e.target === canvas) {
      const p = canvasPos(e);
      const i = keyAt(p.x - PAD, p.y - PAD);
      if (i !== state.hover) { state.hover = i; markDirty(); }
    } else if (state.hover != null) {
      state.hover = null; markDirty();
    }
  });

  window.addEventListener("mouseup", e => {
    if (state.mode === "3d") {
      if (state._down && !state._down.moved) {
        const p = canvasPos(e);
        const i = pickAt(p.x, p.y);
        state.selected = i;
        syncPanel();
        markDirty();
      }
      state._down = null;
    }
    state.dragging = false;
  });

  canvas.addEventListener("wheel", e => {
    if (state.mode === "3d") {
      e.preventDefault();
      state.orbit.zoom = clamp(state.orbit.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 3);
      markDirty();
      return;
    }
    const p = canvasPos(e);
    const i = keyAt(p.x - PAD, p.y - PAD);
    if (i == null) return;
    const d = state.designs[i];
    if (d && d.img) {
      e.preventDefault();
      state.selected = i;
      d.img.scale = clamp((d.img.scale || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.2, 4);
      syncPanel();
      markDirty();
      autosave();
    }
  }, { passive: false });

  canvas.addEventListener("dblclick", e => {
    const p = canvasPos(e);
    const i = state.mode === "3d" ? pickAt(p.x, p.y) : keyAt(p.x - PAD, p.y - PAD);
    if (i != null) {
      state.selected = i;
      syncPanel();
      $("imgInput").click();
    }
  });

  /* 拖放图片 */
  canvas.addEventListener("dragover", e => e.preventDefault());
  canvas.addEventListener("drop", e => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const p = canvasPos(e);
    const i = state.mode === "3d" ? pickAt(p.x, p.y) : keyAt(p.x - PAD, p.y - PAD);
    if (i != null) applyImageFile(file, i);
  });

  /* Ctrl+V 粘贴图片 */
  window.addEventListener("paste", e => {
    if (state.selected == null) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        applyImageFile(it.getAsFile(), state.selected);
        e.preventDefault();
        break;
      }
    }
  });

  /* ---------- 图片应用 ---------- */
  function applyImageFile(file, index) {
    const reader = new FileReader();
    reader.onload = () => {
      const d = state.designs[index] || (state.designs[index] = defaultDesign(state.keys[index]));
      d.img = { data: reader.result, scale: 1, rot: 0, ox: 0, oy: 0 };
      state.designVersion++;
      state.selected = index;
      syncPanel();
      markDirty();
      autosave();
      toast("图片已应用到键帽");
    };
    reader.readAsDataURL(file);
  }

  $("btnUpload").addEventListener("click", () => $("imgInput").click());
  $("imgInput").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f && state.selected != null) applyImageFile(f, state.selected);
    e.target.value = "";
  });

  $("btnRemoveImg").addEventListener("click", () => {
    const d = curDesign(); if (!d) return;
    d.img = null;
    state.designVersion++;
    syncPanel(); markDirty(); autosave();
  });

  /* ---------- 面板同步 ---------- */
  function curDesign() {
    return state.selected != null ? state.designs[state.selected] : null;
  }

  function keySizeText(k) {
    const u = k.w === 1 && k.h === 1 ? "1u" : `${k.w}u${k.h > 1 ? ` × ${k.h}u 高` : ""}`;
    return `${u} · ${Math.round(k.w * 19.05 * 10) / 10}mm 键距标准`;
  }

  function syncPanel() {
    const i = state.selected;
    const has = i != null && state.keys[i];
    $("panelEmpty").style.display = has ? "none" : "";
    $("panelBody").style.display = has ? "" : "none";
    if (!has) return;

    const k = state.keys[i];
    const d = state.designs[i];
    $("keyTitle").textContent = k.label || "（空格 / 无图例键）";
    $("keySub").textContent = keySizeText(k);

    $("keyBg").value = d.bg;
    $("legendText").value = d.legend || "";
    $("legendSize").value = d.legendSize || 1;
    $("legendSizeVal").textContent = (d.legendSize || 1).toFixed(2) + "x";
    $("legendColor").value = d.legendColor || (Render.luminance(d.bg) > 0.55 ? "#3a3d46" : "#e8eaf2");

    const hasImg = !!d.img;
    $("imgControls").style.display = hasImg ? "" : "none";
    if (hasImg) syncImageSliders(d.img);
  }

  function syncImageSliders(img) {
    $("imgScale").value = img.scale;
    $("imgScaleVal").textContent = img.scale.toFixed(2) + "x";
    $("imgRot").value = img.rot;
    $("imgRotVal").textContent = Math.round(img.rot) + "°";
    $("imgX").value = img.ox;
    $("imgXVal").textContent = img.ox.toFixed(2);
    $("imgY").value = img.oy;
    $("imgYVal").textContent = img.oy.toFixed(2);
  }

  /* ---------- 控件绑定 ---------- */
  function bindDesign(field, el) {
    el.addEventListener("input", () => {
      const d = curDesign(); if (!d) return;
      field(d, el);
      state.designVersion++;
      markDirty();
      autosave();
    });
  }

  bindDesign((d, el) => { d.bg = el.value; }, $("keyBg"));
  bindDesign((d, el) => { d.legend = el.value; }, $("legendText"));
  bindDesign((d, el) => { d.legendSize = +el.value; $("legendSizeVal").textContent = (+el.value).toFixed(2) + "x"; }, $("legendSize"));
  bindDesign((d, el) => { d.legendColor = el.value; }, $("legendColor"));
  $("legendAuto").addEventListener("click", () => {
    const d = curDesign(); if (!d) return;
    d.legendColor = null;
    $("legendColor").value = Render.luminance(d.bg) > 0.55 ? "#3a3d46" : "#e8eaf2";
    markDirty(); autosave();
    toast("图例颜色已恢复自动配色");
  });

  bindDesign((d, el) => { if (d.img) { d.img.scale = +el.value; $("imgScaleVal").textContent = (+el.value).toFixed(2) + "x"; } }, $("imgScale"));
  bindDesign((d, el) => { if (d.img) { d.img.rot = +el.value; $("imgRotVal").textContent = Math.round(+el.value) + "°"; } }, $("imgRot"));
  bindDesign((d, el) => { if (d.img) { d.img.ox = +el.value; $("imgXVal").textContent = (+el.value).toFixed(2); } }, $("imgX"));
  bindDesign((d, el) => { if (d.img) { d.img.oy = +el.value; $("imgYVal").textContent = (+el.value).toFixed(2); } }, $("imgY"));

  $("plateColor").addEventListener("input", e => {
    state.plateColor = e.target.value;
    markDirty(); autosave();
  });

  /* ---------- 模式切换 ---------- */
  $("btn3d").addEventListener("click", () => {
    state.mode = state.mode === "3d" ? "flat" : "3d";
    $("btn3d").classList.toggle("active", state.mode === "3d");
    $("btn3d").textContent = state.mode === "3d" ? "返回平面" : "3D 预览";
    hintbar.innerHTML = state.mode === "3d" ? HINT_3D : HINT_FLAT;
    fitCanvas();
  });

  /* ---------- 快捷操作 ---------- */
  $("btnApplyAll").addEventListener("click", () => {
    const d = curDesign(); if (!d) return;
    const snapshot = JSON.parse(JSON.stringify({ bg: d.bg, legend: d.legend, legendColor: d.legendColor, legendSize: d.legendSize, img: d.img }));
    state.keys.forEach((k, i) => {
      state.designs[i] = {
        bg: snapshot.bg,
        legend: k.label || snapshot.legend,
        legendColor: snapshot.legendColor,
        legendSize: snapshot.legendSize,
        img: snapshot.img ? { ...snapshot.img } : null
      };
    });
    state.designVersion++;
    markDirty(); autosave();
    toast("已应用到全部键帽");
  });

  $("btnResetKey").addEventListener("click", () => {
    if (state.selected == null) return;
    state.designs[state.selected] = defaultDesign(state.keys[state.selected]);
    state.designVersion++;
    syncPanel(); markDirty(); autosave();
  });

  $("btnClear").addEventListener("click", () => {
    state.keys.forEach((k, i) => { state.designs[i] = defaultDesign(k); });
    state.designVersion++;
    markDirty(); autosave();
    toast("已清空全部设计");
  });

  /* ---------- 布局切换 / KLE 导入 ---------- */
  $("layoutSelect").addEventListener("change", e => {
    buildLayout(getLayoutRows(e.target.value), e.target.value, true);
  });

  $("btnImportKLE").addEventListener("click", () => $("kleInput").click());
  $("kleInput").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let rows = JSON.parse(reader.result);
        if (!Array.isArray(rows)) {
          rows = rows.keys || rows.rows;
        }
        if (!Array.isArray(rows) || !rows.some(r => Array.isArray(r))) {
          throw new Error("格式不符");
        }
        let opt = $("layoutSelect").querySelector('option[value="custom"]');
        if (!opt) {
          $("layoutSelect").insertAdjacentHTML("beforeend", `<option value="custom">KLE 自定义布局</option>`);
        }
        buildLayout(rows, "custom", true);
        $("layoutSelect").value = "custom";
        toast("KLE 布局导入成功");
      } catch (err) {
        toast("导入失败：请提供 KLE 标准 JSON（二维数组）");
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  });

  /* ---------- 导出 ---------- */
  function downloadCanvas(cv, name) {
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = name;
    a.click();
  }

  $("btnExportBoard").addEventListener("click", () => {
    if (state.mode === "3d") {
      exportBoard3D();
      return;
    }
    const { W, H } = layoutBounds(state.keys);
    const eu = 200, pad = eu * 0.6;
    const cv = document.createElement("canvas");
    cv.width = W * eu + pad * 2;
    cv.height = H * eu + pad * 2;
    const c = cv.getContext("2d");
    c.translate(pad, pad);
    Render.drawBoard(c, state.keys, state.designs, {
      U: eu, plateColor: state.plateColor, getImg, exportMode: true
    });
    downloadCanvas(cv, `keycap-board-${state.keys.length}keys.png`);
    toast("整盘 PNG 已导出");
  });

  function exportBoard3D() {
    const { W, H } = layoutBounds(state.keys);
    const S = 260, m = 80, pm = 0.35, top = 0.65, bot = -0.4;
    const dist = Preview3D.distFor(W, H);
    const P0 = Preview3D.makeProjector(state.orbit.yaw, state.orbit.elev, S, 0, 0, dist);
    const cs = [
      [-pm, -pm, top], [W + pm, -pm, top], [W + pm, H + pm, top], [-pm, H + pm, top],
      [-pm, -pm, bot], [W + pm, -pm, bot], [W + pm, H + pm, bot], [-pm, H + pm, bot]
    ].map(c => P0(c[0], c[1], c[2]));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const cv = document.createElement("canvas");
    cv.width = Math.ceil(maxX - minX) + m * 2;
    cv.height = Math.ceil(maxY - minY) + m * 2;
    const c = cv.getContext("2d");
    Preview3D.render(c, state.keys, state.designs, {
      yaw: state.orbit.yaw,
      elev: state.orbit.elev,
      scale: S,
      cx: m - minX,
      cy: m - minY,
      dist,
      plateColor: state.plateColor,
      getImg,
      version: state.designVersion
    });
    downloadCanvas(cv, `keycap-board-3d-${state.keys.length}keys.png`);
    toast("3D 视角整盘 PNG 已导出");
  }

  $("btnExportKey").addEventListener("click", () => {
    const i = state.selected;
    if (i == null) { toast("请先选中一个键帽"); return; }
    const k = state.keys[i];
    const eu = 512, pad = eu * 0.5;
    const cv = document.createElement("canvas");
    cv.width = k.w * eu + pad * 2;
    cv.height = k.h * eu + pad * 2;
    const c = cv.getContext("2d");
    c.translate(pad, pad);
    Render.drawKey(c, k, state.designs[i], { U: eu, getImg, exportMode: true });
    const name = (k.label || "space").replace(/[\\/:*?"<>|]/g, "_");
    downloadCanvas(cv, `keycap-${name}-${k.w}u.png`);
    toast("键帽 PNG 已导出");
  });

  /* ---------- 工程保存 / 载入 ---------- */
  function serialize() {
    const designs = {};
    for (const [i, d] of Object.entries(state.designs)) {
      designs[i] = {
        bg: d.bg, legend: d.legend, legendColor: d.legendColor,
        legendSize: d.legendSize, img: d.img || null
      };
    }
    return {
      v: 1,
      layoutName: state.layoutName,
      customRows: state.customRows,
      plateColor: state.plateColor,
      designs
    };
  }

  function saveProjectLocal() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (e) { /* 容量超限时忽略 */ }
  }

  function restoreProject(obj) {
    if (!obj || !obj.designs) return false;
    if (obj.customRows) buildLayout(obj.customRows, "custom", false);
    else buildLayout(getLayoutRows(obj.layoutName || "60"), obj.layoutName || "60", false);
    state.plateColor = obj.plateColor || "#23252f";
    $("plateColor").value = state.plateColor;
    for (const [i, d] of Object.entries(obj.designs)) {
      const idx = +i;
      if (idx < state.keys.length) {
        const base = defaultDesign(state.keys[idx]);
        state.designs[idx] = { ...base, ...d };
      }
    }
    state.designVersion++;
    markDirty();
    return true;
  }

  $("btnSave").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "keycap-project.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("工程文件已保存");
  });

  $("btnLoad").addEventListener("click", () => $("projInput").click());
  $("projInput").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (restoreProject(JSON.parse(reader.result))) toast("工程已载入");
        else toast("工程文件格式不正确");
      } catch { toast("工程文件解析失败"); }
    };
    reader.readAsText(f);
    e.target.value = "";
  });

  /* ---------- 单键 3D 预览卡 ---------- */
  const k3 = { yaw: 0.7, elev: 0.72, zoom: 1, dragging: false, last: null };
  const k3Canvas = $("key3d");
  const k3Ctx = k3Canvas.getContext("2d");
  let k3Timer = 0;   // 交互后暂停自动旋转

  function drawKey3d() {
    const i = state.selected;
    const show = i != null;
    $("key3dEmpty").style.display = show ? "none" : "";
    k3Canvas.style.display = show ? "" : "none";
    $("btnExportKey3d").disabled = !show;
    if (!show) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = k3Canvas.clientWidth, ch = k3Canvas.clientHeight;
    if (cw < 10 || ch < 10) return;
    if (k3Canvas.width !== Math.round(cw * dpr) || k3Canvas.height !== Math.round(ch * dpr)) {
      k3Canvas.width = Math.round(cw * dpr);
      k3Canvas.height = Math.round(ch * dpr);
    }
    const g = k3Ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);

    const k = state.keys[i], d = state.designs[i];
    const dist = 5.5;

    /* 取景：投影包围盒自适应 */
    const ext = 1.0;
    const P0 = Preview3D.makeProjector(k3.yaw, k3.elev, 1, 0, 0, dist);
    const cs = [
      [k.x - ext, k.y - ext, 0.65], [k.x + k.w + ext, k.y - ext, 0.65],
      [k.x + k.w + ext, k.y + k.h + ext, 0.65], [k.x - ext, k.y + k.h + ext, 0.65],
      [k.x - ext, k.y - ext, -0.6], [k.x + k.w + ext, k.y - ext, -0.6],
      [k.x + k.w + ext, k.y + k.h + ext, -0.6], [k.x - ext, k.y + k.h + ext, -0.6]
    ].map(c => P0(c[0], c[1], c[2]));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const focal = Math.min(cw / bw, ch / bh) * 0.88 * k3.zoom;

    Preview3D.renderSingle(g, k, d, {
      yaw: k3.yaw,
      elev: k3.elev,
      focal,
      cx: cw / 2,
      cy: ch / 2,
      dist,
      plateColor: state.plateColor,
      getImg,
      version: state.designVersion,
      cacheKey: "s" + i
    });
  }

  function loop3d() {
    const i = state.selected;
    if (i != null) {
      if (!k3.dragging && Date.now() > k3Timer) k3.yaw += 0.006;   // 空闲自动旋转
      drawKey3d();
    }
    requestAnimationFrame(loop3d);
  }

  k3Canvas.addEventListener("mousedown", e => {
    k3.dragging = true;
    k3.last = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mousemove", e => {
    if (!k3.dragging) return;
    k3.yaw += (e.clientX - k3.last.x) * 0.008;
    k3.elev = clamp(k3.elev + (e.clientY - k3.last.y) * 0.008, 0.1, 1.45);
    k3.last = { x: e.clientX, y: e.clientY };
    k3Timer = Date.now() + 2400;
  });
  window.addEventListener("mouseup", () => { k3.dragging = false; });
  k3Canvas.addEventListener("wheel", e => {
    e.preventDefault();
    k3.zoom = clamp(k3.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.5, 2.2);
    k3Timer = Date.now() + 2400;
  }, { passive: false });

  $("btnExportKey3d").addEventListener("click", () => {
    const i = state.selected;
    if (i == null) { toast("请先选中一个键帽"); return; }
    const k = state.keys[i];
    const S = 720, m = 70, ext = 1.0, dist = 5.5;
    const P0 = Preview3D.makeProjector(k3.yaw, k3.elev, S, 0, 0, dist);
    const cs = [
      [k.x - ext, k.y - ext, 0.65], [k.x + k.w + ext, k.y - ext, 0.65],
      [k.x + k.w + ext, k.y + k.h + ext, 0.65], [k.x - ext, k.y + k.h + ext, 0.65],
      [k.x - ext, k.y - ext, -0.6], [k.x + k.w + ext, k.y - ext, -0.6],
      [k.x + k.w + ext, k.y + k.h + ext, -0.6], [k.x - ext, k.y + k.h + ext, -0.6]
    ].map(c => P0(c[0], c[1], c[2]));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(maxX - minX) + m * 2;
    cv.height = Math.ceil(maxY - minY) + m * 2;
    Preview3D.renderSingle(cv.getContext("2d"), k, state.designs[i], {
      yaw: k3.yaw,
      elev: k3.elev,
      focal: S,
      cx: m - minX,
      cy: m - minY,
      dist,
      plateColor: state.plateColor,
      getImg,
      version: state.designVersion,
      cacheKey: "s" + i
    });
    const name = (k.label || "space").replace(/[\\/:*?"<>|]/g, "_");
    downloadCanvas(cv, `keycap-3d-${name}.png`);
    toast("单键 3D PNG 已导出");
  });

  /* ---------- 初始化 ---------- */
  window.addEventListener("resize", debounce(fitCanvas, 150));

  buildLayout(getLayoutRows("60"), "60", false);
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) restoreProject(JSON.parse(saved));
  } catch { /* 忽略 */ }
  hintbar.innerHTML = HINT_FLAT;
  fitCanvas();
  requestAnimationFrame(frame);
  requestAnimationFrame(loop3d);
})();
