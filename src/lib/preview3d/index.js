/* =========================================================
 * 3D 键盘预览（Three.js / WebGL，UMD 全局 THREE）
 *
 * 架构（对齐轻量渲染器的设计）：
 *   每颗键帽 = 1 份几何 + 1 张纹理 + 1 个材质 + 1 次 draw call
 *
 * 核心设计：十字展开图即纹理图集。
 *   每键一张"展开图画布"（顶面 + 四壁 + 底面色条），
 *   几何 UV 直接映射到展开图各区域——折叠翻转/转置全部在 UV 中完成，
 *   不存在侧壁纹理、材质数组、分组切换。
 *   - 未包裹模式：图片只画进顶面区域，四壁为纯底色
 *   - 十字包裹模式：图片铺满整张展开图，自然延续到四壁
 *
 * 性能约定：
 *   - 按需渲染（脏标记），静止零 GPU 开销
 *   - 阴影贴图仅在场景几何变化时烘焙
 *   - 轴体使用 InstancedMesh（整盘共 3 次 draw call）
 *   - 键帽/底板矩阵冻结（静态物件）
 * ========================================================= */

/* ---------- 模块地图 ----------
 *   spec.js          尺寸规格表（mm → u）：MX / REF / 外壳常量 / 分层常量
 *   textures.js      键帽纹理、环境贴图、铭牌纹理
 *   paper.js         纸样展开：尺寸、UV 映射、顶面凹面、取模预览画布
 *   capGeometry.js   键帽几何（含轴心柱 + 十字插槽）
 *   shapes.js        2D 形状工具：Shape / Path、键位开孔合并
 *   deform.js        外壳底面斜坡位场、落地姿态矩阵
 *   caseAssembly.js  底盘装配：定位板 / 上下壳 / USB-C / PCB / 轴座 / 卫星轴 / 脚垫
 *   View.js          通用视图类：渲染循环、相机轨道、分层拆解、拾取、截图
 * --------------------------------------------------------- */

import { netDims, netOutline } from "./paper.js";
import { View } from "./View.js";

/* ---------- 对外 API ---------- */
function createBoardView(canvas, opts = {}) {
  return new View(canvas, { ...opts, single: false });
}

function createSingleView(canvas, opts = {}) {
  const v = new View(canvas, { ...opts, single: true });
  v.autorotate = true;
  v.setActive(true);
  return v;
}

export { createBoardView, createSingleView, netDims, netOutline };
