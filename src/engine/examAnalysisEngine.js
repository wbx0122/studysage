/**
 * 试卷分析引擎
 * ─────────────────────────────────────────────
 * 学生上传考试试卷照片（图片版），自动分析考试情况并给出改进建议：
 *  - 图片预处理：canvas 压缩（最长边 1600px / JPEG 0.85），控制 vision API 体积；
 *  - 远程模式：大模型 vision 多模态直接"看图"分析——识别题目、错题、失分原因；
 *  - 本地模式：Tesseract.js OCR（CDN，chi_sim 中文）提取文字 → 规则分析兜底；
 *    OCR 不可用时支持学生手动输入试卷内容后分析。
 * 输出结构：科目/得分/整体概述/错题明细(题号·知识点·错误类型·原因·建议)/
 *           优势/薄弱领域/改进建议/复习规划。
 * 注册 'examAnalysis' 任务到 llmAdapter。
 */
import { llmAdapter } from './llmAdapter.js';

/* ──────────────── 图片预处理 ──────────────── */

/**
 * 压缩图片文件为 JPEG dataURL（控制体积，vision API 友好）。
 * @param {File} file - 图片文件
 * @param {number} maxSide - 最长边像素上限
 * @param {number} quality - JPEG 质量 0-1
 * @returns {Promise<string>} dataURL
 */
export function compressImage(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('请上传图片文件（JPG / PNG 等）。'));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (Math.max(w, h) > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片加载失败，请确认文件未损坏。'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(file);
  });
}

/* ──────────────── OCR（本地模式兜底） ──────────────── */

let tesseractPromise = null;

/** 动态加载 Tesseract.js（CDN，仅需在线一次） */
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract 库加载异常'));
    script.onerror = () => { tesseractPromise = null; reject(new Error('OCR 引擎加载失败（需联网）。可连接支持视觉的大模型 API 直接看图分析，或在下方手动输入试卷内容。')); };
    document.head.append(script);
  });
  return tesseractPromise;
}

/**
 * OCR 识别图片中的文字（中文简体 + 英文）。
 * @param {string} dataUrl - 图片 dataURL
 * @param {(p:number)=>void} onProgress - 进度回调 0-1
 * @returns {Promise<string>} 识别文本
 */
export async function ocrImage(dataUrl, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(dataUrl, 'chi_sim+eng', {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    }
  });
  return result?.data?.text || '';
}

/* ──────────────── 本地规则分析 ──────────────── */

/** 错误类型关键词分类表 */
const ERROR_TYPE_KEYWORDS = [
  { type: '计算错误', words: ['计算', '运算', '算错', '符号', '正负', '移项', '进位', '退位', '约分', '化简'] },
  { type: '概念混淆', words: ['概念', '定义', '混淆', '记错', '误认', '错把', '当成', '区别', '分辨'] },
  { type: '审题不清', words: ['审题', '题意', '看错', '漏看', '忽略', '没注意', '条件', '要求', '漏掉'] },
  { type: '方法不当', words: ['方法', '思路', '无从下手', '没思路', '不会做', '技巧', '繁琐', '绕远'] },
  { type: '粗心大意', words: ['粗心', '马虎', '笔误', '漏写', '抄错', '忘写', '单位', '格式'] }
];

/** 题号行模式 */
const QUESTION_RE = /^[(（]?\d+[)）、.．]\s*\S/;

/** 错题标记模式：×/✗/✘/答错/做错/算错/-2/扣3分（单独"错"字太宽泛，避免选择题题干误判） */
const WRONG_MARK_RE = /[×✗✘✕]|答错|做错|选错|写错|解错|算错|记错|看错|-\s*\d{1,2}\b|扣\s*\d+\s*分/;

/**
 * 本地模式：基于 OCR/手动输入的试卷文本进行规则分析。
 * @param {string} text - 试卷文本内容
 * @returns {object} 分析结果
 */
