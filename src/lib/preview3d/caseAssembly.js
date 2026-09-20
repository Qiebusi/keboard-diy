/* =========================================================
 * 底盘装配：定位板 / 上下壳 / USB-C / PCB / 轴座 / 卫星轴 / 脚垫
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";
import { MX, REF, PCB_Y, CASE_BOT, CASE_LIP, CASE_R, SEAM, TOP_BOT, INNER_GAP, PLATE_PM, PLATE_SLOT, WALL_T, PCUT, CASE_ANG, CASE_K } from "./spec.js";
import { makeStudioEnv, badgeTexture } from "./textures.js";
import { sqPath, cRingShape, roundRectShape, stabPositions, mergeKeyRects } from "./shapes.js";
import { caseRestMatrix } from "./deform.js";

export function buildCase(keys, bounds, pm, mat) {
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

  /* 键位隔板：在沿口高度铺一层外壳塑料 —— 没有键帽的地方（键位区四周、布局里的
     留白和分组间隙）看到的是外壳本体，而不是 8mm 深的键井和定位板。
     开孔按"合并后的键位"来开：相邻键帽之间不留隔板，只有真正没有键的位置才有塑料。 */
  const LID_T = 1.2 / 19.05;
  const lidShape = roundRectShape(-pm, -pm, W + pm, H + pm, CASE_R, new THREE.Shape());
  const holeM = 0.2 / 19.05;      // 开孔比键位各向外放 0.2mm：相邻键位互相咬合成一整片
  const holeEps = 0.012 / 19.05;  // 洞口之间留 0.012mm 塑料，避免共边三角化
  for (const [x0, z0, x1, z1] of mergeKeyRects(keys, holeM)) {
    lidShape.holes.push(roundRectShape(
      x0 + holeEps, z0 + holeEps, x1 - holeEps, z1 - holeEps, 0.02, new THREE.Path()));
  }
  const caseLid = mkCase(lidShape, CASE_LIP, CASE_LIP - LID_T);
  const rims = [caseTopUp, caseTopSlot, caseTopLo, caseLid];

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
  pcb.userData.layer = "pcb";
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
  socks.userData.layer = "pcb";
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
      for (const sm of [house, bladeA, bladeB]) sm.userData.layer = "pcb";
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
    const wire = new THREE.Mesh(new THREE.TubeGeometry(path, 24, REF.wire / 2, 6, false), metalMat);
    wire.userData.layer = "pcb";
    parts.push(wire);
  }

  return { plate, caseMesh, rims, parts, mats, wedge: WED, rest: REST };
}
