/* =========================================================
 * 3D 键盘预览（纯 Canvas，正交投影 + 画家算法）
 * - 键帽为带锥度的立体帽（顶面小于底面，符合实物比例）
 * - 支持偏航 / 俯仰旋转、点击拾取、实时反映设计数据
 * ========================================================= */

const Preview3D = (() => {

  const CAP_H_BASE = 0.42;   // 键帽高度（u）
  const TI = 0.125;          // 顶面内缩（与平面渲染一致）

  const spriteCache = new Map();

  function legendSprite(text, color) {
    const key = text + "|" + color;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const fs = 64, pad = 10;
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = `600 ${fs}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
    const tw = Math.ceil(measure.measureText(text).width);
    const c = document.createElement("canvas");
    c.width = tw + pad * 2;
    c.height = fs + pad * 2;
    const g = c.getContext("2d");
    g.font = measure.font;
    g.fillStyle = color;
    g.textBaseline = "top";
    g.fillText(text, pad, pad);
    spriteCache.set(key, c);
    return c;
  }

  function capHeight(k) {
    return CAP_H_BASE + (k.h > 1 ? 0.1 : 0) + (k.w >= 2.75 ? 0.03 : 0);
  }

  /* 正交投影器：世界坐标(u) → 屏幕坐标 */
  function makeProjector(yaw, elev, scale, cx, cy) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const ce = Math.cos(elev), se = Math.sin(elev);
    return (X, Y, Z) => {
      const x1 = X * ca - Y * sa;
      const y1 = X * sa + Y * ca;
      return {
        x: cx + x1 * scale,
        y: cy + (y1 * se - Z * ce) * scale,
        d: y1 * ce + Z * se            // 面向相机深度（越大越近）
      };
    };
  }

  /* 侧面可见性判定（世界 XY 法线） */
  function makeVis(yaw, elev) {
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const ce = Math.cos(elev);
    return (nx, ny) => {
      const nx1 = nx * ca - ny * sa;
      const ny1 = nx * sa + ny * ca;
      return (nx1 * sa + ny1 * ca) * ce > 0.001;
    };
  }

  /* 按旋转后法线做明暗着色（光源自屏幕左上） */
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

  /* 平板（底板 / 外壳） */
  function drawSlab(ctx, P, vis, x0, y0, x1, y1, zTop, zBot, color) {
    const b = [P(x0, y0, zBot), P(x1, y0, zBot), P(x1, y1, zBot), P(x0, y1, zBot)];
    const t = [P(x0, y0, zTop), P(x1, y0, zTop), P(x1, y1, zTop), P(x0, y1, zTop)];
    const sides = [
      { n: [0, -1], q: [b[0], b[1], t[1], t[0]] },
      { n: [1, 0], q: [b[1], b[2], t[2], t[1]] },
      { n: [0, 1], q: [b[2], b[3], t[3], t[2]] },
      { n: [-1, 0], q: [b[3], b[0], t[0], t[3]] }
    ];
    for (const s of sides) {
      if (!vis(s.n[0], s.n[1])) continue;
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

  /* 单个键帽（侧面梯形 + 顶面仿射贴图） */
  function drawCap(ctx, k, d, P, vis, o, selected) {
    const bg = (d && d.bg) || "#e9ecf5";
    const x = k.x, y = k.y, w = k.w, hh = k.h;
    const h3 = capHeight(k);
    const ti = TI;

    /* 侧面 */
    const bNW = P(x, y, 0), bNE = P(x + w, y, 0), bSE = P(x + w, y + hh, 0), bSW = P(x, y + hh, 0);
    const tNW = P(x + ti, y + ti, h3), tNE = P(x + w - ti, y + ti, h3);
    const tSE = P(x + w - ti, y + hh - ti, h3), tSW = P(x + ti, y + hh - ti, h3);

    const sideDefs = [
      { n: [0, -1], q: [bNW, bNE, tNE, tNW] },
      { n: [1, 0], q: [bNE, bSE, tSE, tNE] },
      { n: [0, 1], q: [bSE, bSW, tSW, tSE] },
      { n: [-1, 0], q: [bSW, bNW, tNW, tSW] }
    ];
    for (const s of sideDefs) {
      if (!vis(s.n[0], s.n[1])) continue;
      poly(ctx, s.q);
      ctx.fillStyle = faceColor(bg, s.n[0], s.n[1], o.yaw);
      ctx.fill();
    }

    /* 顶面（仿射变换：背景 / 图片 / 光影 / 图例） */
    const tw = w - 2 * ti, th = hh - 2 * ti;
    const p00 = tNW, p10 = tNE, p01 = tSW;
    const ux = { x: p10.x - p00.x, y: p10.y - p00.y };
    const vx = { x: p01.x - p00.x, y: p01.y - p00.y };

    ctx.save();
    ctx.transform(ux.x / tw, ux.y / tw, vx.x / th, vx.y / th, p00.x, p00.y);

    Render.roundRectPath(ctx, 0, 0, tw, th, 0.09);
    ctx.fillStyle = bg;
    ctx.fill();

    if (d && d.img && d.img.data) {
      const el = o.getImg(d.img.data);
      if (el && el.complete && el.naturalWidth > 0) {
        const iw = el.naturalWidth, ih = el.naturalHeight;
        ctx.save();
        Render.roundRectPath(ctx, 0, 0, tw, th, 0.09);
        ctx.clip();
        const base = Math.max(tw / iw, th / ih);
        const s = base * (d.img.scale || 1);
        ctx.translate(tw / 2 + (d.img.ox || 0) * tw, th / 2 + (d.img.oy || 0) * th);
        ctx.rotate((d.img.rot || 0) * Math.PI / 180);
        ctx.drawImage(el, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
        ctx.restore();
      }
    }

    /* 顶面光影 */
    ctx.save();
    Render.roundRectPath(ctx, 0, 0, tw, th, 0.09);
    ctx.clip();
    const gr = ctx.createLinearGradient(0, 0, 0, th);
    gr.addColorStop(0, "rgba(255,255,255,0.14)");
    gr.addColorStop(0.5, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, tw, th);
    ctx.restore();

    /* 图例（离屏精灵，避免变换下字号过小） */
    const legend = d && d.legend != null ? d.legend : k.label;
    if (legend) {
      const color = (d && d.legendColor) || (Render.luminance(bg) > 0.55 ? "#3a3d46" : "#e8eaf2");
      const fsW = Math.min(th * 0.38 * ((d && d.legendSize) || 1), 0.30);
      const spr = legendSprite(legend, color);
      const dw = spr.width * (fsW / 64);
      const dh = spr.height * (fsW / 64);
      ctx.drawImage(spr, 0.07, 0.05, dw, dh);
    }

    Render.roundRectPath(ctx, 0, 0, tw, th, 0.09);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 0.015;
    ctx.stroke();

    ctx.restore();

    /* 选中态 */
    if (selected) {
      ctx.save();
      poly(ctx, [bNW, bNE, bSE, bSW]);
      ctx.shadowColor = "rgba(90,140,255,0.9)";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#6ea8ff";
      ctx.lineWidth = Math.max(2, o.scale * 0.03);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 渲染整块键盘
   * o: { yaw, elev, scale, cx, cy, plateColor, selectedIndex, getImg, noShadow }
   */
  function render(ctx, keys, designs, o) {
    const { W, H } = layoutBounds(keys);
    const P = makeProjector(o.yaw, o.elev, o.scale, o.cx, o.cy);
    const vis = makeVis(o.yaw, o.elev);
    const pm = 0.35;

    /* 底板 */
    drawSlab(ctx, P, vis, -pm, -pm, W + pm, H + pm, 0, -0.4, o.plateColor || "#23252f");

    /* 按深度排序（远 → 近） */
    const order = keys
      .map((k, i) => ({ k, i, d: P(k.x + k.w / 2, k.y + k.h / 2, 0.2).d }))
      .sort((a, b) => a.d - b.d);

    /* 接触阴影 */
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
      drawCap(ctx, k, designs[i], P, vis, o, i === o.selectedIndex);
    }
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

  return { render, pick, makeProjector, capHeight, TI };
})();
