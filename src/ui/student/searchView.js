/**
 * 学生端 · 全网知识搜索
 * ─────────────────────────────────────────────
 * 突破内置题库限制：学生可搜索任意学科的知识点。
 *  - 远程模式：调用用户配置的大模型 API，检索全网知识并返回结构化卡片；
 *  - 本地模式：在内置知识图谱中检索，未命中时引导开启远程模式。
 * 搜索结果支持：查看定义/关键概念/常见误解/相关知识/典型例子，
 * 命中内置知识点时可一键跳转引导答疑或费曼复述。
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { llmAdapter } from '../../engine/llmAdapter.js';
import { searchKnowledge, HOT_SEARCHES } from '../../engine/searchEngine.js';

let lastKeyword = '';
let lastResult = null;
let loading = false;

export function renderSearch() {
  const state = store.getState();
  const remote = llmAdapter.isRemote;

  // 模式提示条
  const modeTip = remote
    ? h('div.search-mode-tip.remote', {},
        h('span.dot', {}), '已连接远程大模型，可搜索全网任意学科知识点')
    : h('div.search-mode-tip.local', {},
        h('span.dot', {}), '当前为本地模式，仅检索内置知识图谱；',
        h('button.link-btn', {
          onClick: () => { location.hash = '#/teacher/settings'; }
        }, '前往引擎设置连接你的 API'),
        ' 即可解锁全网搜索');

  // 搜索栏
  const input = h('input.search-big-input', {
    id: 'searchInput',
    type: 'text',
    placeholder: remote ? '搜索任意知识点，如：勾股定理、光合作用、电磁感应…' : '搜索内置知识点，如：惯性、一元一次方程…',
    value: lastKeyword,
    onKeyDown: e => { if (e.key === 'Enter') doSearch(); }
  });
  const searchBtn = h('button.primary-btn.search-go', {
    onClick: () => doSearch(),
    disabled: loading
  }, loading ? '搜索中…' : '🔍 搜索');

  const searchBar = h('div.search-bar', {}, input, searchBtn);

  // 热门搜索 + 历史
  const history = state.searchHistory || [];
  const hotRow = h('div.tag-row', {},
    h('span.tag-row-label', {}, '热门：'),
    ...HOT_SEARCHES.map(t => h('button.chip.hot-chip', { onClick: () => quickSearch(t) }, t))
  );
  const historyRow = history.length
    ? h('div.tag-row', {},
        h('span.tag-row-label', {}, '历史：'),
        ...history.map(t => h('button.chip', { onClick: () => quickSearch(t) }, t)),
        h('button.chip.clear-chip', { onClick: () => { store.clearSearchHistory(); rerender(); } }, '清空')
      )
    : null;

  // 结果区
  const resultArea = h('div.search-results', { id: 'searchResults' });
  if (loading) {
    resultArea.append(h('div.search-loading', {},
      h('div.spinner', {}), h('span', {}, '正在检索知识点…')));
  } else if (lastResult) {
    paintResults(resultArea, lastResult);
  } else {
    resultArea.append(h('div.search-empty', {},
      h('div.search-empty-icon', {}, '🌐'),
      h('h4', {}, '搜索全网知识点'),
      h('p', {}, remote
        ? '输入任意学科的知识点关键词，思齐将调用你配置的大模型 API 为你检索结构化知识卡片。'
        : '输入关键词检索内置知识图谱。连接你的 API 后，即可搜索全网任意学科的知识点。')
    ));
  }

  return h('div.search-view', {},
    h('h3.section-title', {}, '🌐 全网知识搜索'),
    modeTip,
    searchBar,
    hotRow,
    historyRow,
    resultArea
  );
}

function quickSearch(keyword) {
  lastKeyword = keyword;
  const el = document.getElementById('searchInput');
  if (el) el.value = keyword;
  doSearch();
}

async function doSearch() {
  const el = document.getElementById('searchInput');
  const keyword = (el ? el.value : '').trim();
  if (!keyword || loading) return;
  lastKeyword = keyword;
  loading = true;
  rerender();
  store.addSearchHistory(keyword);
  try {
    lastResult = await searchKnowledge(keyword);
  } catch (e) {
    lastResult = { hits: [], message: `搜索出错：${e.message}` };
  } finally {
    loading = false;
    rerender();
  }
}

/** 渲染搜索结果卡片 */
function paintResults(container, result) {
  container.innerHTML = '';

  if (result.message) {
    container.append(h('div.search-message' + (result.hits.length ? '.ok' : ''), {}, result.message));
  }
  if (!result.hits.length) {
    container.append(h('div.search-empty', {},
      h('div.search-empty-icon', {}, '🔍'),
      h('h4', {}, '没有找到相关知识点'),
      h('p', {}, '换个关键词试试，或确认远程 API 已正确连接。')
    ));
    return;
  }
  for (const hit of result.hits) {
    container.append(renderKnowledgeCard(hit));
  }
}

