/* =========================================================
 * 界面文案表（中 / 英）
 * - 键名用点号分组：组件名.元素；带 {xxx} 的是占位符，由 useI18n 的 t() 替换
 * - 需要 HTML 的文案（提示条）由模板 v-html 渲染
 * ========================================================= */

export const LANGS = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" }
];

export const MESSAGES = {
  zh: {
    "app.title": "键帽工坊",
    "app.docTitle": "键帽工坊 · Keycap Studio",
    "app.subtitle": "KEYCAP STUDIO · 1U = 19.05MM",

    /* 顶部工具栏 */
    "topbar.layout60": "60% · 61 键",
    "topbar.layout75": "75% · 87 键",
    "topbar.layoutTkl": "87 键 TKL",
    "topbar.layoutFull": "104 键全尺寸",
    "topbar.layoutCustom": "KLE 自定义布局",
    "topbar.importKle": "导入 KLE",
    "topbar.importKleTitle": "导入 Keyboard Layout Editor (KLE) JSON 布局",
    "topbar.flat": "平面",
    "topbar.mode3d": "3D",
    "topbar.exportBoard": "导出整盘",
    "topbar.exportKey": "导出当前键帽",
    "topbar.save": "保存工程",
    "topbar.load": "载入工程",
    "topbar.clear": "清空",

    /* 单键 3D 卡片 / 放大层 */
    "key3d.title": "单键 3D 预览",
    "key3d.zoom": "放大",
    "key3d.export": "导出",
    "key3d.emptyTitle": "在键盘中点击一颗键帽",
    "key3d.emptyHint": "拖拽旋转 · 滚轮缩放",
    "key3d.exit": "退出放大 (Esc)",

    /* 右侧面板 */
    "panel.empty": "在左侧点击一个键帽开始设计",
    "panel.spaceKeyTitle": "（空格 / 无图例键）",
    "panel.unitHigh": " × {h}u 高",
    "panel.pitch": "{mm}mm 键距标准",

    /* 键帽 / 图例 */
    "card.keycap.title": "键帽 / 图例",
    "card.keycap.bg": "底色",
    "card.keycap.legendColor": "图例颜色",
    "card.keycap.auto": "自动",
    "card.keycap.autoTitle": "跟随底色自动配色",
    "card.keycap.legend": "图例文字（留空隐藏）",
    "card.keycap.legendPlaceholder": "例如：A / Esc / 自定义",
    "card.keycap.legendSize": "图例大小",

    /* 图片贴图 */
    "card.image.title": "图片贴图",
    "card.image.upload": "上传图片",
    "card.image.formats": "JPG / PNG / WebP · 自动铺满键帽顶面",
    "card.image.drop": "也可拖入图片或 Ctrl+V 粘贴",
    "card.image.wrap": "贴图范围",
    "card.image.wrapTop": "仅顶面",
    "card.image.wrapNet": "十字展开包裹（顶面+四壁）",
    "card.image.netPreview": "取模预览 · 十字展开",
    "card.image.scale": "缩放",
    "card.image.rotate": "旋转",
    "card.image.ox": "水平位置",
    "card.image.oy": "垂直位置",
    "card.image.remove": "移除图片",

    /* 快捷操作 */
    "card.quick.title": "快捷操作",
    "card.quick.applyAll": "此设计应用到全部键",
    "card.quick.reset": "重置此键",

    /* 全局 */
    "card.global.title": "全局",
    "card.global.profile": "键帽高度档案（3D）",
    "card.global.capColor": "全局键帽颜色",
    "card.global.plateColor": "键盘底板颜色",
    "card.global.theme": "界面主题",
    "card.global.themeClassic": "经典 · 暖纸工作台",
    "card.global.themeTech": "科技 · 暗夜霓虹",
    "card.global.language": "界面语言",

    /* 高度档案 */
    "profile.oem": "OEM · 常见机械键盘",
    "profile.cherry": "Cherry · 原厂低矮",
    "profile.sa": "SA · 高球帽",
    "profile.dsa": "DSA · 等高球帽",
    "profile.xda": "XDA · 等高平顶",

    /* 3D 分层拆解 */
    "card.explode.title": "3D 分层拆解",
    "card.explode.on": "分层展开",
    "card.explode.off": "收起分层",
    "card.explode.gap": "层间距",
    "card.explode.layers": "层显示",
    "card.explode.showAll": "全部显示",
    "card.explode.desc": "自下而上：下壳 → PCB（轴座 / 卫星轴）→ 定位板 → 上盖边框 → 轴体 → 键帽",

    /* 层名 */
    "layer.cap": "键帽",
    "layer.switch": "轴体",
    "layer.rims": "上盖边框",
    "layer.plate": "定位板",
    "layer.pcb": "PCB·轴座·卫星轴",
    "layer.bottom": "下壳",

    /* 提示条 */
    "hint.flat": "单击选中键帽<i>·</i>双击 / 拖入图片上传<i>·</i>拖拽移动图片<i>·</i>滚轮缩放图片<i>·</i>Ctrl+V 粘贴图片到选中键",
    "hint.3d": "拖拽旋转视角<i>·</i>滚轮缩放<i>·</i>单击选中 / 双击上传图片<i>·</i>右侧面板实时生效",

    /* 轻提示 */
    "toast.imageApplied": "图片已应用到键帽",
    "toast.exploded": "分层展开：自下而上拆开查看",
    "toast.collapsed": "已收起分层",
    "toast.appliedAll": "已应用到全部键帽",
    "toast.cleared": "已清空全部设计",
    "toast.legendAuto": "图例颜色已恢复自动配色",
    "toast.profile": "已切换键帽高度档案：{name}",
    "toast.kleOk": "KLE 布局导入成功",
    "toast.kleFail": "导入失败：请提供 KLE 标准 JSON（二维数组）",
    "toast.exportBoard3d": "3D 视角整盘 PNG 已导出",
    "toast.exportBoard": "整盘 PNG 已导出",
    "toast.needSelection": "请先选中一个键帽",
    "toast.exportKey": "键帽 PNG 已导出",
    "toast.exportKey3d": "单键 3D PNG 已导出",
    "toast.saved": "工程文件已保存",
    "toast.loaded": "工程已载入",
    "toast.badProject": "工程文件格式不正确",
    "toast.parseFail": "工程文件解析失败"
  },

  en: {
    "app.title": "Keycap Studio",
    "app.docTitle": "Keycap Studio",
    "app.subtitle": "KEYCAP STUDIO · 1U = 19.05MM",

    /* Top toolbar */
    "topbar.layout60": "60% · 61 keys",
    "topbar.layout75": "75% · 87 keys",
    "topbar.layoutTkl": "87-key TKL",
    "topbar.layoutFull": "104-key full size",
    "topbar.layoutCustom": "KLE custom layout",
    "topbar.importKle": "Import KLE",
    "topbar.importKleTitle": "Import a Keyboard Layout Editor (KLE) JSON layout",
    "topbar.flat": "2D",
    "topbar.mode3d": "3D",
    "topbar.exportBoard": "Export board",
    "topbar.exportKey": "Export keycap",
    "topbar.save": "Save project",
    "topbar.load": "Load project",
    "topbar.clear": "Clear",

    /* Single-key 3D card / overlay */
    "key3d.title": "Single-key 3D",
    "key3d.zoom": "Zoom in",
    "key3d.export": "Export",
    "key3d.emptyTitle": "Click a keycap on the board",
    "key3d.emptyHint": "Drag to orbit · scroll to zoom",
    "key3d.exit": "Exit zoom (Esc)",

    /* Right panel */
    "panel.empty": "Click a keycap on the left to start designing",
    "panel.spaceKeyTitle": "(spacebar / no legend)",
    "panel.unitHigh": " × {h}u high",
    "panel.pitch": "{mm}mm key pitch",

    /* Keycap / legend */
    "card.keycap.title": "Keycap / legend",
    "card.keycap.bg": "Base color",
    "card.keycap.legendColor": "Legend color",
    "card.keycap.auto": "Auto",
    "card.keycap.autoTitle": "Pick a legend color that contrasts with the base color",
    "card.keycap.legend": "Legend text (empty to hide)",
    "card.keycap.legendPlaceholder": "e.g. A / Esc / custom",
    "card.keycap.legendSize": "Legend size",

    /* Artwork */
    "card.image.title": "Image artwork",
    "card.image.upload": "Upload image",
    "card.image.formats": "JPG / PNG / WebP · fills the keycap top face",
    "card.image.drop": "or drag an image in, or press Ctrl+V",
    "card.image.wrap": "Wrap mode",
    "card.image.wrapTop": "Top face only",
    "card.image.wrapNet": "Cross-unwrap (top + four sides)",
    "card.image.netPreview": "Unwrap preview · cross pattern",
    "card.image.scale": "Scale",
    "card.image.rotate": "Rotate",
    "card.image.ox": "Horizontal offset",
    "card.image.oy": "Vertical offset",
    "card.image.remove": "Remove image",

    /* Shortcuts */
    "card.quick.title": "Shortcuts",
    "card.quick.applyAll": "Apply this design to all keys",
    "card.quick.reset": "Reset this key",

    /* Global */
    "card.global.title": "Global",
    "card.global.profile": "Keycap height profile (3D)",
    "card.global.capColor": "Global keycap color",
    "card.global.plateColor": "Case / plate color",
    "card.global.theme": "UI theme",
    "card.global.themeClassic": "Classic · warm paper desk",
    "card.global.themeTech": "Tech · dark neon",
    "card.global.language": "Language",

    /* Height profiles */
    "profile.oem": "OEM · common mechanical keyboard",
    "profile.cherry": "Cherry · low profile",
    "profile.sa": "SA · tall spherical",
    "profile.dsa": "DSA · uniform spherical",
    "profile.xda": "XDA · uniform flat",

    /* 3D exploded view */
    "card.explode.title": "3D exploded view",
    "card.explode.on": "Explode layers",
    "card.explode.off": "Collapse layers",
    "card.explode.gap": "Layer spacing",
    "card.explode.layers": "Layers shown",
    "card.explode.showAll": "Show all",
    "card.explode.desc": "Bottom-up: bottom case → PCB (sockets / stabilizers) → switch plate → top case → switches → keycaps",

    /* Layer names */
    "layer.cap": "Keycaps",
    "layer.switch": "Switches",
    "layer.rims": "Top case",
    "layer.plate": "Plate",
    "layer.pcb": "PCB·sockets·stabs",
    "layer.bottom": "Bottom case",

    /* Hint bar */
    "hint.flat": "Click to select a keycap<i>·</i>Double-click / drag in an image<i>·</i>Drag to move the artwork<i>·</i>Scroll to zoom it<i>·</i>Ctrl+V pastes onto the selected key",
    "hint.3d": "Drag to orbit<i>·</i>Scroll to zoom<i>·</i>Click to select / double-click to upload<i>·</i>Panel changes apply live",

    /* Toasts */
    "toast.imageApplied": "Image applied to keycap",
    "toast.exploded": "Exploded view: layers spread bottom-up",
    "toast.collapsed": "Layers collapsed",
    "toast.appliedAll": "Applied to every keycap",
    "toast.cleared": "All designs cleared",
    "toast.legendAuto": "Legend color is back to auto",
    "toast.profile": "Height profile switched to: {name}",
    "toast.kleOk": "KLE layout imported",
    "toast.kleFail": "Import failed: please provide standard KLE JSON (2D array)",
    "toast.exportBoard3d": "3D board PNG exported",
    "toast.exportBoard": "Board PNG exported",
    "toast.needSelection": "Select a keycap first",
    "toast.exportKey": "Keycap PNG exported",
    "toast.exportKey3d": "Single-key 3D PNG exported",
    "toast.saved": "Project file saved",
    "toast.loaded": "Project loaded",
    "toast.badProject": "Invalid project file",
    "toast.parseFail": "Could not parse the project file"
  }
};
