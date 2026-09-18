/* =========================================================
 * Canvas 键帽渲染（标准比例）
 * - 1u 键距为基准，键帽外框 = u - 间隙，顶面 ≈ 0.66u（真实 Cherry/OEM 比例）
 * - 高键（h:2）顶面按同比例内缩，视觉符合实物
 * ========================================================= */

const Render = (() => {

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* 颜色工具：hex → {r,g,b}，shade(-100~100)，亮度对比 */
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }
  function shade(hex, amt) {
    const { r, g, b } = hexToRgb(hex);
    const f = amt / 100;
    return rgbToHex(
      r + (f > 0 ? (255 - r) * f : r * f),
      g + (f > 0 ? (255 - g) * f : g * f),
      b + (f > 0 ? (255 - b) * f : b * f)
    );
  }
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  /* 横截面参数缺省值（u，每侧）：OEM 的 gap 0.5mm / xi 2.9mm / 后壁 0.25mm / 前壁 3.75mm。
   * 实际值由调用方按当前高度档案传入（o.ins），保证平面与 3D 完全同口径 */
  const DEFAULT_INS = { gap: 0.5 / 19.05, xi: 2.9 / 19.05, zB: 0.25 / 19.05, zF: 3.75 / 19.05 };

  /* 键帽几何（返回外框与顶面矩形）
   * ins 与 3D 的底环/顶环一致：外框 = 键位格内缩 gap，
   * 顶面再按 xi（左右）/ zB（后壁）/ zF（前壁）内缩 —— 前后两壁不等量，别用同一个值 */
  function capGeom(key, U, ins) {
    const src = ins || DEFAULT_INS;
    const gap = src.gap, xi = src.xi;
    const zB = src.zB != null ? src.zB : src.zi;   // 后壁内收（顶面后缘往里收）
    const zF = src.zF != null ? src.zF : src.zi;   // 前壁内收
    const m = gap * U;                         // 键间隙（底面相对键位格的内缩）
    const x0 = key.x * U + m;
    const y0 = key.y * U + m;
    const w = key.w * U - 2 * m;
    const h = key.h * U - 2 * m;
    const tw = Math.max(w - 2 * xi * U, U * 0.2);
    const th = Math.max(h - (zB + zF) * U, U * 0.2);
    return {
      x: x0, y: y0, w, h,
      tx: x0 + (w - tw) / 2,
      ty: y0 + zB * U,
      tw, th,
      r: U * 0.115,
      rt: U * 0.085
    };
  }

  /**
   * 绘制单个键帽
   * @param d 设计数据 {bg, legend, legendColor(null=自动), legendSize, img:{data,scale,rot,ox,oy}}
   * @param o {U, ins, selected, hover, getImg, exportMode}
   */
  function drawKey(ctx, key, d, o) {
    const U = o.U;
    const g = capGeom(key, U, o.ins);
    const bg = (d && d.bg) || "#e9ecf5";

    /* --- 投影 + 键帽侧面（外框） --- */
    ctx.save();
    if (!o.exportMode) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = U * 0.07;
      ctx.shadowOffsetY = U * 0.035;
    }
    roundRectPath(ctx, g.x, g.y, g.w, g.h, g.r);
    ctx.fillStyle = shade(bg, -38);
    ctx.fill();
    ctx.restore();

    /* --- 四条斜裙边棱线：底面角点 ↔ 顶面角点 ---
       俯视图靠这四条线才看得出是"四壁向里收分"的键帽：
       收分量左右 = xi、后 = zB、前 = zF，三者不等量，所以棱线不是 45°。
       起止点取圆角 45° 处的点（0.2929×半径），保证整条线都落在图形内 */
    ctx.save();
    ctx.strokeStyle = shade(bg, -66);
    ctx.lineWidth = Math.max(1, U * 0.013);
    ctx.lineCap = "round";
    const K45 = 0.2929;
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3) ? 1 : -1;      // 圆角在该角的内部方向
      const sy = (i < 2) ? 1 : -1;
      const ox = (i === 0 || i === 3) ? g.x : g.x + g.w;
      const oy = (i < 2) ? g.y : g.y + g.h;
      const tx2 = (i === 0 || i === 3) ? g.tx : g.tx + g.tw;
      const ty2 = (i < 2) ? g.ty : g.ty + g.th;
      ctx.beginPath();
      ctx.moveTo(ox + sx * K45 * g.r, oy + sy * K45 * g.r);
      ctx.lineTo(tx2 + sx * K45 * g.rt, ty2 + sy * K45 * g.rt);
      ctx.stroke();
    }
    ctx.restore();

    /* --- 顶面底色 --- */
    roundRectPath(ctx, g.tx, g.ty, g.tw, g.th, g.rt);
    ctx.fillStyle = bg;
    ctx.fill();

    /* --- 顶面图片（裁剪 + 变换） --- */
    if (d && d.img && d.img.data && o.getImg) {
      const el = o.getImg(d.img.data);
      if (el && el.complete && el.naturalWidth > 0) {
        ctx.save();
        roundRectPath(ctx, g.tx, g.ty, g.tw, g.th, g.rt);
        ctx.clip();
        const base = Math.max(g.tw / el.naturalWidth, g.th / el.naturalHeight);
        const s = base * (d.img.scale || 1);
        ctx.translate(
          g.tx + g.tw / 2 + (d.img.ox || 0) * g.tw,
          g.ty + g.th / 2 + (d.img.oy || 0) * g.th
        );
        ctx.rotate((d.img.rot || 0) * Math.PI / 180);
        ctx.scale(s, s);
        ctx.drawImage(el, -el.naturalWidth / 2, -el.naturalHeight / 2);
        ctx.restore();
      }
    }

    /* --- 顶面立体光影 --- */
    ctx.save();
    roundRectPath(ctx, g.tx, g.ty, g.tw, g.th, g.rt);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, g.ty, 0, g.ty + g.th);
    grad.addColorStop(0, "rgba(255,255,255,0.16)");
    grad.addColorStop(0.45, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = grad;
    ctx.fillRect(g.tx, g.ty, g.tw, g.th);
    if (o.hover) {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(g.tx, g.ty, g.tw, g.th);
    }
    ctx.restore();

    /* --- 图例文字 --- */
    const legend = d && d.legend != null ? d.legend : key.label;
    if (legend) {
      const fs = Math.min(g.th * 0.38 * ((d && d.legendSize) || 1), U * 0.30);
      const color = (d && d.legendColor) || (luminance(bg) > 0.55 ? "#3a3d46" : "#e8eaf2");
      ctx.fillStyle = color;
      ctx.font = `600 ${fs}px Inter, "Segoe UI", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const pad = Math.min(g.tw, g.th) * 0.10;
      ctx.fillText(legend, g.tx + pad, g.ty + pad * 0.9);
    }

    /* --- 顶面描边高光 --- */
    roundRectPath(ctx, g.tx, g.ty, g.tw, g.th, g.rt);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(1, U * 0.012);
    ctx.stroke();

    /* --- 选中态 --- */
    if (o.selected) {
      roundRectPath(ctx, g.x, g.y, g.w, g.h, g.r);
      ctx.strokeStyle = "#d9480f";
      ctx.lineWidth = Math.max(2, U * 0.035);
      ctx.stroke();
    }
  }

  /**
   * 绘制整块键盘（含底板）
   */
  function drawBoard(ctx, keys, designs, o) {
    const U = o.U;
    const { W, H } = layoutBounds(keys);

    /* 底板 */
    if (!o.noPlate) {
      const pm = U * 0.28;
      roundRectPath(ctx, -pm, -pm, W * U + 2 * pm, H * U + 2 * pm, U * 0.35);
      ctx.fillStyle = o.plateColor || "#23252f";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = U * 0.02;
      ctx.stroke();
    }

    keys.forEach((k, i) => {
      drawKey(ctx, k, designs[i], {
        U,
        ins: o.ins,                             // 横截面参数（与 3D 同口径）
        selected: o.selectedIndex === i,
        hover: o.hoverIndex === i,
        getImg: o.getImg,
        exportMode: !!o.exportMode
      });
    });
  }

  return { drawKey, drawBoard, capGeom, shade, luminance, roundRectPath };
})();
