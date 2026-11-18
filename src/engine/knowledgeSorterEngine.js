/**
 * 知识点梳理引擎
 * ─────────────────────────────────────────────
 * 学生上传含知识点的 Word/TXT/MD 文档，自动梳理出知识脉络与重点：
 *  - 文档读取：.docx 动态加载 mammoth.js（CDN）提取纯文本；.txt/.md 智能编码读取；
 *  - 本地梳理：基于文本结构分析——标题层级识别（章/节/点编号模式）、
 *    重点段落识别（关键词标注）、核心概念提取（词频统计）；
 *  - 远程梳理：调用大模型生成结构化知识脉络 JSON（大纲/重点/概念/学习建议）；
 *  - 注册 'knowledgeSort' 任务到 llmAdapter。
 */
import { llmAdapter } from './llmAdapter.js';
import { decodeBuffer } from './dataImportEngine.js';

/* ──────────────── 文档读取 ──────────────── */

let mammothPromise = null;

/** 动态加载 mammoth.js（仅需在线一次，之后缓存） */
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (mammothPromise) return mammothPromise;
  mammothPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
    script.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error('mammoth 库加载异常'));
    script.onerror = () => { mammothPromise = null; reject(new Error('Word 解析库加载失败（需联网）；可将文档另存为 .txt 后再上传。')); };
    document.head.append(script);
  });
  return mammothPromise;
}

/**
 * 读取文档文本。
 * 支持 .docx（mammoth 提取纯文本）、.txt/.md（智能编码检测，兼容 GBK/UTF-8）。
 */
export async function readDocText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'docx') {
    const mammoth = await loadMammoth();
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value || '';
  }
  if (ext === 'doc') {
    throw new Error('暂不支持旧版 .doc 格式，请在 Word 中另存为 .docx 或 .txt 后再上传。');
  }
  // .txt / .md / 无后缀 → 智能编码检测读取
  const buf = await file.arrayBuffer();
  return decodeBuffer(buf);
}

/* ──────────────── 本地结构分析 ──────────────── */