export function analyzeExamLocal(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('试卷内容过少，无法分析。请补充更多题目内容（可手动输入错题与得分信息）。');
  }

  // ── 1. 提取得分信息 ──
  let obtained = null, total = null;
  for (const l of lines.slice(0, 12)) {
    let m = l.match(/得分[:：]?\s*(\d+(?:\.\d+)?)/);
    if (m) obtained = parseFloat(m[1]);
    m = l.match(/满分[:：]?\s*(\d+(?:\.\d+)?)/);
    if (m) total = parseFloat(m[1]);
    m = l.match(/(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)/);
    if (m && !obtained) { obtained = parseFloat(m[1]); total = total || parseFloat(m[2]); }
  }

  // ── 2. 按题号切分题目块，识别错题（块内分析，避免跨题污染） ──
  const mistakes = [];
  const typeCount = {};
  const blocks = [];
  for (const l of lines) {
    if (QUESTION_RE.test(l)) {
      blocks.push({ head: l, body: [] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].body.push(l);
    }
    // 题号前的行（试卷头/得分）不构成题目块
  }

  for (const block of blocks) {
  const ctx = [block.head, ...block.body].join(' ');
    const isWrong = WRONG_MARK_RE.test(ctx);
    if (!isWrong) continue;
    // 分类错误类型（仅在本题块内匹配关键词）
    let errorType = '其他';
    for (const cat of ERROR_TYPE_KEYWORDS) {
      if (cat.words.some(w => ctx.includes(w))) { errorType = cat.type; break; }
    }
    typeCount[errorType] = (typeCount[errorType] || 0) + 1;
    mistakes.push({
      question: block.head.length > 60 ? block.head.slice(0, 60) + '…' : block.head,
      knowledgePoint: guessKnowledgePoint(ctx),
      errorType,
      analysis: `该题被标记为错误${ctx.includes('扣') || /-\s*\d/.test(ctx) ? '（有扣分标记）' : ''}，结合上下文判断属于${errorType}。`,
      suggestion: suggestForType(errorType)
    });
  }

  // ── 3. 归纳优势与薄弱点 ──
  const weakAreas = [...new Set(mistakes.map(m => m.knowledgePoint).filter(Boolean))].slice(0, 5);
  const strengths = [];
  if (obtained != null && total != null) {
    const rate = obtained / total;
    if (rate >= 0.9) strengths.push('整体掌握扎实，得分率很高');
    else if (rate >= 0.75) strengths.push('基础知识掌握较好，大部分题目完成正确');
    else if (rate >= 0.6) strengths.push('基本概念有所理解，但细节仍需加强');
  }
  if (mistakes.length === 0) strengths.push('未检测到明显错题标记');
  const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0];
  if (topType && topType[1] >= 2) strengths.push(`${topType[0]}以外的题目完成较好`);

  // ── 4. 整体概述 ──
  const scoreDesc = obtained != null && total != null
    ? `得分 ${obtained}/${total}（${Math.round(obtained / total * 100)}%）。`
    : '未从内容中识别出明确得分信息。';
  const overview = `本次考试${scoreDesc}共识别出 ${mistakes.length} 道错题` +
    (topType ? `，主要失分原因为「${topType[0]}」（${topType[1]} 题）。` : '。') +
    (weakAreas.length ? `薄弱知识点集中在：${weakAreas.join('、')}。` : '');

  // ── 5. 改进建议与复习规划 ──
  const advice = buildAdvice(typeCount, mistakes.length, obtained, total);
  const studyPlan = buildStudyPlan(weakAreas, typeCount);

  return {
    subject: guessSubject(lines.join('\n')),
    examTitle: '',
    score: obtained != null ? { obtained, total: total || 100 } : null,
    overview,
    mistakes: mistakes.slice(0, 15),
    strengths: strengths.length ? strengths : ['能认真保留试卷并主动分析，这本身就是好习惯'],
    weakAreas: weakAreas.length ? weakAreas : ['建议补充更多错题细节以便精准定位薄弱点'],
    advice,
    studyPlan
  };
}

