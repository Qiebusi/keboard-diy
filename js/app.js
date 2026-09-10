/* =========================================================
 * 主逻辑：状态、交互（平面 Canvas / 3D Three.js 双模式）、面板、导入导出、存档
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
    profile: "oem",        // 键帽高度档案
    mode: "flat",          // flat | 3d
    designCounter: 0,      // 设计变更计数（per-key .v，驱动 3D 纹理刷新）
    dragging: false
  };

  const imgCache = new Map();   // dataURL -> HTMLImageElement
  const SAVE_KEY = "keycap-diy-v1";

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const canvas = $("board");
  const canvas3d = $("board3d");
  const ctx = canvas.getContext("2d");
  const scrollWrap = $("canvasScroll");
  const hintbar = $("hintbar");

  const HINT_FLAT = "单击选中键帽<i>·</i>双击 / 拖入图片上传<i>·</i>拖拽移动图片<i>·</i>滚轮缩放图片<i>·</i>Ctrl+V 粘贴图片到选中键";
  const HINT_3D = "拖拽旋转视角<i>·</i>滚轮缩放<i>·</i>单击选中 / 双击上传图片<i>·</i>右侧面板实时生效";

  let U = 56;            // 平面模式：每单位像素（CSS 像素）
  let PAD = 36;
  let dirty = true;

  /* Three.js 视图 */
  let P3 = window.Preview3D || null;
  let boardView = null;
  let singleView = null;

  /* ---------- 工具 ---------- */
  function markDirty() { dirty = true; }

  function getImg(data) {
    if (!imgCache.has(data)) {
      const el = new Image();
      el.onload = () => { markDirty(); };
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

  function touchDesign(d) { d.v = ++state.designCounter; }

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
    state.keys.forEach((k, i) => {
      const d = defaultDesign(k);
      touchDesign(d);
      state.designs[i] = d;
    });

    /* 尽量按 键名+尺寸 迁移旧设计 */
    if (keepDesigns) {
      state.keys.forEach((k, i) => {
        const oi = oldKeys.findIndex(o => o.label === k.label && o.w === k.w && o.h === k.h && oldDesigns[oldKeys.indexOf(o)]);
        if (oi >= 0 && oldDesigns[oi]) {
          const d = oldDesigns[oi];
          Object.assign(state.designs[i], {
            bg: d.bg, legendColor: d.legendColor, legendSize: d.legendSize, legend: d.legend, img: d.img
          });
          touchDesign(state.designs[i]);
          delete oldDesigns[oi];
        }
      });
    }

    setSelected(null);
    fitCanvas();
    sync3DViews();
    markDirty();
  }

  /* ---------- 3D 视图 ---------- */
  function initViews() {
    if (!P3) return;
    /* 单键预览画布始终可见，可直接创建；
       board3d 初始 display:none —— WebGL 上下文在隐藏画布上创建会导致
       合成显示异常（画面陈旧/发黑），因此延迟到首次进入 3D 模式再创建 */
    singleView = P3.createSingleView($("key3d"), { getImg });
    if (state.selected != null) {
      singleView.setTarget(state.keys[state.selected], state.designs[state.selected]);
    }
  }

  function ensureBoardView() {
    if (boardView || !P3) return;
    canvas3d.style.width = (scrollWrap.clientWidth - 48) + "px";
    canvas3d.style.height = (scrollWrap.clientHeight - 48) + "px";
    boardView = P3.createBoardView(canvas3d, {
      getImg,
      onPick: i => setSelected(i),
      onDoubleClick: i => {
        if (i != null) {
          setSelected(i);
          $("imgInput").click();
        }
      }
    });
    boardView.setScene(state.keys, state.designs, state.plateColor, state.profile);
    boardView.setSelected(state.selected);
    boardView.setActive(true);
  }

  function sync3DViews() {
    if (!boardView) return;
    boardView.setScene(state.keys, state.designs, state.plateColor, state.profile);
    boardView.setSelected(state.selected);
    boardView.setPlateColor(state.plateColor);
    if (state.selected != null) {
      singleView.setTarget(state.keys[state.selected], state.designs[state.selected],
        keycapProfileFor(state.keys[state.selected], layoutBounds(state.keys).H >= 5.9, state.profile));
    } else {
      singleView.setTarget(null);
    }
  }

  function setSelected(i) {
    state.selected = i;
    syncPanel();
    if (boardView) boardView.setSelected(i == null ? -1 : i);
    if (singleView) {
      singleView.setTarget(i != null ? state.keys[i] : null,
        i != null ? state.designs[i] : null,
        i != null ? keycapProfileFor(state.keys[i], layoutBounds(state.keys).H >= 5.9, state.profile) : undefined);
    }
    markDirty();
  }

  /* ---------- 画布尺寸（平面） ---------- */
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { W, H } = layoutBounds(state.keys);
    const cw = scrollWrap.clientWidth - PAD * 2;
    U = Math.max(24, Math.min(96, cw / W));
    const cssW = W * U + PAD * 2;
    const cssH = H * U + PAD * 2;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    PAD = Math.min(36, U * 0.6);
    markDirty();
  }

  /* ---------- 绘制循环（平面） ---------- */
  function frame() {
    if (dirty && state.mode === "flat") {
      dirty = false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

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
    } else if (state.mode === "3d") {
      dirty = false;
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

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ---------- 平面画布交互 ---------- */
  canvas.addEventListener("mousedown", e => {
    const p = canvasPos(e);
    const i = keyAt(p.x - PAD, p.y - PAD);
    if (i == null) return;
    setSelected(i);
    state.dragging = true;
    state.dragMoved = false;
    state._last = { x: p.x - PAD, y: p.y - PAD };
    markDirty();
  });

  window.addEventListener("mousemove", e => {
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
        touchDesign(d);
        syncImageSliders(d.img);
        markDirty();
        autosave();
      }
      return;
    }

    if (e.target === canvas) {
      const p = canvasPos(e);
      const i = keyAt(p.x - PAD, p.y - PAD);
      if (i !== state.hover) { state.hover = i; markDirty(); }
    } else if (state.hover != null) {
      state.hover = null; markDirty();
    }
  });

  window.addEventListener("mouseup", () => { state.dragging = false; });

  canvas.addEventListener("wheel", e => {
    const p = canvasPos(e);
    const i = keyAt(p.x - PAD, p.y - PAD);
    if (i == null) return;
    const d = state.designs[i];
    if (d && d.img) {
      e.preventDefault();
      setSelected(i);
      d.img.scale = clamp((d.img.scale || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.2, 4);
      touchDesign(d);
      syncPanel();
      markDirty();
      autosave();
    }
  }, { passive: false });

  canvas.addEventListener("dblclick", e => {
    const p = canvasPos(e);
    const i = keyAt(p.x - PAD, p.y - PAD);
    if (i != null) {
      setSelected(i);
      $("imgInput").click();
    }
  });

  /* 3D 画布：拖入图片 */
  canvas3d.addEventListener("dragover", e => e.preventDefault());
  canvas3d.addEventListener("drop", e => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const i = boardView ? boardView.pickAt(e.clientX, e.clientY) : null;
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
      /* 保留当前贴图模式（wrap），仅替换图片数据与变换参数 */
      d.img = { data: reader.result, wrap: d.img ? d.img.wrap : undefined, scale: 1, rot: 0, ox: 0, oy: 0 };
      touchDesign(d);
      setSelected(index);
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
    touchDesign(d);
    syncPanel(); autosave();
  });

  /* ---------- 取模预览（真实十字展开：梯形侧壁 + 分排倾角） ---------- */
  function updateNetPreview() {
    const i = state.selected;
    const d = i != null ? state.designs[i] : null;
    const wrapEl = $("netPreviewWrap");
    const show = !!(d && d.img && d.img.wrap === "net") && i != null && !!boardView;
    wrapEl.style.display = show ? "" : "none";
    if (!show) return;

    /* 真实展开尺寸（u）：含顶面内缩、锥度、分排倾角 */
    const k = state.keys[i];
    const TI = Preview3D.TI;
    const prof = keycapProfileFor(k, layoutBounds(state.keys).H >= 5.9, state.profile);
    const w = k.w, hh = k.h;
    const tw = w - 2 * TI, th = hh - 2 * TI;
    const ch = prof.h, tilt = prof.tilt || 0;
    const yB = ch + Math.sin(tilt) * (hh / 2 - TI);
    const yF = ch - Math.sin(tilt) * (hh / 2 - TI);

    const cv = $("netPreview");
    const wpx = Math.max(120, cv.parentElement.clientWidth - 2);
    const s = wpx / (2 * ch + tw);
    const hpx = (yB + th + yF) * s;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(wpx * dpr) || cv.height !== Math.round(hpx * dpr)) {
      cv.width = Math.round(wpx * dpr); cv.height = Math.round(hpx * dpr);
    }
    cv.style.height = hpx + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, wpx, hpx);

    /* 真实十字展开（纸样模板）：顶面 + 四壁梯形臂，锥度收分与模型一致，折叠线处图案连续 */
    const xT0 = ch * s, xT1 = (ch + tw) * s, yT0 = yB * s, yT1 = (yB + th) * s;
    const o = TI * s;
    const polys = [
      [xT0, yT0, xT1, yT0, xT1, yT1, xT0, yT1],             // 顶面 tw × th
      [xT0 - o, 0, xT1 + o, 0, xT1, yT0, xT0, yT0],         // 北壁梯形：折缝 tw，外缘 w，高 yB
      [xT0, yT1, xT1, yT1, xT1 + o, hpx, xT0 - o, hpx],     // 南壁梯形：高 yF
      [xT0, yT0, 0, yT0 - o, 0, yT1 + o, xT0, yT1],         // 西壁梯形：折缝 th，外缘 hh
      [xT1, yT0, wpx, yT0 - o, wpx, yT1 + o, xT1, yT1]      // 东壁梯形
    ];
    const tracePoly = f => {
      for (let i = 0; i < f.length; i += 2) i ? g.lineTo(f[i], f[i + 1]) : g.moveTo(f[i], f[i + 1]);
      g.closePath();
    };

    /* 十字轮廓内：底色 + 图片整体铺放（cover 铺满整个展开图，缩放/偏移/旋转可调），绝不拉伸 */
    g.save();
    g.beginPath();
    polys.forEach(tracePoly);
    g.fillStyle = d.bg || "#e9ecf5";
    g.fill();
    g.clip();
    const img = d.img ? boardView ? boardView.getImg(d.img.data) : null : null;
    if (img && img.complete && img.naturalWidth > 0) {
      const s2 = Math.max(wpx / img.naturalWidth, hpx / img.naturalHeight) * (d.img.scale || 1);
      g.translate(wpx / 2 + (d.img.ox || 0) * wpx, hpx / 2 + (d.img.oy || 0) * hpx);
      g.rotate((d.img.rot || 0) * Math.PI / 180);
      g.drawImage(img, -img.naturalWidth * s2 / 2, -img.naturalHeight * s2 / 2,
                  img.naturalWidth * s2, img.naturalHeight * s2);
    }
    g.restore();

    /* 折叠线与外轮廓：白色衬底 + 深色虚线 */
    g.save();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.setLineDash([]);
    polys.forEach(f => { g.beginPath(); tracePoly(f); g.stroke(); });
    g.lineWidth = 1.4;
    g.strokeStyle = "rgba(28,27,26,0.95)";
    g.setLineDash([5, 4]);
    polys.forEach(f => { g.beginPath(); tracePoly(f); g.stroke(); });
    g.restore();
  }

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
    $("btnExportKey3d").disabled = !has;
    $("key3dEmpty").style.display = has ? "none" : "";
    $("key3d").style.display = has ? "" : "none";
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
    if (hasImg) {
      syncImageSliders(d.img);
      $("imgWrap").value = d.img.wrap === "net" ? "net" : "top";
      updateNetPreview();
    }
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
      touchDesign(d);
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
    touchDesign(d);
    $("legendColor").value = Render.luminance(d.bg) > 0.55 ? "#3a3d46" : "#e8eaf2";
    autosave();
    toast("图例颜色已恢复自动配色");
  });

  bindDesign((d, el) => { if (d.img) { d.img.wrap = el.value; } }, $("imgWrap"));
  bindDesign((d, el) => { if (d.img) { d.img.scale = +el.value; $("imgScaleVal").textContent = (+el.value).toFixed(2) + "x"; } }, $("imgScale"));
  bindDesign((d, el) => { if (d.img) { d.img.rot = +el.value; $("imgRotVal").textContent = Math.round(+el.value) + "°"; } }, $("imgRot"));
  bindDesign((d, el) => { if (d.img) { d.img.ox = +el.value; $("imgXVal").textContent = (+el.value).toFixed(2); } }, $("imgX"));
  bindDesign((d, el) => { if (d.img) { d.img.oy = +el.value; $("imgYVal").textContent = (+el.value).toFixed(2); } }, $("imgY"));

  $("plateColor").addEventListener("input", e => {
    state.plateColor = e.target.value;
    if (boardView) boardView.setPlateColor(state.plateColor);
    markDirty(); autosave();
  });

  $("profileSelect").addEventListener("change", e => {
    state.profile = e.target.value;
    sync3DViews();
    autosave();
    toast("已切换键帽高度档案：" + e.target.selectedOptions[0].textContent);
  });

  /* ---------- 模式切换 ---------- */
  $("btn3d").addEventListener("click", () => {
    if (!P3) {
      toast("Three.js 未加载成功，无法使用 3D 预览");
      return;
    }
    state.mode = state.mode === "3d" ? "flat" : "3d";
    $("btn3d").classList.toggle("active", state.mode === "3d");
    $("btn3d").textContent = state.mode === "3d" ? "返回平面" : "3D 预览";
    hintbar.innerHTML = state.mode === "3d" ? HINT_3D : HINT_FLAT;
    if (state.mode === "3d") {
      canvas3d.style.width = (scrollWrap.clientWidth - 48) + "px";
      canvas3d.style.height = (scrollWrap.clientHeight - 48) + "px";
      ensureBoardView();
    } else if (boardView) {
      boardView.setActive(false);
    }
    canvas3d.style.display = state.mode === "3d" ? "" : "none";
    canvas.style.display = state.mode === "3d" ? "none" : "";
    if (boardView) boardView.setSelected(state.selected);
    markDirty();
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
      touchDesign(state.designs[i]);
    });
    autosave();
    toast("已应用到全部键帽");
  });

  $("btnResetKey").addEventListener("click", () => {
    if (state.selected == null) return;
    state.designs[state.selected] = defaultDesign(state.keys[state.selected]);
    touchDesign(state.designs[state.selected]);
    if (singleView) singleView.setTarget(state.keys[state.selected], state.designs[state.selected]);
    syncPanel(); autosave();
  });

  $("btnClear").addEventListener("click", () => {
    state.keys.forEach((k, i) => {
      state.designs[i] = defaultDesign(k);
      touchDesign(state.designs[i]);
    });
    if (singleView && state.selected != null) {
      singleView.setTarget(state.keys[state.selected], state.designs[state.selected]);
    }
    autosave();
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
  function downloadURL(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }

  $("btnExportBoard").addEventListener("click", () => {
    if (state.mode === "3d" && boardView) {
      downloadURL(boardView.snapshot(2), `keycap-board-3d-${state.keys.length}keys.png`);
      toast("3D 视角整盘 PNG 已导出");
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
    downloadURL(cv.toDataURL("image/png"), `keycap-board-${state.keys.length}keys.png`);
    toast("整盘 PNG 已导出");
  });

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
    downloadURL(cv.toDataURL("image/png"), `keycap-${name}-${k.w}u.png`);
    toast("键帽 PNG 已导出");
  });

  $("btnExportKey3d").addEventListener("click", () => {
    if (state.selected == null || !singleView) { toast("请先选中一个键帽"); return; }
    const k = state.keys[state.selected];
    const name = (k.label || "space").replace(/[\\/:*?"<>|]/g, "_");
    downloadURL(singleView.snapshot(2), `keycap-3d-${name}.png`);
    toast("单键 3D PNG 已导出");
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
      profile: state.profile,
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
    state.profile = KEYCAP_PROFILES[obj.profile] ? obj.profile : "oem";
    $("profileSelect").value = state.profile;
    for (const [i, d] of Object.entries(obj.designs)) {
      const idx = +i;
      if (idx < state.keys.length) {
        const base = defaultDesign(state.keys[idx]);
        const merged = { ...base, ...d };
        touchDesign(merged);
        state.designs[idx] = merged;
      }
    }
    sync3DViews();
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

  /* ---------- 初始化 ---------- */
  window.addEventListener("resize", debounce(() => {
    if (state.mode === "flat") {
      fitCanvas();
    } else if (boardView) {
      canvas3d.style.width = (scrollWrap.clientWidth - 48) + "px";
      canvas3d.style.height = (scrollWrap.clientHeight - 48) + "px";
    }
  }, 150));

  buildLayout(getLayoutRows("60"), "60", false);
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) restoreProject(JSON.parse(saved));
  } catch { /* 忽略 */ }
  hintbar.innerHTML = HINT_FLAT;
  fitCanvas();

  if (P3) initViews();
  else document.addEventListener("p3d-ready", () => { P3 = window.Preview3D; initViews(); }, { once: true });

  setInterval(updateNetPreview, 250);
  requestAnimationFrame(frame);
})();
