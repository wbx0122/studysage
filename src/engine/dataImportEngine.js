/**
 * 班级成绩数据导入引擎
 * ─────────────────────────────────────────────
 * 支持老师导入 CSV / Excel(.xlsx) 成绩表，自动解析并计算班级关键统计指标。
 *  - CSV：内置解析器（兼容 UTF-8 BOM、引号包裹、逗号/制表符/分号分隔）；
 *  - XLSX：动态加载 SheetJS（CDN），离线时提示改用 CSV；
 *  - 统计：平均分、中位数、最高/最低、及格率、优秀率、标准差、分数段分布；
 *  - AI 分析：注册 'classAnalysis' 任务，远程模式下由大模型生成深度学情报告。
 */
import { llmAdapter } from './llmAdapter.js';

/* ──────────────── 文件读取（智能编码检测） ──────────────── */

/**
 * 智能读取文件文本。
 * 自动检测编码：UTF-8 BOM → UTF-16 BOM → 严格 UTF-8 → GBK（Excel 中文版另存 CSV 的默认编码）。
 * 这一步至关重要——中国老师用 Excel 导出的 CSV 几乎都是 GBK/ANSI 编码，
 * 若按 UTF-8 强解会出现乱码，导致表头识别失败。
 */
export async function readFileText(file) {
  const buf = await file.arrayBuffer();
  return decodeBuffer(buf);
}

/** 将 ArrayBuffer 按检测到的编码解码为字符串 */
export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  // UTF-8 BOM (EF BB BF)
  if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf);
  }
  // UTF-16 LE BOM (FF FE)
  if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  // UTF-16 BE BOM (FE FF)
  if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  // 先严格 UTF-8：若字节序列不是合法 UTF-8 则抛错
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    // UTF-8 解码失败 → 大概率是 GBK（Excel 中文版 ANSI 编码）
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch (e2) {
      // 极少数环境不支持 gbk 标签，最终兜底宽松 UTF-8
      return new TextDecoder('utf-8').decode(buf);
    }
  }
}

/* ──────────────── CSV 解析 ──────────────── */

/**
 * 解析 CSV 文本为二维数组。
 * 自动去除 BOM，兼容逗号 / 制表符 / 分号分隔，支持引号包裹字段。
 */
export function parseCSV(text) {
  let t = String(text || '');
  // 去 UTF-8 BOM
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  // 检测分隔符：取第一行，看哪种分隔符出现最多
  const firstLine = t.split(/\r?\n/)[0] || '';
  const delim = [',', '\t', ';'].reduce((best, d) =>
    (firstLine.split(d).length > (best.count || 0) ? { d, count: firstLine.split(d).length } : best), {}).d || ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  // 最后一行
  if (field !== '' || row.length) { row.push(field); if (row.some(c => c.trim() !== '')) rows.push(row); }
  return rows;
}

/* ──────────────── XLSX 解析（动态加载 SheetJS） ──────────────── */

let xlsxPromise = null;

/** 动态加载 SheetJS 库（仅需在线一次，之后缓存） */
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX 库加载异常'));
    script.onerror = () => { xlsxPromise = null; reject(new Error('XLSX 库加载失败（需联网）；请将 Excel 另存为 CSV 后再导入。')); };
    document.head.append(script);
  });
  return xlsxPromise;
}

/** 解析 .xlsx ArrayBuffer 为二维数组（取第一个工作表） */
export async function parseXLSX(buffer) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

/* ──────────────── 成绩表结构化（智能识别） ──────────────── */

/** 已知非科目列关键词（命中即跳过，不作为成绩列） */
const NON_SCORE_KEYWORDS = [
  '总分', '总成绩', '合计', '总计', '总评', '平均', '均分',
  '排名', '名次', '名别', '位次',
  '班级', '班别', '班级名称', '学校', '年级',
  '学号', '序号', '编号', '考号', '准考证', '座号',
  '备注', '评语', '等级', '等第', '操行', '出勤', '考勤',
  '性别', '年龄', '生日', '电话', '家长'
];

