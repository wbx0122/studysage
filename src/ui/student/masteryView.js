/**
 * 学生端 · 知识掌握度可视化 + 个性化学习路径
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { KNOWLEDGE_POINTS } from '../../data/knowledgeMap.js';
import { computeMasteryMap, overallMastery, buildLearningPath } from '../../engine/diagnosisEngine.js';

export function renderMastery() {
  const records = store.getState().records;
  const mastery = computeMasteryMap(records);
  const summary = overallMastery(records);
  const path = buildLearningPath(records);

  const kpis = h('div.kpi-row', {},
    statCard('整体掌握率', summary.percent + '%', '已掌握 ' + summary.mastered + ' / ' + summary.total),
    statCard('平均掌握分', summary.avgScore, '按知识点加权'),
    statCard('已学习知识点', summary.touched + ' / ' + summary.total, '未学 ' + (summary.total - summary.touched)),
    statCard('待补漏步骤', path.length, '个性化路径')
  );

  const statusMeta = {
    mastered: { cls: 'mastered', text: '掌握' },
    weak: { cls: 'weak', text: '薄弱' },
    unseen: { cls: 'unseen', text: '未学' }
  };

  const cards = KNOWLEDGE_POINTS.map(kp => {
    const m = mastery[kp.id];
    const meta = statusMeta[m.status];
    return h('div.mastery-card', {},
      h('div.mastery-head', {},
        h('div', {}, h('strong', {}, kp.name), h('div.mastery-sub', {}, `${kp.subject} · ${kp.chapter}`)),
        h('span.status-pill.' + meta.cls, {}, meta.text)
      ),
      h('div.mastery-track', {}, h('div.mastery-fill.' + meta.cls, { style: { width: Math.max(m.score, 4) + '%' } }), h('span.mastery-score', {}, m.score + ' 分')),
      h('div.mastery-meta', {}, `练习 ${m.total} 次 · 答对 ${m.correct} 次`)
    );
  });

  const grid = h('div.mastery-grid', {}, ...cards);

  const pathSection = h('div.section', {},
    h('h3.section-title', {}, '🧭 个性化补漏路径（按先修依赖排序）'),
    path.length === 0
      ? h('p.empty', '全部知识点均已掌握，可到“间隔复习”保持记忆。')
      : h('div.path-list', {}, ...path.map(step =>
        h('div.path-step', { class: 'p-' + step.status },
          h('div.path-no', {}, step.step),
          h('div.path-body', {},
            h('div.path-title', {}, `${step.name}`, h('span.status-pill.' + step.status, {}, step.status === 'unseen' ? '未学' : '薄弱')),
            h('div.path-reason', {}, '诊断：' + step.reason),
            h('div.path-action', {}, '建议：' + step.action),
            h('div.path-meta', {}, `预计 ${step.estimatedMin} 分钟 · 专项题 ${step.questionIds.length} 道`)
          ),
          h('button.primary-btn.sm', {
            onClick: () => { location.hash = '#/student/quiz'; }
          }, '去练习')
        )
      ))
  );

  return h('div.mastery-view', {},
    kpis,
    h('h3.section-title', {}, '📊 知识点掌握度'),
    grid,
    pathSection
  );
}

function statCard(label, value, sub) {
  return h('div.stat-card', {},
    h('div.stat-label', {}, label),
    h('div.stat-value', {}, value),
    h('div.stat-sub', {}, sub)
  );
}
