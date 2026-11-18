/**
 * 全网知识搜索引擎
 * ─────────────────────────────────────────────
 * 让学生能搜索任意学科的知识点，不再局限于内置题库。
 *  - 本地模式：在内置知识图谱中做关键词检索，命中即返回结构化知识点卡片；
 *  - 远程模式：调用用户配置的大模型 API，让模型扮演“知识百科检索引擎”，
 *    返回结构化 JSON（定义 / 关键概念 / 常见误解 / 相关知识 / 典型例题）。
 * 两种模式返回同一数据结构，UI 无需区分来源。
 */
import { llmAdapter } from './llmAdapter.js';
import { KNOWLEDGE_POINTS } from '../data/knowledgeMap.js';
import { containsKeyword, normalizeText } from '../utils/helpers.js';

/** 搜索结果的统一结构 */
function makeResult(kp, source) {
  return {
    keyword: kp.name,
    name: kp.name,
    subject: kp.subject,
    chapter: kp.chapter || '',
    definition: kp.canonical,
    keyConcepts: kp.keyConcepts.slice(),
    misconceptions: (kp.misconceptions || []).slice(),
    related: findRelatedNames(kp),
    difficulty: '中等',
    example: '',
    kpId: kp.id || null,
    source
  };
}

/** 根据先修关系找相关知识名称 */
function findRelatedNames(kp) {
  const related = [];
  for (const other of KNOWLEDGE_POINTS) {
    if (other.id === kp.id) continue;
    if ((kp.prerequisites || []).includes(other.id) || (other.prerequisites || []).includes(kp.id)) {
      related.push(other.name);
    }
  }
  return related;
}

/** 本地检索：在内置知识图谱中按名称/关键概念匹配 */
function searchLocal(keyword) {
  const kw = normalizeText(keyword);
  if (!kw) return { hits: [], message: '请输入要搜索的知识点关键词。' };

  const scored = [];
  for (const kp of KNOWLEDGE_POINTS) {
    let score = 0;
    if (normalizeText(kp.name).includes(kw) || kw.includes(normalizeText(kp.name))) score += 5;
    if (normalizeText(kp.subject).includes(kw)) score += 2;
    if (normalizeText(kp.chapter || '').includes(kw)) score += 2;
    for (const c of kp.keyConcepts) {
      if (containsKeyword(kw, c) || containsKeyword(c, kw)) score += 1;
    }
    for (const m of kp.misconceptions || []) {
      if (containsKeyword(kw, m) || containsKeyword(m, kw)) score += 0.5;
    }
    if (score > 0) scored.push({ kp, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return {
      hits: [],
      message: `本地知识图谱中未找到“${keyword}”。切换到远程大模型后可搜索全网任意知识点，或换个关键词试试。`
    };
  }
  return {
    hits: scored.map(s => makeResult(s.kp, 'local')),
    message: `在本地知识图谱中找到 ${scored.length} 个相关知识点。`
  };
}

/** 远程检索：让大模型扮演知识百科检索引擎，返回结构化 JSON */
const SEARCH_SYSTEM_PROMPT = `你是一个专业的“全网知识百科检索引擎”，服务于中学生和学习者。
用户会输入一个知识点关键词，你需要像百科检索一样返回该知识点的结构化信息。

严格要求：
1. 必须返回合法 JSON（不要 markdown 代码块、不要多余文字），字段如下：
{
  "name": "知识点标准名称",
  "subject": "所属学科（如：数学/物理/化学/生物/语文/英语/历史/地理/信息技术等）",
  "chapter": "常见教材章节归属（尽量具体，不确定可留空字符串）",
  "definition": "严谨且易懂的核心定义与解释（120-250字，面向中学生，用通俗语言讲清楚是什么、为什么）",
  "keyConcepts": ["3-6个理解该知识点必须掌握的关键概念或要素"],
  "misconceptions": ["2-4条学生最容易犯的理解偏差或常见错误认知"],
  "related": ["2-5个紧密相关的知识点名称，便于延伸学习"],
  "difficulty": "基础/中等/较难 三选一",
  "example": "一个贴近生活的典型例子或应用场景（50字以内）"
}
2. 内容必须准确、符合中学课程标准；如关键词过于模糊，按最常见学科含义解释。
3. 如果关键词完全不是知识点（如闲聊、无意义输入），返回 {"error":"无法识别为知识点，请输入具体的学习内容关键词，例如：勾股定理、光合作用、牛顿第二定律"}。`;

function searchRemote(keyword) {
  return llmAdapter.completeJSON(
    'search',
    `请检索知识点：${keyword}`,
    {
      systemOverride: SEARCH_SYSTEM_PROMPT,
      fallback: (input, err) => ({
        hits: [],
        message: `远程搜索失败：${err.message}。可先在“引擎设置”中测试连接，或切回本地模式查看内置知识点。`
      })
    }
  );
}

/** 统一搜索入口 */
export async function searchKnowledge(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return { hits: [], message: '请输入要搜索的知识点关键词。' };

  if (llmAdapter.isRemote) {
    const data = await searchRemote(kw);
    if (data?.error) return { hits: [], message: data.error };
    if (data?.hits) return data; // fallback 已返回结构化结果
    if (!data?.name) return { hits: [], message: '远程模型未返回有效结果，请稍后重试。' };
    // 尝试在本地知识图谱中关联（若命中内置知识点，补上 kpId 便于跳转练习）
    const localKp = KNOWLEDGE_POINTS.find(k =>
      normalizeText(k.name) === normalizeText(data.name) ||
      normalizeText(k.name).includes(normalizeText(data.name))
    );
    if (localKp) data.kpId = localKp.id;
    return {
      hits: [{ ...data, keyword: kw, source: 'remote' }],
      message: `已通过远程大模型检索到“${data.name}”的相关知识。`
    };
  }
  return searchLocal(kw);
}

/** 热门搜索推荐 */
export const HOT_SEARCHES = [
  '勾股定理', '光合作用', '牛顿第二定律', '一元二次方程',
  '电磁感应', '细胞结构', '三角函数', '化学方程式配平'
];

/** 注册到统一 AI 适配层 */
llmAdapter.registerLocalHandler(
  'search',
  input => searchLocal(input.keyword || input),
  () => SEARCH_SYSTEM_PROMPT
);