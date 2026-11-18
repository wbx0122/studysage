/**
 * 教师端 · 班级成绩导入与分析
 * ─────────────────────────────────────────────
 * 老师导入 Excel/CSV 成绩表，自动生成全班成绩看板：
 *  - KPI 卡片：人数、平均分、最高分、及格率、优秀率
 *  - 图表：分数段分布、各科平均分、及格/优秀占比、学生排行
 *  - AI 深度分析：远程模式调用大模型生成教学建议（本地模式规则分析）
 *  - 成绩明细表：按总分排名展示每位学生各科成绩
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { llmAdapter } from '../../engine/llmAdapter.js';
import {
  parseCSV, parseXLSX, structureGradeTable,
  analyzeClass, aiClassAnalysis, generateTemplate, readFileText
} from '../../engine/dataImportEngine.js';
import { barChart, donutChart, rankBars, stackedBarChart } from '../charts.js';

let aiResult = null;
let aiLoading = false;
let importError = '';

export function renderData() {
  const state = store.getState();
  const classData = state.classData || null;
  const remote = llmAdapter.isRemote;

  // 模式提示
  const modeTip = remote
    ? h('div.data-mode-tip.remote', {}, h('span.dot', {}),
        '已连接远程大模型，导入成绩后可生成 AI 深度学情分析报告')
    : h('div.data-mode-tip.local', {}, h('span.dot', {}),
        '当前为本地模式，可查看统计图表与规则分析；', h('button.link-btn', {
          onClick: () => { location.hash = '#/teacher/settings'; }
        }, '连接你的 API'), ' 解锁 AI 深度分析');

  // 导入区
  const importZone = h('div.data-import-zone', {
    onClick: () => document.getElementById('dataFileInput')?.click(),
    onDragOver: e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); },
    onDragLeave: e => { e.currentTarget.classList.remove('drag-over'); },
    onDrop: e => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    }
  },
    h('div.import-icon', {}, '📁'),
    h('p.import-main', {}, '点击选择或拖拽文件到此处'),
    h('p.import-sub', {}, '支持 .csv / .xlsx / .xls · 自动识别姓名列与成绩列 · 自动兼容 GBK/UTF-8 编码'),
    h('input#dataFileInput', {
      type: 'file', accept: '.csv,.xlsx,.xls,.txt', style: { display: 'none' },
      onChange: e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }
    })
  );

  const toolbar = h('div.data-toolbar', {},
    h('button.ghost-btn.sm', {
      onClick: downloadTemplate
    }, '📥 下载 CSV 模板'),
    classData ? h('button.ghost-btn.sm.danger', {
      onClick: () => {
        if (confirm('确定清空已导入的班级成绩数据？')) {
          store.clearClassData(); aiResult = null; importError = ''; rerender();
        }
      }
    }, '🗑️ 清空数据') : null,
    classData ? h('span.data-meta', {},
      `已导入 ${classData.students.length} 名学生 · ${classData.subjects.length} 个科目 · ` +
      new Date(classData.importedAt).toLocaleString('zh-CN')) : null
  );

  // 错误提示
  const errorBar = importError
    ? h('div.data-error', {}, `⚠️ ${importError}`)
    : null;

  // 无数据空状态
  if (!classData) {
    return h('div.data-view', {},
      h('h3.section-title', {}, '📊 班级成绩导入与分析'),
      modeTip,
      importZone, toolbar, errorBar,
      h('div.data-empty-guide', {},
        h('h4', {}, '使用说明'),
        h('ol.guide-list', {},
          h('li', {}, '准备成绩表：包含"姓名"列和各科成绩列即可，学号/总分/排名/班级等列会自动跳过'),
          h('li', {}, '智能识别：系统自动定位表头行、识别姓名列与成绩列，无需固定格式'),
          h('li', {}, '编码兼容：Excel 另存的 CSV（GBK 编码）和 UTF-8 编码均可正常导入'),
          h('li', {}, 'Excel 用户：可直接导入 .xlsx 文件（需联网加载解析库），或另存为 CSV 后导入'),
          h('li', {}, '导入后自动生成：KPI 概览、分数段分布、各科对比、学生排行、AI 学情分析')
        )
      )
    );
  }

  // 有数据 → 生成分析看板
  const analysis = analyzeClass(classData);
  const { totalStats: ts, subjectStats, bands, subjectBands, rankData } = analysis;

  // KPI 行
  const kpiRow = h('div.kpi-row', {},
    kpi('班级人数', ts.count + ' 人'),
    kpi('总分平均分', ts.avg),
    kpi('总分最高分', ts.max),
    kpi('总分最低分', ts.min),
    kpi('及格率', ts.passRate + '%', ts.passRate >= 80 ? 'good' : ts.passRate >= 60 ? 'warn' : 'bad'),
    kpi('优秀率', ts.excellentRate + '%', ts.excellentRate >= 30 ? 'good' : 'warn')
  );

  // 图表区
  const bandChart = barChart(bands, { unit: '人' });
  const subjectAvgData = subjectStats.map(s => ({ label: s.subject, value: s.stats.avg }));
  const subjectChart = barChart(subjectAvgData, { unit: '分' });

  // 各科分数段分布（堆叠柱状图：每科一根柱，内按 0-59/60-69/70-79/80-89/90+ 堆叠）
  const subjectBandChart = stackedBarChart(
    subjectBands.map(sb => ({ label: sb.subject, segments: sb.bands })),
    { unit: '人' }
  );

  // 及格/优秀/待努力 环形图
  const passCount = Math.round(ts.passRate * ts.count / 100);
  const excellentCount = Math.round(ts.excellentRate * ts.count / 100);
  const failCount = ts.count - passCount;
  const passDonut = donutChart([
    { label: '优秀(≥85)', value: excellentCount, color: '#0ea5a4' },
    { label: '及格(60-84)', value: passCount - excellentCount, color: '#22c55e' },
    { label: '不及格(<60)', value: failCount, color: '#ef4444' }
  ]);

  // 学生排行
  const rankChart = rankBars(rankData, { unit: ' 分' });

  // AI 分析区
  const aiPanel = buildAIPanel(remote);

  // 明细表
  const detailTable = buildDetailTable(classData);

  return h('div.data-view', {},
    h('h3.section-title', {}, '📊 班级成绩导入与分析'),
    modeTip,
    h('div.section', {}, importZone, toolbar),
    errorBar,
    kpiRow,
    h('div.dash-grid', {},
      h('div.panel', {}, h('h3', {}, '📈 总分分数段分布'), bandChart),
      h('div.panel', {}, h('h3', {}, '📚 各科平均分对比'), subjectChart)
    ),
    h('div.panel.subject-band-panel', {}, h('h3', {}, '📊 各科分数段分布'), subjectBandChart),
    h('div.dash-grid', {},
      h('div.panel', {}, h('h3', {}, '🎯 及格 / 优秀 / 不及格 占比'), passDonut),
      h('div.panel', {}, h('h3', {}, '🏆 学生总分排行（前 15）'), rankChart)
    ),
    aiPanel,
    h('div.panel', {}, h('h3', {}, '📋 成绩明细表'), detailTable)
  );
}

/* ──────────────── AI 分析面板 ──────────────── */