/** 姓名列表头关键词（命中即认定为姓名列） */
const NAME_KEYWORDS = ['姓名', '名字', '学生姓名', '学生名字', '学生', 'name', 'Name', 'NAME'];

/**
 * 将二维数组智能解析为结构化班级成绩数据。
 *
 * 智能识别能力：
 *  1. 表头行定位：跳过文件开头的标题行/说明行，找到真正的表头；
 *  2. 姓名列识别：优先按表头关键词（姓名/名字/name），否则取"非数字文本占比最高"的列；
 *  3. 成绩列识别：表头非空、未命中非科目关键词、且数据行中 ≥60% 为数值；
 *  4. 非科目列过滤：总分/排名/学号/班级/备注等列自动跳过，不重复统计。
 *
 * @param {string[][]} rows - 二维数组（parseCSV / parseXLSX 的返回值）
 * @returns {{ className:string, subjects:string[], students:Array, importedAt:number }}
 *   students: [{ name, scores: { 科目: 分数 }, total, rank }]
 */
export function structureGradeTable(rows) {
  if (!rows || rows.length < 2) throw new Error('表格至少需要表头行和一行数据。');

  // ── 1. 智能定位表头行 ──
  // 从前往后扫描前 10 行，找第一行"非空单元格 ≥2 且下一行含数值"的行
  let headerIdx = 0;
  const scanLimit = Math.min(rows.length - 1, 10);
  for (let i = 0; i < scanLimit; i++) {
    const nonEmpty = (rows[i] || []).filter(c => String(c ?? '').trim() !== '').length;
    const nextRow = rows[i + 1] || [];
    const nextHasNum = nextRow.some(c => {
      const v = String(c ?? '').trim();
      return v !== '' && !isNaN(parseFloat(v)) && isFinite(v);
    });
    if (nonEmpty >= 2 && nextHasNum) { headerIdx = i; break; }
  }

  const header = (rows[headerIdx] || []).map(c => String(c ?? '').trim());
  const dataRows = rows.slice(headerIdx + 1).filter(r =>
    (r || []).some(c => String(c ?? '').trim() !== '')
  );
  if (!header.some(h => h) || !dataRows.length) {
    throw new Error('未能定位到有效的表头行与数据行，请检查表格格式。');
  }

  // ── 2. 识别姓名列 ──
  let nameCol = -1;
  // 优先按表头关键词匹配
  for (let ci = 0; ci < header.length; ci++) {
    if (NAME_KEYWORDS.some(kw => header[ci].includes(kw))) { nameCol = ci; break; }
  }
  // 关键词没命中 → 找数据中"非数字文本占比最高"的列（人名是文本，成绩是数字）
  if (nameCol < 0) {
    let bestCol = 0, bestRatio = -1;
    for (let ci = 0; ci < header.length; ci++) {
      let textCount = 0, total = 0;
      for (const r of dataRows) {
        const v = String(r[ci] ?? '').trim();
        if (v === '') continue;
        total++;
        const num = parseFloat(v);
        if (isNaN(num) || !isFinite(num)) textCount++;
      }
      const ratio = total > 0 ? textCount / total : 0;
      if (ratio > bestRatio) { bestRatio = ratio; bestCol = ci; }
    }
    nameCol = bestCol;
  }
  if (nameCol < 0 || !header[nameCol]) {
    throw new Error('未能识别学生姓名列，请确保表头包含"姓名"或类似字样。');
  }

  // ── 3. 识别成绩列（过滤非科目列） ──
  const colTypes = header.map((h, ci) => {
    if (ci === nameCol) return 'name';
    if (!h) return 'skip';
    if (NON_SCORE_KEYWORDS.some(kw => h.includes(kw))) return 'skip';
    let numCount = 0, total = 0;
    for (const r of dataRows) {
      const v = String(r[ci] ?? '').trim();
      if (v === '') continue;
      total++;
      if (!isNaN(parseFloat(v)) && isFinite(v)) numCount++;
    }
    return total > 0 && numCount / total >= 0.6 ? 'score' : 'skip';
  });

  const subjects = header.filter((_, ci) => colTypes[ci] === 'score');
  if (!subjects.length) {
    throw new Error('未检测到任何成绩列。请确保：①表头有科目名称（如语文、数学）；②对应列数据为分数。');
  }

  // ── 4. 提取学生数据 ──
  const students = [];
  for (const r of dataRows) {
    const name = String(r[nameCol] ?? '').trim();
    if (!name) continue;
    const scores = {};
    let hasScore = false;
    colTypes.forEach((type, ci) => {
      if (type !== 'score') return;
      const raw = String(r[ci] ?? '').trim();
      if (raw === '') return;
      const v = parseFloat(raw);
      if (!isNaN(v) && isFinite(v)) { scores[header[ci]] = v; hasScore = true; }
    });
    if (hasScore) students.push({ name, scores, total: 0, rank: 0 });
  }
  if (!students.length) throw new Error('未解析到任何有效学生数据行。');

  // ── 5. 计算总分与排名 ──
  for (const s of students) {
    s.total = subjects.reduce((sum, sub) => sum + (s.scores[sub] ?? 0), 0);
  }
  const sorted = [...students].sort((a, b) => b.total - a.total);
  sorted.forEach((s, i) => { s.rank = i + 1; });

  return { className: '', subjects, students, importedAt: Date.now() };
}