/** 从上下文猜测知识点（提取题干中的关键名词片段） */
function guessKnowledgePoint(ctx) {
  const m = ctx.match(/[\u4e00-\u9fa5]{2,6}(?:定理|定律|公式|方程|函数|性质|法则|概念|原理|计算|证明|应用)/);
  if (m) return m[0];
  const m2 = ctx.match(/(?:求|计算|证明|判断|分析|解释)([\u4e00-\u9fa5]{2,6})/);
  return m2 ? m2[1] : '待标注';
}

/** 根据错误类型给出针对性建议 */
function suggestForType(type) {
  const map = {
    '计算错误': '放慢运算速度，关键步骤在草稿纸上写清过程，完成后逆向验算一遍',
    '概念混淆': '回到课本重读相关定义，用对比表格区分易混概念，并各举一例',
    '审题不清': '读题时圈出关键条件与提问要求，动笔前先用一句话复述题意',
    '方法不当': '整理该知识点的典型解题套路，每类方法配 2 道例题反复演练',
    '粗心大意': '养成检查习惯：单位、符号、小数点、答题格式逐项核对',
    '其他': '对照答案解析理清正确思路，把本题收入错题本定期回顾'
  };
  return map[type] || map['其他'];
}

/** 根据科目关键词猜测科目 */
function guessSubject(text) {
  if (/函数|方程|几何|代数|三角|概率|数列|微积分/.test(text)) return '数学';
  if (/受力|电场|磁场|动能|牛顿|光学|热学/.test(text)) return '物理';
  if (/化学|方程式|离子|氧化|还原|摩尔|元素/.test(text)) return '化学';
  if (/细胞|光合|遗传|生态|呼吸|DNA|蛋白质/.test(text)) return '生物';
  if (/阅读理解|完形填空|语法|写作|翻译|作文/.test(text)) return '英语';
  if (/文言文|阅读|作文|诗词|默写|修辞/.test(text)) return '语文';
  if (/历史|朝代|革命|条约|制度/.test(text)) return '历史';
  if (/地理|气候|地形|洋流|经纬/.test(text)) return '地理';
  if (/政治|哲学|经济|矛盾|价值观/.test(text)) return '政治';
  return '未识别';
}

/** 生成改进建议 */
function buildAdvice(typeCount, mistakeCount, obtained, total) {
  const advice = [];
  const sorted = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  for (const [type, n] of sorted.slice(0, 2)) {
    advice.push(`${type}出现 ${n} 次：${suggestForType(type)}`);
  }
  if (obtained != null && total != null && obtained / total < 0.7) {
    advice.push('得分率偏低，建议先回归课本夯实基础，再做提高题，不要急于刷难题');
  }
  if (mistakeCount > 5) {
    advice.push(`错题较多（${mistakeCount} 道），建议按知识点归类整理到错题本，每周回顾一次`);
  }
  advice.push('每道错题都要问自己三个问题：错在哪？为什么错？下次怎么避免？');
  return advice.slice(0, 5);
}

/** 生成复习规划 */
function buildStudyPlan(weakAreas, typeCount) {
  if (!weakAreas.length) return '建议补充错题详情后重新分析，以获得针对性复习规划。';
  const top = weakAreas.slice(0, 3);
  const plan = `第一阶段（本周）：优先攻克「${top[0]}」，重读课本相关章节并完成 5 道基础题巩固；` +
    (top[1] ? `第二阶段（下周）：突破「${top[1]}」，整理典型例题与解题模板；` : '') +
    (top[2] ? `第三阶段（两周内）：补强「${top[2]}」，做综合卷检验整体掌握情况。` : '') +
    '每周日回顾错题本，用费曼复述向自己讲解薄弱知识点，讲不清楚的就是还没真懂。';
  return plan;
}

/* ──────────────── 远程大模型分析 ──────────────── */

