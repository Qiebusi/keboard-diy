/* =========================================================
 * 3D 键盘预览（纯 Canvas，透视投影 + 画家算法）
 * - 真实透视：透视除法，近大远小；按相机位置判定面可见性
 * - 键帽顶面贴图：离屏纹理 + 三角形仿射映射（透视校正近似）
 * - 支持整盘渲染与单颗键帽渲染（共享同一套几何）
 * ========================================================= */

const Preview3D = (() => {

  const CAP_H_BASE = 0.42;   // 键帽高度（u）
  const TI = 0.125;          // 顶面内缩（与平面渲染一致）
  const PXU = 260;           // 顶面纹理分辨率（px / u）

  let texCache = new Map();
  let texVersion = null;

  function capHeight(k) {
    return CAP_H_BASE + (k.h > 1 ? 0.1 : 0) + (k.w >= 2.75 ? 0.03 : 0);
  }

  /* 相机距离：随布局尺寸变化（u） */
  function distFor(W, H) {
    return Math.hypot(W, H) * 1.5 + 5;
  }

  /* ---------- 透视投影 ----------
   * 相机位于方位角 yaw、仰角 elev、距离 dist 处，看向原点。
   * focal 为焦距（像素），dist 为相机到目标距离（u） */
  function makeProjector(yaw, elev, focal, cx, cy, dist) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const ce = Math.cos(elev), se = Math.sin(elev);
    return (X, Y, Z) => {
      const x1 = X * ca - Y * sa;
      const y1 = X * sa + Y * ca;
      const depth = y1 * ce + Z * se;              // 相机轴向深度
      const k = focal / (dist - depth);
      return {
        x: cx + x1 * k,
        y: cy - (y1 * se - Z * ce) * k,
        d: depth
      };
    };
  }

  /* 面可见性：相机是否位于面的外侧（法线 + 面中心，世界 XY） */
  function makeVis(yaw, elev, dist) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const camY = Math.cos(elev) * dist;
    return (nx, ny, fx, fy) => {
      const nx1 = nx * ca - ny * sa;
      const ny1 = nx * sa + ny * ca;
      const fx1 = fx * ca - fy * sa;
      const fy1 = fx * sa + fy * ca;
      return -fx1 * nx1 + (camY - fy1) * ny1 > 0;
    };
  }

  /* 按旋转后法线着色（光源自屏幕左上） */
  function faceColor(bg, nx, ny, yaw) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const nx1 = nx * ca - ny * sa;
    const ny1 = nx * sa + ny * ca;
    const Lx = -0.55, Ly = -0.85;
    const len = Math.hypot(Lx, Ly);
    const lam = Math.max(0, (nx1 * Lx + ny1 * Ly) / len);
    return Render.shade(bg, -14 - 34 * (1 - lam));
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }

  /* ---------- 顶面纹理 ---------- */
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

  function topTexture(k, d, getImg, cacheKey, version) {
    if (texVersion !== version) { texCache.clear(); texVersion = version; }
    if (texCache.has(cacheKey)) return texCache.get(cacheKey);

    const tw = k.w - 2 * TI, th = k.h - 2 * TI;
    const TW = Math.max(8, Math.round(tw * PXU));
    const TH = Math.max(8, Math.round(th * PXU));
    const c = document.createElement("canvas");
    c.width = TW; c.height = TH;
    const g = c.getContext("2d");

    const bg = (d && d.bg) || "#e9ecf5";
    const r = 0.09 * PXU;

    roundRect(g, 0, 0, TW, TH, r);
    g.fillStyle = bg;
    g.fill();

    /* 图片贴图 */
    let imgReady = true;
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
      } else {
        imgReady = false;
      }
    }

    /* 光影 */
    g.save();
    roundRect(g, 0, 0, TW, TH, r);
    g.clip();
    const gr = g.createLinearGradient(0, 0, 0, TH);
    gr.addColorStop(0, "rgba(255,255,255,0.14)");
    gr.addColorStop(0.5, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.08)");
    g.fillStyle = gr;
    g.fillRect(0, 0, TW, TH);
    g.restore();

    /* 图例 */
    const legend = d && d.legend != null ? d.legend : k.label;
    if (legend) {
      const color = (d && d.legendColor) || (Render.luminance(bg) > 0.55 ? "#3a3d46" : "#e8eaf2");
      const fs = Math.min(TH * 0.38 * ((d && d.legendSize) || 1), 0.30 * PXU);
      g.fillStyle = color;
      g.font = `600 ${Math.max(8, fs)}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
      g.textAlign = "left";
      g.textBaseline = "top";
      const pad = Math.min(TW, TH) * 0.10;
      g.fillText(legend, pad, pad * 0.9);
    }

    /* 内高光 */
    roundRect(g, 0.75, 0.75, TW - 1.5, TH - 1.5, r - 0.75);
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 1.5;
    g.stroke();

    const tex = { c, ready: imgReady };
    if (imgReady) texCache.set(cacheKey, tex);
    return tex;
  }

  /* 三角形仿射贴图（轻微外扩避免接缝） */
  function mapTri(ctx, img, s, d) {
    const [x0, y0, x1, y1, x2, y2] = s;
    const u1 = { x: x1 - x0, y: y1 - y0 };
    const u2 = { x: x2 - x0, y: y2 - y0 };
    const v1 = { x: d[1].x - d[0].x, y: d[1].y - d[0].y };
    const v2 = { x: d[2].x - d[0].x, y: d[2].y - d[0].y };
    const det = u1.x * u2.y - u1.y * u2.x;
    if (!det) return;
    /* M = [v1 v2] · [u1 u2]⁻¹  （u: 源三角形基，v: 目标三角形基） */
    const a = (v1.x * u2.y - v2.x * u1.y) / det;
    const b = (v2.x * u1.x - v1.x * u2.x) / det;
    const cc = (v1.y * u2.y - v2.y * u1.y) / det;
    const dd = (v2.y * u1.x - v1.y * u2.x) / det;
    const e = d[0].x - a * x0 - b * y0;
    const f = d[0].y - cc * x0 - dd * y0;

    const cen = { x: (d[0].x + d[1].x + d[2].x) / 3, y: (d[0].y + d[1].y + d[2].y) / 3 };
    ctx.save();
    ctx.beginPath();
    d.forEach((p, i) => {
      const dx = p.x - cen.x, dy = p.y - cen.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = p.x + dx / len * 0.7, ey = p.y + dy / len * 0.7;
      i ? ctx.lineTo(ex, ey) : ctx.moveTo(ex, ey);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, cc, dd, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function drawTop(ctx, tex, p00, p10, p11, p01) {
    const TW = tex.c.width, TH = tex.c.height;
    mapTri(ctx, tex.c, [0, 0, TW, 0, TW, TH], [p00, p10, p11]);
    mapTri(ctx, tex.c, [0, 0, TW, TH, 0, TH], [p00, p11, p01]);
  }

  /* ---------- 平板（底板） ---------- */
  function drawSlab(ctx, P, vis, x0, y0, x1, y1, zTop, zBot, color) {
    const b = [P(x0, y0, zBot), P(x1, y0, zBot), P(x1, y1, zBot), P(x0, y1, zBot)];
    const t = [P(x0, y0, zTop), P(x1, y0, zTop), P(x1, y1, zTop), P(x0, y1, zTop)];
    const mcx = (x0 + x1) / 2, mcy = (y0 + y1) / 2;
    const sides = [
      { n: [0, -1], c: [mcx, y0], q: [b[0], b[1], t[1], t[0]] },
      { n: [1, 0], c: [x1, mcy], q: [b[1], b[2], t[2], t[1]] },
      { n: [0, 1], c: [mcx, y1], q: [b[2], b[3], t[3], t[2]] },
      { n: [-1, 0], c: [x0, mcy], q: [b[3], b[0], t[0], t[3]] }
    ];
    for (const s of sides) {
      if (!vis(s.n[0], s.n[1], s.c[0], s.c[1])) continue;
      poly(ctx, s.q);
      ctx.fillStyle = Render.shade(color, -34);
      ctx.fill();
    }
    poly(ctx, t);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ---------- 单个键帽 ---------- */
  function drawCap(ctx, k, d, P, vis, o, selected, cacheKey) {
    const bg = (d && d.bg) || "#e9ecf5";
    const x = k.x, y = k.y, w = k.w, hh = k.h;
    const h3 = capHeight(k);
    const ti = TI;

    /* 侧面（按相机位置精确判定可见性） */
    const sideDefs = [
      { nx: 0, ny: -1, cx: x + w / 2, cy: y, b0: [x, y], b1: [x + w, y], t0: [x + ti, y + ti], t1: [x + w - ti, y + ti] },
      { nx: 1, ny: 0, cx: x + w, cy: y + hh / 2, b0: [x + w, y], b1: [x + w, y + hh], t0: [x + w - ti, y + ti], t1: [x + w - ti, y + hh - ti] },
      { nx: 0, ny: 1, cx: x + w / 2, cy: y + hh, b0: [x + w, y + hh], b1: [x, y + hh], t0: [x + w - ti, y + hh - ti], t1: [x + ti, y + hh - ti] },
      { nx: -1, ny: 0, cx: x, cy: y + hh / 2, b0: [x, y + hh], b1: [x, y], t0: [x + ti, y + hh - ti], t1: [x + ti, y + ti] }
    ];
    for (const s of sideDefs) {
      if (!vis(s.nx, s.ny, s.cx, s.cy)) continue;
      poly(ctx, [P(s.b0[0], s.b0[1], 0), P(s.b1[0], s.b1[1], 0), P(s.t1[0], s.t1[1], h3), P(s.t0[0], s.t0[1], h3)]);
      ctx.fillStyle = faceColor(bg, s.nx, s.ny, o.yaw);
      ctx.fill();
    }

    /* 顶面（透视三角形贴图） */
    const p00 = P(x + ti, y + ti, h3), p10 = P(x + w - ti, y + ti, h3);
    const p11 = P(x + w - ti, y + hh - ti, h3), p01 = P(x + ti, y + hh - ti, h3);
    const tex = topTexture(k, d, o.getImg, cacheKey, o.version);
    if (tex.ready) {
      drawTop(ctx, tex, p00, p10, p11, p01);
    } else {
      poly(ctx, [p00, p10, p11, p01]);
      ctx.fillStyle = bg;
      ctx.fill();
    }

    /* 选中态 */
    if (selected) {
      poly(ctx, [p00, p10, p11, p01]);
      ctx.strokeStyle = "#d9480f";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  /**
   * 渲染整块键盘
   * o: { yaw, elev, scale(focal), cx, cy, dist, plateColor, selectedIndex, getImg, version, noShadow }
   */
  function render(ctx, keys, designs, o) {
    const { W, H } = layoutBounds(keys);
    const dist = o.dist || distFor(W, H);
    const P = makeProjector(o.yaw, o.elev, o.scale, o.cx, o.cy, dist);
    const vis = makeVis(o.yaw, o.elev, dist);
    const pm = 0.35;

    drawSlab(ctx, P, vis, -pm, -pm, W + pm, H + pm, 0, -0.4, o.plateColor || "#23252f");

    const order = keys
      .map((k, i) => ({ k, i, d: P(k.x + k.w / 2, k.y + k.h / 2, 0.2).d }))
      .sort((a, b) => a.d - b.d);

    if (!o.noShadow) {
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      for (const { k } of order) {
        poly(ctx, [
          P(k.x - 0.05, k.y - 0.05, 0),
          P(k.x + k.w + 0.05, k.y - 0.05, 0),
          P(k.x + k.w + 0.05, k.y + k.h + 0.05, 0),
          P(k.x - 0.05, k.y + k.h + 0.05, 0)
        ]);
        ctx.fill();
      }
    }

    for (const { k, i } of order) {
      drawCap(ctx, k, designs[i], P, vis, o, i === o.selectedIndex, "k" + i);
    }
  }

  /**
   * 渲染单颗键帽（带小块底板），用于单键预览 / 导出
   * o: { yaw, elev, focal, cx, cy, dist, plateColor, getImg, version, noShadow }
   */
  function renderSingle(ctx, k, d, o) {
    const pm = 0.55;
    const x0 = k.x - pm, y0 = k.y - pm, x1 = k.x + k.w + pm, y1 = k.y + k.h + pm;
    const dist = o.dist || 6;
    const P = makeProjector(o.yaw, o.elev, o.focal, o.cx, o.cy, dist);
    const vis = makeVis(o.yaw, o.elev, dist);

    drawSlab(ctx, P, vis, x0, y0, x1, y1, 0, -0.45, o.plateColor || "#23252f");

    const cxc = k.x + k.w / 2, cyc = k.y + k.h / 2;
    if (!o.noShadow) {
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      poly(ctx, [
        P(k.x - 0.06, k.y - 0.06, 0),
        P(k.x + k.w + 0.06, k.y - 0.06, 0),
        P(k.x + k.w + 0.06, k.y + k.h + 0.06, 0),
        P(k.x - 0.06, k.y + k.h + 0.06, 0)
      ]);
      ctx.fill();
    }
    drawCap(ctx, k, d, P, vis, o, false, o.cacheKey || "single");
  }

  /* 点击拾取：取深度最大的命中顶面 */
  function pick(keys, px, py, P) {
    let best = null;
    keys.forEach((k, i) => {
      const h3 = capHeight(k);
      const q = [
        P(k.x + TI, k.y + TI, h3),
        P(k.x + k.w - TI, k.y + TI, h3),
        P(k.x + k.w - TI, k.y + k.h - TI, h3),
        P(k.x + TI, k.y + k.h - TI, h3)
      ];
      if (inQuad(q, px, py)) {
        const d = (q[0].d + q[1].d + q[2].d + q[3].d) / 4;
        if (!best || d > best.d) best = { i, d };
      }
    });
    return best ? best.i : null;
  }

  function inQuad(q, x, y) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cr === 0) continue;
      const sg = Math.sign(cr);
      if (s === 0) s = sg;
      else if (sg !== s) return false;
    }
    return true;
  }

  return { render, renderSingle, pick, makeProjector, distFor, capHeight, TI };
})();
