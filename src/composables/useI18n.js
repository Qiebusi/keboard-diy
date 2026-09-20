/* =========================================================
 * 轻量国际化：语言状态 + 取词函数
 * - 不依赖第三方库：文案在 i18n/messages.js，{占位符} 由 t() 替换
 * - locale 是模块级单例，所有组件共享；切换后模板自动重渲染
 * - 语言偏好存 localStorage（界面偏好，不属于工程数据）
 * ========================================================= */
import { ref } from "vue";
import { MESSAGES, LANGS } from "../i18n/messages.js";

const STORE_KEY = "keycap-lang";

function initialLocale() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && MESSAGES[saved]) return saved;
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch (e) {
    return "zh";
  }
}

const locale = ref(initialLocale());

export function useI18n() {
  /* 取词：缺失的键回退到中文，再回退到键名本身（便于发现漏翻） */
  function t(key, params) {
    const dict = MESSAGES[locale.value] || MESSAGES.zh;
    let s = dict[key] != null ? dict[key] : MESSAGES.zh[key];
    if (s == null) s = key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.split(`{${k}}`).join(v);
      }
    }
    return s;
  }

  function setLocale(id) {
    if (!MESSAGES[id]) return;
    locale.value = id;
    try { localStorage.setItem(STORE_KEY, id); } catch (e) { /* 忽略 */ }
  }

  return { locale, t, setLocale, langs: LANGS };
}