/* ──────────────── 统计计算 ──────────────── */

/** 计算一组分数的统计指标 */
export function computeStats(scores) {
  const arr = scores.filter(v => typeof v === 'number' && !isNaN(v));
  const n = arr.length;
  if (!n) return { count: 0, avg: 0, median: 0, max: 0, min: 0, passRate: 0, excellentRate: 0, std: 0, sum: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const passCount = sorted.filter(s => s >= 60).length;
  const excellentCount = sorted.filter(s => s >= 85).length;
  const std = Math.sqrt(sorted.reduce((a, s) => a + (s - avg) ** 2, 0) / n);
  return {
    count: n, sum: Math.round(sum * 10) / 10,
    avg: Math.round(avg * 10) / 10,
    median: Math.round(median * 10) / 10,
    max: sorted[n - 1], min: sorted[0],
    passRate: Math.round((passCount / n) * 1000) / 10,
    excellentRate: Math.round((excellentCount / n) * 1000) / 10,
    std: Math.round(std * 10) / 10
  };
}

/** 单科分数段分布（0-59 / 60-69 / 70-79 / 80-89 / 90-100+） */
export function scoreBands(scores) {
  const bands = [
    { label: '0-59', min: 0, max: 59.99, color: '#ef4444' },
    { label: '60-69', min: 60, max: 69.99, color: '#f97316' },
    { label: '70-79', min: 70, max: 79.99, color: '#f59e0b' },
    { label: '80-89', min: 80, max: 89.99, color: '#22c55e' },
    { label: '90+', min: 90, max: Infinity, color: '#0ea5a4' }
  ];
  return bands.map(b => ({
    label: b.label,
    value: scores.filter(s => s >= b.min && s < b.max).length,
    color: b.color
  }));
}

/** 总分分数段分布（100以下 / 100~150 / 151~200 / 201~250 / 251~300，末段含300以上） */
export function totalScoreBands(scores) {
  const bands = [
    { label: '100以下', min: -Infinity, max: 100, color: '#ef4444' },
    { label: '100~150', min: 100, max: 151, color: '#f97316' },
    { label: '151~200', min: 151, max: 201, color: '#f59e0b' },
    { label: '201~250', min: 201, max: 251, color: '#22c55e' },
    { label: '251~300', min: 251, max: Infinity, color: '#0ea5a4' }
  ];
  return bands.map(b => ({
    label: b.label,
    value: scores.filter(s => s >= b.min && s < b.max).length,
    color: b.color
  }));
}

/**
 * 生成班级完整分析报告（本地统计 + 可选 AI 深度分析）
 * @param {object} classData - structureGradeTable 的返回值
 * @returns {object} { overview, subjectStats, bands, totalStats, rankData }
 */
export function analyzeClass(classData) {
  const { subjects, students } = classData;

  // 各科统计
  const subjectStats = subjects.map(sub => {
    const scores = students.map(s => s.scores[sub]).filter(v => v != null);
    return { subject: sub, stats: computeStats(scores) };
  });

  // 总分统计
  const totalScores = students.map(s => s.total);
  const totalStats = computeStats(totalScores);

  // 总分分数段（按总分专用区间：100以下 / 100~150 / 151~200 / 201~250 / 251~300）
  const bands = totalScoreBands(totalScores);

  // 各科分数段分布（每个科目独立计算五段人数，供堆叠柱状图展示）
  const subjectBands = subjects.map(sub => {
    const scores = students.map(s => s.scores[sub]).filter(v => v != null);
    return { subject: sub, bands: scoreBands(scores) };
  });

  // 学生排行（按总分降序，取前 15 名展示）
  const rankData = [...students]
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)
    .map(s => ({ label: s.name, value: s.total }));

  return { subjectStats, totalStats, bands, subjectBands, rankData };
}

