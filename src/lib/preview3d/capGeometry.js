/* =========================================================
 * 键帽几何（裙边 + 锥度 + 倾斜 + 凹面 + 轴心柱）
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";
import { PXU, BP } from "./spec.js";
import { makeNetMap, makeDish } from "./paper.js";
import { stabPositions } from "./shapes.js";

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
export function capGeometry(k, params, dims, withSocket) {
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
