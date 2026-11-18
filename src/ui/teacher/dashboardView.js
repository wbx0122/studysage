/**
 * 教师端 · 学情看板
 * 汇总班级（含本地学生真实数据）的薄弱知识点、错误类型分布、学生掌握度热力矩阵。
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { MOCK_RECORDS, MOCK_STUDENTS } from '../../data/seedStudents.js';
import { KNOWLEDGE_POINTS, KP_MAP } from '../../data/knowledgeMap.js';
import { ERROR_CAUSES } from '../../data/questionBank.js';
import { aggregateCauses, weakStudentsByKp } from '../../engine/mistakeEngine.js';
import { computeMasteryMap } from '../../engine/diagnosisEngine.js';
import { barChart, donutChart, rankBars } from '../charts.js';

let scope = 'all';

/** 合并 mock 班级记录与本地学生真实记录 */
function allRecords() {
  const local = store.getState().records.map(r => ({
    ...r,
    studentId: 'local_self',
    studentName: store.getState().studentName
  }));
  return [...MOCK_RECORDS, ...local];
}

function allStudents() {
  return [
    ...MOCK_STUDENTS,
    { id: 'local_self', name: store.getState().studentName + '（本机）', isLocal: true }
  ];
}

export function renderDashboard() {
  const records = allRecords();
  const scoped = scope === 'all' ? records : records.filter(r => r.studentId === scope);
  const students = allStudents();

  // —— 顶部 KPI ——
  const totalAnswers = scoped.length;
  const correct = scoped.filter(r => r.correct).length;
  const correctRate = totalAnswers ? Math.round((correct / totalAnswers) * 100) : 0;
  const weakMap = weakStudentsByKp(scoped);
  const weakKpCount = Object.keys(weakMap).length;

  const kpis = h('div.kpi-row', {},
    kpi('班级人数', scope === 'all' ? students.length : 1),
    kpi('累计作答', totalAnswers),
    kpi('班级正确率', correctRate + '%'),
    kpi('薄弱知识点', weakKpCount)
  );

  // —— 范围选择 ——
  const scopeSelect = h('select.scope-select', {
    onChange: e => { scope = e.target.value; rerender(); }
  },
    h('option', { value: 'all', selected: scope === 'all' }, '全班汇总'),
    ...students.map(s => h('option', { value: s.id, selected: scope === s.id }, s.name))
  );

  // —— 薄弱知识点柱状图（有错误记录的学生数） ——
  const weakData = KNOWLEDGE_POINTS
    .map(kp => ({ label: shortName(kp.name), value: weakMap[kp.id] || 0, kpId: kp.id }))
    .sort((a, b) => b.value - a.value);
  const weakChart = barChart(weakData, { unit: '人' });

  // —— 错误类型分布环形图 ——
  const causeMap = aggregateCauses(scoped);
  const causeSegs = Object.entries(ERROR_CAUSES)
    .filter(([k]) => causeMap[k])
    .map(([k, v], i) => ({ label: v, value: causeMap[k] }));
  const causeChart = donutChart(causeSegs);

  // —— 薄弱知识点排行（横向条） ——
  const rankData = weakData.map(d => ({ label: KP_MAP[d.kpId].name, value: d.value }));
  const rank = rankBars(rankData, { unit: ' 人' });

  // —— 学生 × 知识点 掌握度热力矩阵 ——
  const heatmap = buildHeatmap(scope === 'all' ? students : students.filter(s => s.id === scope), records);

  // —— 教学建议（由数据自动生成） ——
  const advice = buildAdvice(weakData, causeMap, correctRate);

  return h('div.dashboard-view', {},
    kpis,
    h('div.section', {}, h('h3.section-title', {}, '🔎 查看范围', scopeSelect)),
    h('div.dash-grid', {},
      h('div.panel', {}, h('h3', {}, '薄弱知识点分布（涉及学生数）'), weakChart),
      h('div.panel', {}, h('h3', {}, '错误类型分布'), causeChart)
    ),
    h('div.dash-grid', {},
      h('div.panel', {}, h('h3', {}, '薄弱知识点排行'), rank),
      h('div.panel', {}, h('h3', {}, '精准教学建议'), advice)
    ),
    h('div.panel', {}, h('h3', {}, '🧩 学生 × 知识点 掌握度热力矩阵'), heatmap)
  );
}

function buildHeatmap(students, records) {
  const head = h('tr', {}, h('th', {}, '学生'),
    ...KNOWLEDGE_POINTS.map(kp => h('th', { title: kp.name }, shortName(kp.name))));

  const rows = students.map(stu => {
    const recs = records.filter(r => r.studentId === stu.id);
    const mastery = computeMasteryMap(recs);
    return h('tr', {},
      h('td.student-cell', {}, stu.name),
      ...KNOWLEDGE_POINTS.map(kp => {
        const m = mastery[kp.id];
        return h('td.heat-cell', {
          style: { background: heatColor(m.score, m.status) },
          title: `${kp.name}：${m.label} ${m.score} 分`
        }, m.status === 'unseen' ? '—' : m.score);
      })
    );
  });

  return h('div.table-scroll', {}, h('table.heatmap-table', {}, h('thead', {}, head), h('tbody', {}, ...rows)));
}

function heatColor(score, status) {
  if (status === 'unseen') return '#f1f5f9';
  // 红（薄弱）→ 黄 → 绿（掌握）
  const t = score / 100;
  const hue = Math.round(t * 130); // 0 红 ~ 130 绿
  return `hsl(${hue}, 68%, 78%)`;
}

function buildAdvice(weakData, causeMap, correctRate) {
  const items = [];
  const top = weakData[0];
  if (top && top.value > 0) {
    items.push(`优先集体讲评「${KP_MAP[top.kpId].name}」，该知识点有 ${top.value} 名学生出现错误，建议安排专项讲评与变式训练。`);
  }
  const topCause = Object.entries(causeMap).sort((a, b) => b[1] - a[1])[0];
  if (topCause) {
    items.push(`班级最突出的错误类型是「${ERROR_CAUSES[topCause[0]]}」（${topCause[1]} 次），可在审题/计算规范或概念辨析上做针对性训练。`);
  }
  if (correctRate < 70) items.push(`整体正确率 ${correctRate}% 偏低，建议放慢进度、增加课堂即时反馈，再进入下一章节。`);
  if (!items.length) items.push('班级整体掌握良好，可适当提高练习难度并推进新内容。');
  return h('ul.advice-list', {}, ...items.map(t => h('li', {}, t)));
}

function kpi(label, value) {
  return h('div.stat-card', {}, h('div.stat-label', {}, label), h('div.stat-value', {}, value));
}

function shortName(name) {
  return name.length > 7 ? name.slice(0, 7) + '…' : name;
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderDashboard());
}
