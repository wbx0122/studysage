/**
 * 学生端 · 费曼复述检测
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { KNOWLEDGE_POINTS, KP_MAP } from '../../data/knowledgeMap.js';
import { assessFeynman } from '../../engine/feynmanEngine.js';

let selectedKp = KNOWLEDGE_POINTS[0].id;
let lastResult = null;

export function renderFeynman() {
  const kp = KP_MAP[selectedKp];

  const kpSelect = h('select.kp-select', {
    onChange: e => { selectedKp = e.target.value; lastResult = null; rerender(); }
  }, ...KNOWLEDGE_POINTS.map(x => h('option', { value: x.id, selected: x.id === selectedKp }, `${x.subject} · ${x.name}`)));

  const hint = h('div.feynman-hint', {},
    h('strong', {}, '讲解提示（只给抓手，不给答案）：'),
    h('p', {}, '假设你要讲给一个没学过的同学听，尽量讲清楚“是什么、为什么、怎么用”。可以围绕这些关键词展开：'),
    h('div.keyword-row', {}, ...kp.keyConcepts.map(k => h('span.kw-chip', {}, k)))
  );

  const ta = h('textarea.feynman-input', { id: 'feynmanText', rows: 7, placeholder: '用自己的话写下你的讲解……' });

  const submit = h('div.feynman-actions', {},
    h('button.primary-btn', {
      onClick: () => {
        const text = document.getElementById('feynmanText').value.trim();
        if (text.length < 15) return alert('讲解内容太短了，请至少写出完整的几句话。');
        lastResult = assessFeynman(selectedKp, text);
        store.addFeynman(lastResult);
        rerender();
      }
    }, '提交复述，检测理解')
  );

  const resultBlock = lastResult ? renderResult(lastResult) : h('div');

  const history = store.getState().feynman.slice(-5).reverse();
  const historyBlock = h('div.section', {},
    h('h3.section-title', {}, '🕘 最近复述记录'),
    !history.length ? h('p.empty', '还没有复述记录。')
      : h('div.feynman-history', {}, ...history.map(x =>
        h('div.history-row', {},
          h('span', {}, KP_MAP[x.kpId]?.name),
          h('span', {}, `覆盖 ${x.coverage}% · 得分 ${x.score}`),
          h('span', {}, x.level)
        )
      ))
  );

  return h('div.feynman-view', {},
    h('h3.section-title', {}, '🎤 费曼复述：用自己的话讲清楚'),
    h('div.feynman-card', {}, kpSelect, hint, ta, submit, resultBlock),
    historyBlock
  );
}

function renderResult(r) {
  const missBlock = h('div.result-block', {},
    h('strong', {}, '关键概念覆盖：' + r.coverage + '%'),
    h('p', {}, '已覆盖：' + (r.hits.join('、') || '无')),
    h('p' + (r.missing.length ? '.warn' : ''), {}, '遗漏：' + (r.missing.join('、') || '无'))
  );

  const misBlock = h('div.result-block', {},
    h('strong', {}, '理解偏差：' + (r.misconceptions.length ? r.misconceptions.length + ' 处' : '未发现')),
    ...(r.misconceptions.length
      ? r.misconceptions.map(m => h('p.warn', {}, `· ${m.point} → ${m.fix}`))
      : [h('p', {}, '没有检测到典型误解。')])
  );

  const sugBlock = h('div.result-block', {},
    h('strong', {}, '改进建议'),
    ...r.suggestions.map(s => h('p', {}, '· ' + s))
  );

  return h('div.feynman-result', { class: 'score-' + r.score },
    h('div.result-head', {},
      h('div.result-score', {}, r.score + ' 分'),
      h('div', {}, h('strong', {}, r.level), h('div', {}, `字数 ${r.wordCount} · 覆盖 ${r.coverage}%`))
    ),
    missBlock, misBlock, sugBlock
  );
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderFeynman());
}
