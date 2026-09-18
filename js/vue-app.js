/* =========================================================
 * Vue 3 版主逻辑（Composition API）
 * - 响应式状态 + 模板驱动 UI（index.html 内联模板）
 * - 命令式模块保持不变：layout.js（布局）、render.js（平面渲染）、
 *   preview3d.js（Three.js 3D）、十字取模预览（canvas 手绘）
 * ========================================================= */

(() => {
  "use strict";

  const { createApp, reactive, ref, computed, watch, onMounted, nextTick } = Vue;

  const SAVE_KEY = "keycap-diy-v1";
  const imgCache = new Map();   // dataURL -> HTMLImageElement
  let dirty = true;             // 平面重绘标记（模块级：getImg 回调也会触发）

  const HINT_FLAT = "单击选中键帽<i>·</i>双击 / 拖入图片上传<i>·</i>拖拽移动图片<i>·</i>滚轮缩放图片<i>·</i>Ctrl+V 粘贴图片到选中键";
  const HINT_3D = "拖拽旋转视角<i>·</i>滚轮缩放<i>·</i>单击选中 / 双击上传图片<i>·</i>右侧面板实时生效";

  /* ---------- 工具 ---------- */
  function debounce(fn, ms) {
    let timer;
    return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function getImg(data) {
    if (!imgCache.has(data)) {
      const el = new Image();
      el.onload = () => { dirty = true; };
      el.src = data;
      imgCache.set(data, el);
    }
    return imgCache.get(data);
  }

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
      img: null              // {data, wrap, scale, rot, ox, oy}
    };
  }

  function keySizeText(k) {
    const u = k.w === 1 && k.h === 1 ? "1u" : `${k.w}u${k.h > 1 ? ` × ${k.h}u 高` : ""}`;
    return `${u} · ${Math.round(k.w * 19.05 * 10) / 10}mm 键距标准`;
  }

  const app = createApp({
    setup() {
      /* ================= 响应式状态 ================= */
      const state = reactive({
        layoutName: "60",
        customRows: null,      // KLE 导入时保存原始 rows
        keys: [],
        designs: {},           // index -> design
        selected: null,
        hover: null,
        plateColor: "#23252f",
        profile: "oem",        // 键帽高度档案
        mode: "flat",          // flat | 3d
        designCounter: 0       // 设计变更计数（per-key .v，驱动 3D 纹理刷新）
      });

      /* ================= 非响应式（渲染引擎侧） ================= */
      let P3 = window.Preview3D || null;
      let boardView = null;
      let singleView = null;
      let ctx = null;
      let U = 56;              // 平面模式：每单位像素（CSS 像素）
      let PAD = 36;
      let dragging = false, dragMoved = false, lastPos = null;

      /* ================= UI 局部状态 ================= */
      const toastMsg = ref("");
      const toastOn = ref(false);
      let toastTimer = null;
      const zoom3d = ref(false);
      const capColorAll = ref("#e9ecf5");
      const hint = ref(HINT_FLAT);

      /* 界面主题：classic | tech（本地偏好，不属于工程数据） */
      const VIEW_BG = { classic: "#edeae3", tech: "#0f1626" };
      const theme = ref(localStorage.getItem("keycap-theme") === "tech" ? "tech" : "classic");
      document.documentElement.setAttribute("data-theme", theme.value === "tech" ? "tech" : "");
      function applyViewBg() {
        const c = VIEW_BG[theme.value] || VIEW_BG.classic;
        if (boardView) boardView.setClearColor(c);
        if (singleView) singleView.setClearColor(c);
      }
      function setTheme(v) {
        theme.value = v === "tech" ? "tech" : "classic";
        document.documentElement.setAttribute("data-theme", theme.value === "tech" ? "tech" : "");
        try { localStorage.setItem("keycap-theme", theme.value); } catch (e) { /* 忽略 */ }
        applyViewBg();
      }

      /* ================= 模板引用 ================= */
      const boardRef = ref(null), board3dRef = ref(null), key3dRef = ref(null),
        netPreviewRef = ref(null), scrollRef = ref(null), overlayStageRef = ref(null),
        imgInputRef = ref(null), kleInputRef = ref(null), projInputRef = ref(null),
        key3dHomeRef = ref(null);

      /* ================= 计算属性 ================= */
      const curKey = computed(() => state.selected != null ? state.keys[state.selected] : null);
      const curDesign = computed(() => state.selected != null ? state.designs[state.selected] : null);
      const hasSel = computed(() => !!curKey.value);
      const keyTitle = computed(() => curKey.value ? (curKey.value.label || "（空格 / 无图例键）") : "");
      const keySub = computed(() => curKey.value ? keySizeText(curKey.value) : "");
      const autoLegend = computed(() =>
        curDesign.value ? (Render.luminance(curDesign.value.bg) > 0.55 ? "#3a3d46" : "#e8eaf2") : "#3a3d46");
      const netShow = computed(() =>
        !!(curDesign.value && curDesign.value.img && curDesign.value.img.wrap === "net") && hasSel.value);
      const imgWrapShown = computed(() =>
        (curDesign.value && curDesign.value.img && curDesign.value.img.wrap === "net") ? "net" : "top");

      /* ================= 基础动作 ================= */
      function toast(msg) {
        toastMsg.value = msg;
        toastOn.value = true;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastOn.value = false; }, 1800);
      }

      function touchDesign(d) {
        if (typeof state.designCounter !== "number" || !Number.isFinite(state.designCounter)) {
          state.designCounter = 0;
        }
        d.v = ++state.designCounter;
      }
      function touchCur() { if (curDesign.value) touchDesign(curDesign.value); }

      function setCur(field, v) {
        const d = curDesign.value; if (!d) return;
        d[field] = v;
        touchDesign(d);
      }
      function setImg(field, v) {
        const d = curDesign.value; if (!d || !d.img) return;
        d.img[field] = v;
        touchDesign(d);
      }

      /* ================= 集中副作用：变更 → 重绘 + 自动存档 ================= */
      const autosave = debounce(saveProjectLocal, 400);
      watch(() => state.designs, () => { dirty = true; autosave(); }, { deep: true });
      watch(() => state.plateColor, c => {
        if (boardView) boardView.setPlateColor(c);
        dirty = true; autosave();
      });
      watch(() => state.profile, () => { sync3DViews(); autosave(); });
      watch(() => state.selected, i => {
        if (boardView) boardView.setSelected(i == null ? -1 : i);
        if (singleView) {
          singleView.setTarget(i != null ? state.keys[i] : null,
            i != null ? state.designs[i] : null,
            i != null ? keycapProfileFor(state.keys[i], layoutBounds(state.keys).H >= 5.9, state.profile) : undefined);
        }
        dirty = true;
      });

      /* ================= 布局构建 ================= */
      function buildLayout(rows, layoutName, keepDesigns) {
        const oldKeys = state.keys;
        const oldDesigns = { ...state.designs };

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

        state.selected = null;
        fitCanvas();
        sync3DViews();
        dirty = true;
      }

      /* ================= 3D 视图 ================= */
      function initViews() {
        if (!P3 || !key3dRef.value) return;
        singleView = P3.createSingleView(key3dRef.value, { getImg });
        window.__dbs = singleView; /* 调试用 */
        applyViewBg();
        if (state.selected != null) {
          singleView.setTarget(state.keys[state.selected], state.designs[state.selected]);
        }
      }

      function ensureBoardView() {
        if (boardView || !P3 || !board3dRef.value || !scrollRef.value) return;
        board3dRef.value.style.width = (scrollRef.value.clientWidth - 48) + "px";
        board3dRef.value.style.height = (scrollRef.value.clientHeight - 48) + "px";
        boardView = P3.createBoardView(board3dRef.value, {
          getImg,
          onPick: i => { state.selected = i; },
          onDoubleClick: i => {
            if (i != null) {
              state.selected = i;
              uploadClick();
            }
          }
        });
        boardView.setScene(state.keys, state.designs, state.plateColor, state.profile);
        boardView.setSelected(state.selected);
        boardView.setActive(true);
        applyViewBg();
        window.__dbv = boardView; /* 调试用 */
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

      /* ================= 画布尺寸（平面） ================= */
      function fitCanvas() {
        const cv = boardRef.value, wrap = scrollRef.value;
        if (!cv || !wrap) return;
        const dpr = window.devicePixelRatio || 1;
        const { W, H } = layoutBounds(state.keys);
        const cw = wrap.clientWidth - PAD * 2;
        U = Math.max(24, Math.min(96, cw / W));
        const cssW = W * U + PAD * 2;
        const cssH = H * U + PAD * 2;
        cv.width = cssW * dpr;
        cv.height = cssH * dpr;
        cv.style.width = cssW + "px";
        cv.style.height = cssH + "px";
        PAD = Math.min(36, U * 0.6);
        dirty = true;
      }

      /* ================= 绘制循环（平面） ================= */
      function frame() {
        if (dirty && state.mode === "flat" && ctx) {
          dirty = false;
          const cv = boardRef.value;
          const dpr = window.devicePixelRatio || 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);

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

      /* ================= 命中检测（平面） ================= */
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
        const r = boardRef.value.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }

      /* ================= 图片应用 ================= */
      function applyImageFile(file, index) {
        const reader = new FileReader();
        reader.onload = () => {
          const d = state.designs[index] || (state.designs[index] = defaultDesign(state.keys[index]));
          /* 保留当前贴图模式（wrap），仅替换图片数据与变换参数 */
          d.img = { data: reader.result, wrap: d.img ? d.img.wrap : undefined, scale: 1, rot: 0, ox: 0, oy: 0 };
          touchDesign(d);
          state.selected = index;
          autosave();
          toast("图片已应用到键帽");
        };
        reader.readAsDataURL(file);
      }

      function uploadClick() { if (imgInputRef.value) imgInputRef.value.click(); }

      function onImgFile(e) {
        const f = e.target.files[0];
        if (f && state.selected != null) applyImageFile(f, state.selected);
        e.target.value = "";
      }

      function removeImg() {
        const d = curDesign.value; if (!d) return;
        d.img = null;
        touchDesign(d);
      }

      /* ================= 取模预览：拖拽移动原图（3D 同步更新） =================
         注意：netPreview 画布位于 v-if 区域内（有图片时才存在），因此惰性绑定 */
      let netBound = false;
      function bindNetPreview() {
        if (netBound) return;
        const netCv = netPreviewRef.value;
        if (!netCv) return;
        netBound = true;
        let netDrag = null;
        netCv.addEventListener("pointerdown", e => {
          const i = state.selected;
          const d = i != null ? state.designs[i] : null;
          if (!d || !d.img || d.img.wrap !== "net") return;
          netDrag = { x: e.clientX, y: e.clientY, ox: d.img.ox || 0, oy: d.img.oy || 0 };
          netCv.setPointerCapture(e.pointerId);
        });
        netCv.addEventListener("pointermove", e => {
          if (!netDrag) return;
          const i = state.selected;
          const d = i != null ? state.designs[i] : null;
          if (!d || !d.img) { netDrag = null; return; }
          const r = netCv.getBoundingClientRect();
          d.img.ox = netDrag.ox + (e.clientX - netDrag.x) / r.width;
          d.img.oy = netDrag.oy + (e.clientY - netDrag.y) / r.height;
          touchDesign(d);
          updateNetPreview();
        });
        const netEnd = () => { netDrag = null; };
        netCv.addEventListener("pointerup", netEnd);
        netCv.addEventListener("pointercancel", netEnd);
      }

      /* ================= 取模预览（真实十字展开：梯形侧壁 + 分排倾角） ================= */
      function updateNetPreview() {
        bindNetPreview();
        const cv = netPreviewRef.value;
        if (!cv) return;
        const i = state.selected;
        const d = i != null ? state.designs[i] : null;
        const show = !!(d && d.img && d.img.wrap === "net") && i != null;
        if (!show) return;

        /* 真实展开尺寸（u）：底环内缩 gap、顶面再按 xi/zi 内缩，四壁统一向里收分 */
        const k = state.keys[i];
        const prof = keycapProfileFor(k, layoutBounds(state.keys).H >= 5.9, state.profile);
        const dims = Preview3D.netDims(k, prof);
        const tw = dims.tw, th = dims.th, ch = dims.ch, yB = dims.yB, yF = dims.yF;

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

        /* 真实十字展开（纸样模板）：顶面 + 四壁梯形臂，收分与模型一致，折叠线处图案连续 */
        const xT0 = ch * s, xT1 = (ch + tw) * s, yT0 = yB * s, yT1 = (yB + th) * s;
        const o = dims.xi * s;                       // 底环左右缘相对顶面的外扩
        const oB = dims.eB * s, oF = dims.eF * s;    // 底环后/前缘相对顶面的外扩
        const polys = [
          [xT0, yT0, xT1, yT0, xT1, yT1, xT0, yT1],             // 顶面 tw × th
          [xT0 - o, 0, xT1 + o, 0, xT1, yT0, xT0, yT0],         // 北壁梯形：折缝 tw，外缘 w，高 yB
          [xT0, yT1, xT1, yT1, xT1 + o, hpx, xT0 - o, hpx],     // 南壁梯形：高 yF
          [xT0, yT0, 0, yT0 + oB, 0, yT1 + oF, xT0, yT1],       // 西壁梯形：折缝 th，外缘 hh
          [xT1, yT0, wpx, yT0 + oB, wpx, yT1 + oF, xT1, yT1]    // 东壁梯形
        ];
        const tracePoly = f => {
          for (let j = 0; j < f.length; j += 2) j ? g.lineTo(f[j], f[j + 1]) : g.moveTo(f[j], f[j + 1]);
          g.closePath();
        };

        /* 十字轮廓内：底色 + 图片整体铺放（cover 铺满整个展开图，缩放/偏移/旋转可调），绝不拉伸 */
        g.save();
        g.beginPath();
        polys.forEach(tracePoly);
        g.fillStyle = d.bg || "#e9ecf5";
        g.fill();
        g.clip();
        const img = d.img ? getImg(d.img.data) : null;
        if (img && img.complete && img.naturalWidth > 0) {
          /* 顶面优先：铺满顶面区域，余出部分包四壁 */
          const s2 = Math.max((tw * s) / img.naturalWidth, (th * s) / img.naturalHeight) * (d.img.scale || 1);
          g.translate(ch * s + tw * s / 2 + (d.img.ox || 0) * tw * s,
            yB * s + th * s / 2 + (d.img.oy || 0) * th * s);
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

      /* ================= 工具栏动作 ================= */
      function onLayoutChange(e) {
        buildLayout(getLayoutRows(e.target.value), e.target.value, true);
      }

      function setMode(m) {
        if (m === state.mode) return;
        if (m === "3d") {
          if (!P3) {
            toast("Three.js 未加载成功，无法使用 3D 预览");
            return;
          }
          state.mode = "3d";
          hint.value = HINT_3D;
          nextTick(() => {
            if (board3dRef.value && scrollRef.value) {
              board3dRef.value.style.width = (scrollRef.value.clientWidth - 48) + "px";
              board3dRef.value.style.height = (scrollRef.value.clientHeight - 48) + "px";
            }
            ensureBoardView();
            /* 再次进入 3D：ensureBoardView 会因实例已存在而跳过，必须重新激活渲染循环 */
            if (boardView) {
              boardView.setActive(true);
              boardView.setSelected(state.selected);
            }
            dirty = true;
          });
        } else {
          state.mode = "flat";
          hint.value = HINT_FLAT;
          if (boardView) boardView.setActive(false);
        }
      }

      function applyAll() {
        const d = curDesign.value; if (!d) return;
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
        toast("已应用到全部键帽");
      }

      function resetKey() {
        if (state.selected == null) return;
        state.designs[state.selected] = defaultDesign(state.keys[state.selected]);
        touchDesign(state.designs[state.selected]);
      }

      function clearAll() {
        state.keys.forEach((k, i) => {
          state.designs[i] = defaultDesign(k);
          touchDesign(state.designs[i]);
        });
        toast("已清空全部设计");
      }

      /* 全局键帽颜色：一次修改全部键帽底色（不影响图例/图片） */
      function applyGlobalColor(e) {
        const v = e.target.value;
        capColorAll.value = v;
        state.keys.forEach((k, i) => {
          if (!state.designs[i]) return;
          state.designs[i].bg = v;
          touchDesign(state.designs[i]);
        });
      }

      function legendAuto() {
        const d = curDesign.value; if (!d) return;
        d.legendColor = null;
        touchDesign(d);
        toast("图例颜色已恢复自动配色");
      }

      function onProfileChange(e) {
        state.profile = e.target.value;
        toast("已切换键帽高度档案：" + e.target.selectedOptions[0].textContent);
      }

      /* ================= KLE 导入 ================= */
      function importKLEClick() { if (kleInputRef.value) kleInputRef.value.click(); }

      function onKLEFile(e) {
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
            buildLayout(rows, "custom", true);
            toast("KLE 布局导入成功");
          } catch (err) {
            toast("导入失败：请提供 KLE 标准 JSON（二维数组）");
          }
        };
        reader.readAsText(f);
        e.target.value = "";
      }

      /* ================= 导出 ================= */
      function downloadURL(url, name) {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
      }

      function exportBoard() {
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
      }

      function exportKey() {
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
      }

      function exportKey3d() {
        if (state.selected == null || !singleView) { toast("请先选中一个键帽"); return; }
        const k = state.keys[state.selected];
        const name = (k.label || "space").replace(/[\\/:*?"<>|]/g, "_");
        downloadURL(singleView.snapshot(2), `keycap-3d-${name}.png`);
        toast("单键 3D PNG 已导出");
      }

      /* ================= 工程保存 / 载入 ================= */
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
        state.profile = KEYCAP_PROFILES[obj.profile] ? obj.profile : "oem";
        for (const [i, d] of Object.entries(obj.designs)) {
          const idx = +i;
          if (idx < state.keys.length) {
            const base = defaultDesign(state.keys[idx]);
            const merged = { ...base, ...d };
            touchDesign(merged);
            state.designs[idx] = merged;
          }
        }
        capColorAll.value = (state.designs[0] && state.designs[0].bg) || "#e9ecf5";
        sync3DViews();
        dirty = true;
        return true;
      }

      function saveProject() {
        const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "keycap-project.json";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("工程文件已保存");
      }

      function loadProjectClick() { if (projInputRef.value) projInputRef.value.click(); }

      function onProjFile(e) {
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
      }

      /* ================= 单键 3D 预览放大 ================= */
      function zoomOpen() {
        if (!overlayStageRef.value || !key3dRef.value) return;
        overlayStageRef.value.appendChild(key3dRef.value);
        zoom3d.value = true;
      }
      function zoomClose() {
        if (!zoom3d.value) return;
        if (key3dHomeRef.value && key3dRef.value) key3dHomeRef.value.appendChild(key3dRef.value);
        zoom3d.value = false;
      }

      /* ================= 生命周期 ================= */
      onMounted(() => {
        ctx = boardRef.value.getContext("2d");

        const canvas = boardRef.value;
        const canvas3d = board3dRef.value;

        /* ---- 平面画布交互 ---- */
        canvas.addEventListener("mousedown", e => {
          const p = canvasPos(e);
          const i = keyAt(p.x - PAD, p.y - PAD);
          if (i == null) return;
          state.selected = i;
          dragging = true;
          dragMoved = false;
          lastPos = { x: p.x - PAD, y: p.y - PAD };
          dirty = true;
        });

        window.addEventListener("mousemove", e => {
          if (dragging && state.selected != null) {
            const p = canvasPos(e);
            const px = p.x - PAD, py = p.y - PAD;
            const dx = px - lastPos.x;
            const dy = py - lastPos.y;
            lastPos = { x: px, y: py };
            const d = state.designs[state.selected];
            if (d && d.img) {
              const g = Render.capGeom(state.keys[state.selected], U);
              d.img.ox = clamp((d.img.ox || 0) + dx / g.tw, -1.5, 1.5);
              d.img.oy = clamp((d.img.oy || 0) + dy / g.th, -1.5, 1.5);
              dragMoved = true;
              touchDesign(d);
              dirty = true;
            }
            return;
          }

          if (e.target === canvas) {
            const p = canvasPos(e);
            const i = keyAt(p.x - PAD, p.y - PAD);
            if (i !== state.hover) { state.hover = i; dirty = true; }
          } else if (state.hover != null) {
            state.hover = null; dirty = true;
          }
        });

        window.addEventListener("mouseup", () => { dragging = false; });

        canvas.addEventListener("wheel", e => {
          const p = canvasPos(e);
          const i = keyAt(p.x - PAD, p.y - PAD);
          if (i == null) return;
          const d = state.designs[i];
          if (d && d.img) {
            e.preventDefault();
            state.selected = i;
            d.img.scale = clamp((d.img.scale || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.2, 4);
            touchDesign(d);
            dirty = true;
          }
        }, { passive: false });

        canvas.addEventListener("dblclick", e => {
          const p = canvasPos(e);
          const i = keyAt(p.x - PAD, p.y - PAD);
          if (i != null) {
            state.selected = i;
            uploadClick();
          }
        });

        /* ---- 3D 画布：拖入图片 ---- */
        canvas3d.addEventListener("dragover", e => e.preventDefault());
        canvas3d.addEventListener("drop", e => {
          e.preventDefault();
          const file = e.dataTransfer.files && e.dataTransfer.files[0];
          if (!file || !file.type.startsWith("image/")) return;
          const i = boardView ? boardView.pickAt(e.clientX, e.clientY) : null;
          if (i != null) applyImageFile(file, i);
        });

        /* ---- Ctrl+V 粘贴图片 ---- */
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

        /* ---- Esc 关闭放大层 ---- */
        window.addEventListener("keydown", e => { if (e.key === "Escape") zoomClose(); });

        /* ---- 窗口尺寸 ---- */
        window.addEventListener("resize", debounce(() => {
          if (state.mode === "flat") {
            fitCanvas();
          } else if (boardView && board3dRef.value && scrollRef.value) {
            board3dRef.value.style.width = (scrollRef.value.clientWidth - 48) + "px";
            board3dRef.value.style.height = (scrollRef.value.clientHeight - 48) + "px";
          }
        }, 150));

        /* ---- 初始化 ---- */
        buildLayout(getLayoutRows("60"), "60", false);
        try {
          const saved = localStorage.getItem(SAVE_KEY);
          if (saved) restoreProject(JSON.parse(saved));
        } catch { /* 忽略 */ }
        fitCanvas();

        if (P3) initViews();
        else document.addEventListener("p3d-ready", () => { P3 = window.Preview3D; initViews(); }, { once: true });

        setInterval(updateNetPreview, 250);
        requestAnimationFrame(frame);
      });

      return {
        /* 状态 */
        state, toastMsg, toastOn, zoom3d, capColorAll, hint, theme, setTheme,
        /* 引用 */
        boardRef, board3dRef, key3dRef, netPreviewRef, scrollRef, overlayStageRef,
        imgInputRef, kleInputRef, projInputRef, key3dHomeRef,
        /* 计算属性 */
        curKey, curDesign, hasSel, keyTitle, keySub, autoLegend, netShow, imgWrapShown,
        /* 动作 */
        onLayoutChange, setMode, applyAll, resetKey, clearAll, applyGlobalColor,
        legendAuto, onProfileChange, uploadClick, onImgFile, removeImg,
        importKLEClick, onKLEFile, exportBoard, exportKey, exportKey3d,
        saveProject, loadProjectClick, onProjFile, zoomOpen, zoomClose,
        setCur, setImg
      };
    }
  });

  const vm = app.mount("#app");
  window.__vue = vm; /* 调试 / 回归测试句柄 */
})();
