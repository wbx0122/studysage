/** 通用工具函数 */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** 归一化文本：小写、去标点与多余空格，便于关键词匹配 */
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[，。、；：？！,.!?;:（）()\[\]【】""''`'"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 判断文本是否包含某关键词（归一化后比较，支持中英文） */
export function containsKeyword(text, keyword) {
  const t = normalizeText(text);
  const k = normalizeText(keyword);
  if (!k) return false;
  // 含空格的英文/短语按整体匹配，中文按子串匹配
  return t.includes(k);
}

/** 统计命中的关键词数量 */
export function countHits(text, keywords) {
  const hits = [];
  for (const kw of keywords) {
    if (containsKeyword(text, kw)) hits.push(kw);
  }
  return hits;
}

/** 数值答案匹配，支持容差 */
export function matchNumeric(input, target, tolerance = 0) {
  const raw = String(input).replace(/[，,。\s]/g, '').replace(/^[xX]=?/, '');
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return false;
  return Math.abs(v - target) <= tolerance;
}

/** 判定一个输入是否满足题目的 answerRules */
export function matchAnswer(input, rules) {
  for (const rule of rules) {
    if (rule.numeric !== undefined) {
      if (matchNumeric(input, rule.numeric, rule.tolerance ?? 0)) return true;
    } else if (rule.keyword) {
      const words = Array.isArray(rule.keyword) ? rule.keyword : [rule.keyword];
      const ok = words.every(w => containsKeyword(input, w));
      if (ok) return true;
    } else if (rule.regex) {
      if (new RegExp(rule.regex, 'i').test(input)) return true;
    }
  }
  return false;
}

/** 从常见错误列表里识别学生错答对应的错误原因 */
export function inferCommonWrong(input, commonWrong) {
  const norm = normalizeText(input);
  for (const w of commonWrong || []) {
    for (const m of w.match) {
      if (typeof m === 'number') {
        const v = parseFloat(norm);
        if (!Number.isNaN(v) && Math.abs(v - m) < 1e-9) return w;
      } else if (norm === normalizeText(m) || norm.includes(normalizeText(m))) {
        return w;
      }
    }
  }
  return null;
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 简易 DOM 构造器：h('div.cls#id', {onClick}, child...) */
export function h(tag, attrs = {}, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  let cls = [], id = null;
  for (const r of rest) {
    if (r.startsWith('.')) cls.push(r.slice(1));
    else if (r.startsWith('#')) id = r.slice(1);
  }
  if (cls.length) el.className = cls.join(' ');
  if (id) el.id = id;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