const EXAM_ANALYSIS_PROMPT = `你是资深的学科教师与考试诊断专家。学生会提供考试试卷的照片（可能有多张），请仔细看图分析本次考试情况。

严格要求：
1. 必须返回合法 JSON（不要 markdown 代码块、不要多余文字），字段如下：
{
  "subject": "科目（如数学/物理/英语，无法确定填"未识别"）",
  "examTitle": "考试名称（如可见，如"期中考试"，不可见填空字符串）",
  "score": {"obtained": 85, "total": 100},
  "overview": "整体表现概述（80-150字，含得分情况、整体难度感受、主要问题）",
  "mistakes": [
    {
      "question": "题号与题目概括（如"第5题·二次函数最值"）",
      "knowledgePoint": "考查的知识点",
      "errorType": "错误类型（计算错误/概念混淆/审题不清/方法不当/粗心大意/知识盲区）",
      "analysis": "失分原因具体分析（30-80字）",
      "suggestion": "针对性改进建议（30-60字）"
    }
  ],
  "strengths": ["2-4条做得好的方面"],
  "weakAreas": ["2-5个薄弱知识领域"],
  "advice": ["3-5条具体可执行的改进建议"],
  "studyPlan": "后续复习重点规划（80-150字，分阶段说明）"
}
2. score 若试卷上可见分数则填写，不可见填 null；
3. mistakes 逐题分析所有可见的错题（有×/扣分/红笔标记的），5-15 条；若图片模糊无法辨认某些题，跳过即可；
4. errorType 必须从给定的六类中选择，分析要具体到这道题为什么错；
5. strengths 要基于做对的题目给出肯定，不要空泛；
6. advice 必须具体可执行（如"每天练习3道计算题并验算"），不要说"多努力"这类空话；
7. studyPlan 分阶段（本周/下周/长期），与 weakAreas 呼应。`;

/**
 * 分析试卷（远程 vision 直接看图；本地 OCR/手动输入规则分析）。
 * @param {string[]} images - 图片 dataURL 数组
 * @param {string} manualText - 学生手动输入的补充文本（可选）
 * @param {object} opts - { onOcrProgress }
 */
export async function analyzeExam(images = [], manualText = '', opts = {}) {
  const hasImages = images.length > 0;
  const hasText = manualText && manualText.trim().length >= 10;

  if (!hasImages && !hasText) {
    throw new Error('请上传试卷图片，或在文本框中输入试卷内容。');
  }

  // 远程模式 + 有图片 → vision 直接分析
  if (llmAdapter.isRemote && hasImages) {
    const userMsg = hasText
      ? `请分析以下试卷图片。学生补充说明：${manualText.trim()}`
      : '请仔细分析这些试卷图片中的考试情况。';
    const result = await llmAdapter.completeJSON(
      'examAnalysis',
      userMsg,
      {
        systemOverride: EXAM_ANALYSIS_PROMPT,
        images,
        fallback: async () => {
          // vision 不支持时降级：OCR + 本地分析
          const text = await ocrAll(images, opts.onOcrProgress);
          return analyzeExamLocal(text + '\n' + (hasText ? manualText : ''));
        }
      }
    );
    if (!result.mistakes?.length && !hasText) {
      throw new Error('大模型未能从图片中识别出错题，请尝试上传更清晰的试卷照片，或手动输入错题内容。');
    }
    return result;
  }

  // 本地模式 / 远程无图片 → OCR 提取文字后规则分析
  let text = hasText ? manualText.trim() : '';
  if (hasImages) {
    const ocrText = await ocrAll(images, opts.onOcrProgress);
    text = (ocrText + '\n' + text).trim();
  }
  return analyzeExamLocal(text);
}

/** 对多张图片依次 OCR 并合并文本 */
async function ocrAll(images, onProgress) {
  const parts = [];
  for (let i = 0; i < images.length; i++) {
    const t = await ocrImage(images[i], p => onProgress?.((i + p) / images.length));
    if (t) parts.push(t);
  }
  return parts.join('\n');
}

/* ──────────────── 注册到 AI 适配层 ──────────────── */

llmAdapter.registerLocalHandler(
  'examAnalysis',
  input => analyzeExamLocal(typeof input === 'string' ? input : String(input || '')),
  () => EXAM_ANALYSIS_PROMPT
);