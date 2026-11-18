/**
 * 本地存储层：所有数据保存在浏览器 localStorage，离线可用，无后端依赖。
 * 提供订阅机制，视图随状态变化自动刷新。
 */
const STORAGE_KEY = 'studysage_state_v1';

const DEFAULT_STATE = {
  role: 'student',
  studentName: '我',
  records: [],        // 本地学生答题记录
  feynman: [],        // 费曼复述记录
  reviews: [],        // 间隔复习安排
  socratic: {},       // 苏格拉底引导会话（按 questionId 索引）
  searchHistory: [],  // 全网知识搜索历史（最近 20 条）
  classData: null,    // 班级成绩导入数据（教师端）
  onboarded: false
};

const listeners = new Set();

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    if (
      patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) &&
      base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (e) {
    console.warn('[storage] 读取失败，使用默认状态', e);
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadRaw();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[storage] 写入失败', e);
  }
  listeners.forEach(fn => fn(state));
}

export const store = {
  getState() {
    return state;
  },
  /** 局部更新（浅合并顶层字段；传函数则拿到当前 state 返回新片段） */
  update(patcher) {
    const patch = typeof patcher === 'function' ? patcher(state) : patcher;
    state = deepMerge(state, patch);
    persist();
    return state;
  },
  /** 直接替换整个状态（演示重置用） */
  replace(next) {
    state = { ...structuredClone(DEFAULT_STATE), ...next };
    persist();
    return state;
  },
  reset() {
    state = structuredClone(DEFAULT_STATE);
    persist();
    return state;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // —— 领域级便捷方法 ——
  addRecord(record) {
    state = { ...state, records: [...state.records, record] };
    persist();
  },
  upsertReview(review) {
    const idx = state.reviews.findIndex(r => r.kpId === review.kpId);
    const reviews = state.reviews.slice();
    if (idx >= 0) reviews[idx] = review; else reviews.push(review);
    state = { ...state, reviews };
    persist();
  },
  saveSocratic(questionId, session) {
    state = { ...state, socratic: { ...state.socratic, [questionId]: session } };
    persist();
  },
  addFeynman(entry) {
    state = { ...state, feynman: [...state.feynman, entry] };
    persist();
  },
  /** 记录搜索历史（去重、最多保留 20 条） */
  addSearchHistory(keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return;
    const rest = state.searchHistory.filter(k => k !== kw);
    state = { ...state, searchHistory: [kw, ...rest].slice(0, 20) };
    persist();
  },
  clearSearchHistory() {
    state = { ...state, searchHistory: [] };
    persist();
  },
  /** 保存班级成绩导入数据（教师端） */
  setClassData(classData) {
    state = { ...state, classData };
    persist();
  },
  /** 清空班级成绩数据 */
  clearClassData() {
    state = { ...state, classData: null };
    persist();
  }
};