function buildAIPanel(remote) {
  const title = h('h3', {}, remote ? '🤖 AI 班级学情深度分析' : '📝 班级学情分析（本地规则）');

  if (aiLoading) {
    return h('div.panel.ai-panel', {}, title,
      h('div.search-loading', {}, h('div.spinner', {}), h('span', {}, '正在生成分析报告…')));
  }

  if (!aiResult) {
    return h('div.panel.ai-panel', {}, title,
      h('p.ai-hint', {}, remote
        ? '点击下方按钮，思齐将调用你配置的大模型，基于班级成绩数据生成专业的学情分析报告与教学建议。'
        : '点击下方按钮生成基于规则的学情分析。连接远程 API 后可获得大模型深度分析。'),
      h('button.primary-btn', { onClick: runAIAnalysis }, '🔍 生成分析报告')
    );
  }

  return h('div.panel.ai-panel', {}, title,
    h('div.ai-report', {},
      h('div.ai-section', {}, h('div.ai-section-title', {}, '📋 总体评价'), h('p', {}, aiResult.summary || '')),
      aiList('💪 班级优势', aiResult.strengths),
      aiList('⚠️ 需关注', aiResult.weaknesses),
      aiResult.subjectAdvice?.length ? h('div.ai-section', {},
        h('div.ai-section-title', {}, '📚 各科教学建议'),
        ...aiResult.subjectAdvice.map(s => h('div.ai-subject-advice', {},
          h('span.ai-subject-tag', {}, s.subject), h('span', {}, s.advice)))
      ) : null,
      aiList('🎯 行动建议', aiResult.actionPlan),
      aiResult.attentionStudents ? h('div.ai-section', {},
        h('div.ai-section-title', {}, '👀 重点关注'), h('p', {}, aiResult.attentionStudents)) : null
    ),
    h('button.ghost-btn.sm', { onClick: runAIAnalysis }, '🔄 重新生成')
  );
}

