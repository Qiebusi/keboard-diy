/* =========================================================
 * 尺寸规格表（mm → u）
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";

export const PXU = 200;           // 纹理分辨率（px / u）
export const FOV = 40;
export const FLOAT = 0.34;        // 裙边底部离底板高度（露出轴体上座）
/* ---------- 分层拆解（像楼层一样把键盘拆开看）----------
 * 每件都归属一个"层"，展开时整层沿世界 Y 抬起，层间留出空隙。
 * 自下而上：下壳 → PCB（轴座/卫星轴）→ 定位板 → 上盖边框 → 轴体 → 键帽 */
export const EXPLODE_STEP = 0.8;   // 每层抬升量（u；≈15.2mm）
export const EXPLODE_LAYERS = { bottom: 0, pcb: 1, plate: 2, rims: 3, switch: 4, cap: 5 };
/* 层号 → 层名（自下而上） */
export const EXPLODE_NAMES = Object.keys(EXPLODE_LAYERS)
  .sort((a, b) => EXPLODE_LAYERS[a] - EXPLODE_LAYERS[b]);
export const BP = 6;              // 展开图画布底部预留色条高度（底面采样区，px）
export const STEM = new THREE.Color(0x17181d);   // 轴体颜色
export const ACCENT = new THREE.Color(0xd9480f); // 选中强调色

/* 真实 MX 轴体 / 定位板尺寸（mm → u，1u = 19.05mm）：
   定位板上表面定在 y = 0；上盖 9.9×5.5、法兰填满 14mm 开孔、
   十字外包 4.1mm、臂厚 1.17mm（Cherry 规格 14±0.05 / 4.1+0.05） */
export const MX = {
  hole: 14.0 / 19.05,     // 定位板开孔
  plateT: 1.5 / 19.05,    // 定位板厚
  flange: 13.9 / 19.05,   // 穿过开孔的法兰（单边留 0.05 间隙）
  upperW: 9.9 / 19.05,    // 上盖宽
  upperH: 5.5 / 19.05,    // 上盖高（板面以上）
  cross: 4.1 / 19.05,     // 十字外包尺寸
  arm: 1.17 / 19.05,      // 十字臂厚
  crossH: 3.0 / 19.05     // 十字露出高度
};
export const MX_Y = {            // 轴体各件中心高度（u）—— 下壳中心见下方 LOWER_H
  housing: MX.upperH / 2,
  stem: MX.upperH + MX.crossH / 2
};
/* 其余底盘件的参考尺寸（mm → u）：
   PCB 厚 1.6（FR4 标准）、定位板下沿到 PCB 面 5.0（常见设计值）；
   卫星轴距轴心 11.938（Cherry 规格）、钢丝 Ø1.6、定位板过孔按轴心 4.1 单边留 0.45；
   热插拔轴座 ≈10.5×5.5×3.2（卧贴常见体型，按简化体建）；
   USB-C 插座口 8.34×2.56（USB 规范）、面板开孔常用 9.0×3.3；
   脚垫 20×10×2、脚撑两级 7°/0° —— 取自开源套件 PH60（ph-design/PH60）的 BOM。 */
export const REF = {
  pcbT: 1.6 / 19.05,
  pcbGap: 5.0 / 19.05,
  socket: [10.5 / 19.05, 5.5 / 19.05, 3.2 / 19.05],
  stabX: 11.938 / 19.05,
  stabHole: 5.0 / 19.05,
  wire: 1.6 / 19.05,
  /* USB-C 母座：外形 8.94×3.16（圆角 R1.5）、口内 8.34×2.56、
     舌片厚 0.65、插入深度 6.65 —— 取自连接器厂商规格表 */
  usbShell: [8.94 / 19.05, 3.16 / 19.05, 1.5 / 19.05],
  usbMouth: [8.34 / 19.05, 2.56 / 19.05, 1.2 / 19.05],
  usbTongue: [6.5 / 19.05, 0.65 / 19.05]
};
export const PCB_Y = -(MX.plateT + REF.pcbGap);   // PCB 上表面（板面下 6.5mm）
export const LOWER_H = -PCB_Y;                    // 轴体下壳高（板下沿 → PCB 面，6.5mm）
MX_Y.flange = -LOWER_H / 2;                // 轴体下壳中心
export const CASE_BOT = -0.72;                    // 下壳底面（要容下 PCB + 轴座）
export const CASE_LIP = 8.0 / 19.05;              // 上盖高出板面的量（高边框：键帽下半截落在里面）
export const CASE_R = 0.16;                       // 外壳四角圆角（≈3mm）
export const SEAM = 0.02;                         // 上/下壳分模线的错台量
export const TOP_BOT = -0.157;                    // 上盖底面（分模线位置，板面下 3mm）
export const INNER_GAP = 1.2 / 19.05;             // 键位区到外壳内壁的间隙
export const PLATE_PM = 3.6 / 19.05;              // 定位板外扩量（要小于下壳内腔半径 3.9mm）
export const PLATE_SLOT = PLATE_PM + 0.1 / 19.05; // 定位板在壳里那圈卡槽的内口（比板大 0.1）
export const WALL_T = 2.4 / 19.05;                // 下壳壁厚
export const PCUT = [9.2 / 19.05, 3.4 / 19.05, 1.7 / 19.05];  // 后壁 USB-C 开孔（母座 8.94×3.16 留 0.13 单边）
export const CASE_ANG = 6 * Math.PI / 180;        // 外壳底面斜坡角度（后面高，键帽面保持水平）
export const CASE_K = Math.tan(CASE_ANG);         // 位移系数：正号 = 后面（小 z）压低 → 后面更高

/* 键帽纹理：禁 mipmap + 线性过滤（NPOT 画布必需；mipmap 会采样到陈旧链层） */