/** 单个知识点卡片 */
function renderKnowledgeCard(kp) {
  const isRemote = kp.source === 'remote';

  const tags = h('div.kp-tags', {},
    h('span.kp-tag.subject', {}, kp.subject || '综合'),
    kp.chapter ? h('span.kp-tag', {}, kp.chapter) : null,
    kp.difficulty ? h('span.kp-tag.diff-' + (kp.difficulty === '基础' ? 'easy' : kp.difficulty === '较难' ? 'hard' : 'mid'), {}, kp.difficulty) : null,
    h('span.kp-tag.source' + (isRemote ? '.remote' : '.local'), {}, isRemote ? '☁️ 远程检索' : '🧩 本地图谱')
  );

  const defBlock = h('div.kp-block', {},
    h('div.kp-block-title', {}, '📖 核心定义'),
    h('p.kp-def', {}, kp.definition || '暂无')
  );

  const conceptsBlock = (kp.keyConcepts && kp.keyConcepts.length) ? h('div.kp-block', {},
    h('div.kp-block-title', {}, '🔑 关键概念'),
    h('div.keyword-row', {}, ...kp.keyConcepts.map(c => h('span.kw-chip', {}, c)))
  ) : null;

  const misconBlock = (kp.misconceptions && kp.misconceptions.length) ? h('div.kp-block.miscon', {},
    h('div.kp-block-title', {}, '⚠️ 常见误解'),
    h('ul.miscon-list', {}, ...kp.misconceptions.map(m => h('li', {}, m)))
  ) : null;

  const exampleBlock = kp.example ? h('div.kp-block', {},
    h('div.kp-block-title', {}, '💡 典型例子'),
    h('p.kp-example', {}, kp.example)
  ) : null;

  const relatedBlock = (kp.related && kp.related.length) ? h('div.kp-block', {},
    h('div.kp-block-title', {}, '🔗 相关知识'),
    h('div.keyword-row', {}, ...kp.related.map(r =>
      h('button.kw-chip.link-chip', { onClick: () => quickSearch(r) }, r)
    ))
  ) : null;

  // 操作按钮：命中内置知识点 → 可跳转练习/复述；远程结果 → 可继续追问
  const actions = h('div.kp-actions', {});
  if (kp.kpId) {
    actions.append(
      h('button.ghost-btn.sm', {
        onClick: () => { location.hash = '#/student/tutor'; }
      }, '💬 去引导答疑'),
      h('button.ghost-btn.sm', {
        onClick: () => { location.hash = '#/student/feynman'; }
      }, '🎤 费曼复述检测')
    );
  }
  actions.append(
    h('button.ghost-btn.sm', {
      onClick: () => {
        const question = `请帮我讲解：${kp.name}`;
        location.hash = '#/student/tutor';
        // 视图渲染完成后再填充提问框
        setTimeout(() => {
          const el = document.getElementById('freeInput');
          if (el) el.value = question;
        }, 80);
      }
    }, '💬 向思齐提问')
  );

  return h('article.kp-card', {},
    h('div.kp-head', {},
      h('h4.kp-name', {}, kp.name),
      tags
    ),
    defBlock,
    conceptsBlock,
    misconBlock,
    exampleBlock,
    relatedBlock,
    actions
  );
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderSearch());
}