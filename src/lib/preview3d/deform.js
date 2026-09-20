/* =========================================================
 * 外壳底面斜坡位场与落地姿态
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";

/* ---------- 外壳底面斜坡 ----------
 * 斜面就是**外壳底面**（贴地那面）：底面被斜切，越靠后外壳越高；
 * 装键帽的那面（直角面，分模线以上）一点不动，保持方正水平。
 * 位移场 y += k·(z − zMid)·w(y)：w 在分模线处为 0、往下线性升到底面为 1。 */
export function wedgeGeo(geo, o, oy = 0, oz = 0) {
  const pos = geo.attributes.position;
  const span = o.yTop - o.yBot;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + oy;
    const w = Math.min(1, Math.max(0, (o.yTop - y) / span));   // 分模线 0 → 底面 1
    if (w <= 0) continue;
    pos.setY(i, pos.getY(i) + o.k * (pos.getZ(i) + oz - o.zMid) * w);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* 实例化网格（轴座）：每个实例按自己所在高度取位场，整体平移 */
export function wedgeInstances(im, o) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const w = Math.min(1, Math.max(0, (o.yTop - p.y) / (o.yTop - o.yBot)));
    if (w <= 0) continue;
    m.setPosition(p.x, p.y + o.k * (p.z - o.zMid) * w, p.z);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
}

/* 落地姿态：整机绕（底面中心、x 轴）回转，让外壳的**斜面正好平行于桌面** ——
 * 也就是外壳真正坐在自己的斜面上（放在桌上不会再是翘着的）。 */
export function caseRestMatrix(a, yBot, zMid) {
  return new THREE.Matrix4().makeTranslation(0, yBot, zMid)
    .multiply(new THREE.Matrix4().makeRotationX(a))
    .multiply(new THREE.Matrix4().makeTranslation(0, -yBot, -zMid));
}
