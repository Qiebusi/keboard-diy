/* =========================================================
 * 纹理与环境贴图
 * —— 由 preview3d.js 拆分而来，模块职责见 index.js 顶部的模块地图
 * ========================================================= */
import * as THREE from "three";

export function makeCapTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

let _studioEnv = null;
/* 程序化工作室环境贴图：柔和顶光 + 两侧灯带，供 PBR 材质反射 */
export function makeStudioEnv() {
  if (_studioEnv) return _studioEnv;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#d8dee8");
  grad.addColorStop(0.45, "#70747c");
  grad.addColorStop(1, "#23252a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(28, 16, 195, 62);
  g.fillRect(298, 24, 172, 54);
  g.fillStyle = "rgba(255,240,220,0.5)";
  g.fillRect(180, 92, 210, 30);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.encoding = THREE.sRGBEncoding;
  _studioEnv = t;
  return t;
}

let _badgeTex = null;
export function badgeTexture() {
  if (_badgeTex) return _badgeTex;
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#191a1e";
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#e9e5dd";
  g.font = "600 44px Inter, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("KEYCAP STUDIO", cv.width / 2, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false;
  _badgeTex = t;
  return t;
}