/** 标题编号模式（按优先级排列，匹配到即认定该行是标题） */
const HEADING_PATTERNS = [
  { re: /^第[一二三四五六七八九十百零\d]+[章节篇单元部分]/, level: 1 },  // 第一章 / 第3节
  { re: /^[一二三四五六七八九十]+[、.．]/, level: 1 },                    // 一、
  { re: /^\d+\.\d+\.\d+\s*\S/, level: 3 },                               // 1.1.1（先于 1.1 / 1.）
  { re: /^\d+\.\d+\s*\S/, level: 2 },                                    // 1.1（先于 1.）
  { re: /^\d+[、.．]\s*\S/, level: 1 },                                   // 1、 / 1.
  { re: /^（[一二三四五六七八九十\d]+）/, level: 2 },                     // （一）
  { re: /^\([一二三四五六七八九十\d]+\)/, level: 2 },                    // (一)
  { re: /^#{3,6}\s+\S/, level: 3 },                                      // Markdown ### 及更深（先于 ##）
  { re: /^##\s+\S/, level: 2 },                                          // Markdown ##（先于 #）
  { re: /^#\s+\S/, level: 1 },                                           // Markdown #
];

/** 重点标注关键词（段落含这些词则标记为重点） */
const KEYPOINT_KEYWORDS = [
  '重点', '关键', '核心', '要点', '必须', '务必', '注意', '切记',
  '重要', '本质', '前提', '基础', '首先', '总之', '综上', '结论',
  '公式', '定理', '定律', '定义', '原理', '法则'
];

/** 无实义的停用词（词频统计时排除） */
const STOP_WORDS = new Set([
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '什么', '怎么',
  '可以', '能够', '应该', '必须', '就是', '还有', '没有', '不是', '一个',
  '因此', '所以', '但是', '然而', '如果', '因为', '对于', '关于', '通过',
  '进行', '方面', '情况', '问题', '作用', '过程', '方法', '方式', '特点',
  '同时', '其中', '其他', '以下', '以上', '例如', '比如', '即', '等'
]);

/**
 * 判断一行文本是否是标题行，返回层级（1/2/3）或 null。
 * 规则：① 命中编号模式；② 或短行（≤30字）且不含句号/逗号等正文标点。
 */
function detectHeading(line) {
  const t = line.trim();
  if (!t || t.length > 40) return null;
  for (const p of HEADING_PATTERNS) {
    if (p.re.test(t)) return p.level;
  }
  // 短行 + 无正文标点 + 前后是空行 → 视为二级标题
  if (t.length <= 25 && !/[。，；：、？！,.!?;:]/.test(t) && /[\u4e00-\u9fa5a-zA-Z]/.test(t)) {
    return 2;
  }
  return null;
}

/** 提取中文核心词汇（2字 bigram 滑窗，排除停用词），用于词频统计 */
function extractTerms(text) {
  const terms = [];
  // 按非中文字符切分出连续中文片段，再提取 2 字滑窗 bigram
  const runs = String(text || '').match(/[\u4e00-\u9fa5]+/g) || [];
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const w = run.slice(i, i + 2);
      if (!STOP_WORDS.has(w)) terms.push(w);
    }
  }
  return terms;
}

/**
 * 本地模式：基于文本结构分析梳理知识脉络。
 * @param {string} text - 文档纯文本
 * @returns {object} { title, summary, outline, keyPoints, concepts, studyAdvice }
 */
export function sortKnowledgeLocal(text) {
  const lines = String(text || '').split(/\r?\n/);

  // ── 1. 逐行分析：识别标题与正文，构建大纲 ──
  const outline = [];
  let currentL1 = null;
  let currentL2 = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    const level = detectHeading(t);

    if (level === 1) {
      currentL1 = { level: 1, title: t, points: [] };
      outline.push(currentL1);
      currentL2 = null;
    } else if (level === 2) {
      if (!currentL1) {
        currentL1 = { level: 1, title: '概览', points: [] };
        outline.push(currentL1);
      }
      currentL2 = { level: 2, title: t, points: [] };
      currentL1.points.push(currentL2);
    } else if (level === 3) {
      const parent = currentL2 || currentL1;
      if (parent) parent.points.push({ level: 3, title: t, points: [] });
    } else {
      // 正文段落 → 归入最近的标题节点
      const target = currentL2 || currentL1;
      if (target) {
        target.points.push({ level: 0, text: t });
      }
    }
  }

  // 若没有任何标题结构 → 把全文按段落切分为平铺大纲
  if (!outline.length) {
    const paras = lines.map(l => l.trim()).filter(l => l && l.length > 10);
    const chunk = Math.max(1, Math.ceil(paras.length / 6));
    for (let i = 0; i < paras.length; i += chunk) {
      const seg = paras.slice(i, i + chunk).join(' ');
      outline.push({ level: 1, title: `段落 ${Math.floor(i / chunk) + 1}`, points: [{ level: 0, text: seg }] });
    }
  }

  // ── 2. 提取重点段落（含重点关键词的正文） ──
  const keyPoints = [];
  const walkCollect = nodes => {
    for (const n of nodes) {
      if (n.points) walkCollect(n.points);
      if (n.text && KEYPOINT_KEYWORDS.some(kw => n.text.includes(kw))) {
        const hit = KEYPOINT_KEYWORDS.filter(kw => n.text.includes(kw));
        keyPoints.push({ text: n.text.length > 120 ? n.text.slice(0, 120) + '…' : n.text, tags: hit });
      }
    }
  };
  walkCollect(outline);
  // 无关键词命中 → 取每个一级标题下第一条正文作为要点
  if (!keyPoints.length) {
    for (const o of outline) {
      const first = o.points.find(p => p.text);
      if (first) keyPoints.push({ text: first.text.length > 120 ? first.text.slice(0, 120) + '…' : first.text, tags: ['概要'] });
    }
  }

  // ── 3. 核心概念提取（词频 Top 8） ──
  const freq = new Map();
  for (const w of extractTerms(text)) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const top = [...freq.entries()]
    .filter(([w, c]) => c >= 2 && w.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const concepts = top.map(([w, c]) => ({
    name: w,
    explain: `文中出现 ${c} 次，属于本文档的高频核心术语`,
    weight: c
  }));

  // ── 4. 生成标题与概述 ──
  const title = outline[0]?.title || '未命名文档';
  const l1Count = outline.filter(o => o.level === 1).length;
  const summary = `本文档共梳理出 ${l1Count} 个主题模块、${keyPoints.length} 个要点、${concepts.length} 个核心概念。` +
    (keyPoints.length > 5 ? '内容较为丰富，建议按模块逐步消化。' : '内容精炼，建议优先掌握标注的重点段落。');

  // ── 5. 学习建议 ──
  const studyAdvice = [
    `先通读「${title}」整体大纲，建立知识框架后再深入细节`,
    keyPoints.length ? `重点关注 ${keyPoints.length} 个标注要点，尤其是高频出现的核心概念` : '注意归纳各模块的共性与差异',
    concepts.length ? `优先理解「${concepts.slice(0, 3).map(c => c.name).join('」「')}」等核心概念` : '边读边做笔记，用自己的话复述每个模块',
    '每学完一个模块，尝试用费曼复述检验掌握程度'
  ];

  return {
    title,
    summary,
    outline: outline.map(o => ({
      level: o.level,
      title: o.title,
      points: (o.points || []).map(p => p.level === 0 ? { text: p.text } : { level: p.level, title: p.title, points: p.points || [] })
    })),
    keyPoints: keyPoints.slice(0, 12),
    concepts,
    studyAdvice
  };
}

/* ──────────────── 远程大模型梳理 ──────────────── */

const KNOWLEDGE_SORT_PROMPT = `你是专业的知识梳理与学习规划专家。学生会提供一份学习文档的文本内容，请梳理出清晰的知识脉络与重点。

严格要求：
1. 必须返回合法 JSON（不要 markdown 代码块、不要多余文字），字段如下：
{
  "title": "文档主题（简明概括，15字内）",
  "summary": "内容概述（60-120字，概括文档覆盖的知识范围与整体结构）",
  "outline": [
    {"level": 1, "title": "模块名", "points": [
      {"level": 2, "title": "子模块名", "points": [{"text": "具体知识点描述"}]}
    ]}
  ],
  "keyPoints": [{"text": "重点内容概括（30-80字）", "tags": ["重点/核心/注意…"]}],
  "concepts": [{"name": "核心概念", "explain": "一句话解释（20-50字）", "weight": 1}],
  "studyAdvice": ["3-5条针对该文档的学习建议"]
}
2. outline 最多 3 层，模块数量控制在 3-8 个，不要把全文照搬；
3. keyPoints 提取真正的重点（考试常考/易错/基础性内容），5-10 条；
4. concepts 提取必须掌握的核心术语，5-8 个，weight 表示重要程度（1-5）；
5. 所有内容必须基于文档原文，不要编造文档中没有的知识。`;

/**
 * 梳理知识点脉络（远程模式调用大模型，本地模式结构分析）。
 * @param {string} text - 文档纯文本
 * @param {string} fileName - 文件名（用于元信息）
 */
export async function sortKnowledge(text, fileName = '') {
  if (!text || text.trim().length < 10) {
    throw new Error('文档内容过少，无法梳理。请确保文档包含有效的知识点内容。');
  }
  // 文本过长时截断（大模型上下文限制，保留开头 12000 字符）
  const content = text.length > 12000 ? text.slice(0, 12000) + '\n…（内容过长已截断）' : text;

  if (!llmAdapter.isRemote) return sortKnowledgeLocal(content);

  const result = await llmAdapter.completeJSON(
    'knowledgeSort',
    content,
    {
      systemOverride: KNOWLEDGE_SORT_PROMPT,
      fallback: () => sortKnowledgeLocal(content)
    }
  );
  // 兜底：大模型返回结构不完整时用本地结果补齐
  if (!result.outline?.length) return sortKnowledgeLocal(content);
  return result;
}

/* ──────────────── 注册到 AI 适配层 ──────────────── */

llmAdapter.registerLocalHandler(
  'knowledgeSort',
  input => sortKnowledgeLocal(typeof input === 'string' ? input : String(input || '')),
  () => KNOWLEDGE_SORT_PROMPT
);