function aiList(title, items) {
  if (!items?.length) return null;
  return h('div.ai-section', {}, h('div.ai-section-title', {}, title),
    h('ul.miscon-list', {}, ...items.map(t => h('li', {}, t))));
}

async function runAIAnalysis() {
  const classData = store.getState().classData;
  if (!classData || aiLoading) return;
  aiLoading = true; rerender();
  try {
    aiResult = await aiClassAnalysis(classData);
  } catch (e) {
    aiResult = { summary: `分析失败：${e.message}`, strengths: [], weaknesses: [], subjectAdvice: [], actionPlan: [], attentionStudents: '' };
  } finally {
    aiLoading = false; rerender();
  }
}

/* ──────────────── 明细表 ──────────────── */

function buildDetailTable(classData) {
  const { subjects, students } = classData;
  const sorted = [...students].sort((a, b) => a.rank - b.rank);
  const head = h('tr', {},
    h('th', {}, '排名'), h('th', {}, '姓名'),
    ...subjects.map(sub => h('th', {}, sub)),
    h('th', {}, '总分')
  );
  const rows = sorted.map(s => h('tr', {},
    h('td.rank-cell', {}, s.rank),
    h('td.student-cell', {}, s.name),
    ...subjects.map(sub => {
      const v = s.scores[sub];
      const cls = v == null ? 'na' : v >= 85 ? 'excellent' : v >= 60 ? 'pass' : 'fail';
      return h('td.score-cell.' + cls, {}, v != null ? v : '—');
    }),
    h('td.total-cell', {}, s.total)
  ));
  return h('div.table-scroll', {},
    h('table.grade-table', {}, h('thead', {}, head), h('tbody', {}, ...rows)));
}

/* ──────────────── 文件处理 ──────────────── */

async function handleFile(file) {
  importError = '';
  aiResult = null;
  rerender();
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    let rows;
    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      rows = await parseXLSX(buf);
    } else {
      // 智能编码检测：支持 UTF-8 / UTF-16 / GBK（Excel 中文版另存 CSV 默认编码）
      const text = await readFileText(file);
      rows = parseCSV(text);
    }
    const classData = structureGradeTable(rows);
    classData.className = file.name.replace(/\.[^.]+$/, '');
    store.setClassData(classData);
  } catch (e) {
    importError = e.message || '文件解析失败，请检查格式。';
  }
  rerender();
}

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + generateTemplate()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '成绩表模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ──────────────── 工具 ──────────────── */

function kpi(label, value, tone = '') {
  return h('div.stat-card' + (tone ? '.' + tone : ''), {},
    h('div.stat-label', {}, label), h('div.stat-value', {}, value));
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderData());
}