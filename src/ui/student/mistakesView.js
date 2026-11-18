/**
 * 学生端 · 错题本（错题归因 + 分类统计）
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { ERROR_CAUSES } from '../../data/questionBank.js';
import { buildMistakeEntries, mistakeStats } from '../../engine/mistakeEngine.js';

let filterCause = 'all';

export function renderMistakes() {
  const state = store.getState();
  const overrides = state.mistakeOverrides || {};
  const entries = buildMistakeEntries(state.records, overrides);
  const stats = mistakeStats(entries);

  const kpis = h('div.kpi-row', {},
    stat('错题总数', stats.total),
    stat('待解决', stats.unresolved),
    stat('已解决', stats.resolved),
    stat('解决率', stats.resolveRate + '%')
  );

  const causeFilters = ['all', ...Object.keys(ERROR_CAUSES)].map(k =>
    h('button.chip' + (filterCause === k ? '.active' : ''), {
      onClick: () => { filterCause = k; rerender(); }
    }, k === 'all' ? '全部原因' : ERROR_CAUSES[k])
  );

  const shown = entries.filter(e => filterCause === 'all' || e.cause === filterCause);

  const list = h('div.mistake-list', {},
    !shown.length
      ? h('p.empty', '没有符合条件的错题。')
      : shown.map(e =>
        h('div.mistake-card' + (e.resolved ? '.resolved' : ''), {},
          h('div.mistake-head', {},
            h('div', {}, h('strong.mistake-stem', { title: e.stem }, e.stem),
              h('div.mistake-meta', {}, `${e.kpName} · ${e.qType || ''} · 尝试 ${e.attempts} 次`)),
            h('button' + (e.resolved ? '.ghost-btn.sm' : '.primary-btn.sm'), {
              onClick: () => toggleResolve(e.rid, !e.resolved)
            }, e.resolved ? '标记为未解决' : '标记已掌握')
          ),
          h('div.mistake-cause-row', {},
            h('span', {}, '错误归因：', e.selfAttributed ? '（自我归因）' : e.autoCause ? '（自动识别）' : '（待归因）'),
            h('select.cause-select', {
              onChange: ev => setCause(e.rid, ev.target.value)
            },
              h('option', { value: '', selected: !e.cause }, '请选择原因'),
              ...Object.entries(ERROR_CAUSES).map(([k, v]) =>
                h('option', { value: k, selected: e.cause === k }, v)
              )
            )
          )
        )
      )
  );

  return h('div.mistakes-view', {},
    kpis,
    h('div.filter-bar', {}, ...causeFilters),
    h('h3.section-title', {}, '📕 错题归因清单'),
    list
  );
}

function setCause(rid, cause) {
  const cur = store.getState().mistakeOverrides || {};
  const prev = cur[rid] || {};
  store.update({ mistakeOverrides: { ...cur, [rid]: { ...prev, cause } } });
  rerender();
}

function toggleResolve(rid, resolved) {
  const cur = store.getState().mistakeOverrides || {};
  const prev = cur[rid] || {};
  store.update({ mistakeOverrides: { ...cur, [rid]: { ...prev, resolved } } });
  rerender();
}

function stat(label, value) {
  return h('div.stat-card', {}, h('div.stat-label', {}, label), h('div.stat-value', {}, value));
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderMistakes());
}