/* ──────────────── AI 班级学情分析（远程模式） ──────────────── */

const CLASS_ANALYSIS_PROMPT = `你是经验丰富的教学数据分析专家。老师会提供班级成绩统计数据，请生成一份专业、可操作的班级学情分析报告。

严格要求：
1. 必须返回合法 JSON（不要 markdown 代码块、不要多余文字），字段如下：
{
  "summary": "总体评价（80-150字，概括班级整体学业水平、均衡程度）",
  "strengths": ["2-3条班级优势或表现突出的方面"],
  "weaknesses": ["2-3条需要关注的问题或薄弱环节"],
  "subjectAdvice": [{"subject":"科目名","advice":"针对该科的具体教学建议（40-80字）"}],
  "actionPlan": ["3-4条可立即执行的教学行动建议"],
  "attentionStudents": "需重点关注的学生特征描述（如成绩两极分化、某科严重偏低等，50字内）"
}
2. 分析必须基于提供的数据，不要编造；建议要具体可落地，避免空话套话。`;

/**
 * AI 深度分析班级数据（远程模式调用大模型，本地模式返回规则分析）
 * @param {object} analysisData - analyzeClass 的返回值 + classData 元信息
 */
export async function aiClassAnalysis(classData) {
  const analysis = analyzeClass(classData);
  // 本地模式直接返回规则分析（无需走大模型）
  if (!llmAdapter.isRemote) return buildLocalAnalysis(analysis);
  // 构建给大模型的紧凑数据摘要
  const summary = {
    班级人数: analysis.totalStats.count,
    总分平均分: analysis.totalStats.avg,
    总分中位数: analysis.totalStats.median,
    总分最高分: analysis.totalStats.max,
    总分最低分: analysis.totalStats.min,
    及格率: analysis.totalStats.passRate + '%',
    优秀率: analysis.totalStats.excellentRate + '%',
    标准差: analysis.totalStats.std,
    分数段分布: analysis.bands.map(b => `${b.label}:${b.value}人`).join('，'),
    各科统计: analysis.subjectStats.map(s => ({
      科目: s.subject, 平均分: s.stats.avg, 最高: s.stats.max, 最低: s.stats.min,
      及格率: s.stats.passRate + '%', 优秀率: s.stats.excellentRate + '%'
    }))
  };

  const result = await llmAdapter.completeJSON(
    'classAnalysis',
    JSON.stringify(summary, null, 2),
    {
      systemOverride: CLASS_ANALYSIS_PROMPT,
      fallback: () => buildLocalAnalysis(analysis)
    }
  );
  return result;
}

/** 本地规则分析（远程不可用时的兜底） */
function buildLocalAnalysis(analysis) {
  const { totalStats, subjectStats, bands } = analysis;
  const weakest = [...subjectStats].sort((a, b) => a.stats.avg - b.stats.avg)[0];
  const strongest = [...subjectStats].sort((a, b) => b.stats.avg - a.stats.avg)[0];
  const lowCount = bands[0].value; // 总分 100 以下人数

  return {
    summary: `本班共 ${totalStats.count} 人，总分平均 ${totalStats.avg} 分，中位数 ${totalStats.median} 分，及格率 ${totalStats.passRate}%，优秀率 ${totalStats.excellentRate}%。${totalStats.std > 15 ? '成绩离散度较大，存在两极分化趋势。' : '成绩分布相对集中。'}`,
    strengths: [strongest ? `「${strongest.subject}」表现最好，平均分 ${strongest.stats.avg}，优秀率 ${strongest.stats.excellentRate}%。` : '暂无突出学科数据。'],
    weaknesses: [
      weakest ? `「${weakest.subject}」最为薄弱，平均分仅 ${weakest.stats.avg}，及格率 ${weakest.stats.passRate}%。` : '',
      lowCount > 0 ? `有 ${lowCount} 名学生总分低于 100 分，需重点关注。` : ''
    ].filter(Boolean),
    subjectAdvice: subjectStats.map(s => ({
      subject: s.subject,
      advice: s.stats.avg >= 80 ? '整体掌握良好，可适当提升难度、引入拓展训练。'
        : s.stats.avg >= 60 ? '基础尚可但仍有提升空间，建议针对低分段学生做专项辅导。'
        : '基础薄弱，建议回归课本、放慢进度，增加课堂即时练习与反馈。'
    })),
    actionPlan: [
      weakest ? `优先安排「${weakest.subject}」专项讲评与变式训练` : '梳理各科薄弱环节',
      lowCount > 0 ? `对 ${lowCount} 名低分段学生（总分低于100）进行一对一学情诊断与帮扶` : '持续跟踪班级成绩变化趋势',
      totalStats.std > 15 ? '实施分层教学，为高分组和低分组设计差异化练习' : '保持当前教学节奏，定期检测巩固'
    ],
    attentionStudents: lowCount > 0 ? `共 ${lowCount} 名学生总分低于 100 分，需重点关注` : '暂无严重落后学生'
  };
}

/* ──────────────── 模板生成 ──────────────── */

/** 生成 CSV 模板内容供老师下载参考 */
export function generateTemplate() {
  return '姓名,语文,数学,英语,物理,化学\n张三,85,92,78,88,90\n李四,72,65,80,75,68\n王五,90,88,95,82,91';
}

/* ──────────────── 注册到 AI 适配层 ──────────────── */

llmAdapter.registerLocalHandler(
  'classAnalysis',
  input => {
    // input 为 summary JSON（aiClassAnalysis 构建），将其还原为 analysis 结构
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const analysis = {
      totalStats: {
        count: data['班级人数'] || 0,
        avg: data['总分平均分'] || 0,
        median: data['总分中位数'] || 0,
        passRate: parseFloat(data['及格率']) || 0,
        excellentRate: parseFloat(data['优秀率']) || 0,
        std: data['标准差'] || 0
      },
      subjectStats: (data['各科统计'] || []).map(s => ({
        subject: s['科目'],
        stats: { avg: s['平均分'] || 0, passRate: parseFloat(s['及格率']) || 0, excellentRate: parseFloat(s['优秀率']) || 0 }
      })),
      bands: String(data['分数段分布'] || '').split('，').map(seg => {
        const m = seg.match(/([^:]+):(\d+)人/);
        return m ? { label: m[1], value: parseInt(m[2]) } : { label: seg, value: 0 };
      })
    };
    return buildLocalAnalysis(analysis);
  },
  () => CLASS_ANALYSIS_PROMPT
);