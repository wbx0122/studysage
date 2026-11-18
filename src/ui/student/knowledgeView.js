/**
 * 学生端 · 知识点梳理
 * ─────────────────────────────────────────────
 * 上传含知识点的 Word/TXT/MD 文档，自动梳理知识脉络与重点：
 *  - 拖拽或点击上传（.docx / .txt / .md）；
 *  - 远程模式：大模型深度梳理结构化知识脉络；
 *  - 本地模式：基于文本结构分析（标题层级/重点段落/词频概念）。
 * 结果展示：知识大纲树、重点段落卡片、核心概念标签、学习建议。
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { llmAdapter } from '../../engine/llmAdapter.js';
import { readDocText, sortKnowledge } from '../../engine/knowledgeSorterEngine.js';

const ACCEPT = '.docx,.txt,.md';
const ACCEPT_LABEL = '.docx / .txt / .md';

let lastResult = null;
let lastFileName = '';
let loading = false;
let errorMsg = '';

export function renderKnowledge() {
  const remote = llmAdapter.isRemote;

  // 模式提示条
  const modeTip = remote
    ? h('div.search-mode-tip.remote', {},
        h('span.dot', {}), '已连接远程大模型，可对文档进行深度知识梳理')
    : h('div.search-mode-tip.local', {},
        h('span.dot', {}), '当前为本地模式，基于文本结构智能分析；',
        h('button.link-btn', {
          onClick: () => { location.hash = '#/teacher/settings'; }
        }, '前往引擎设置连接你的 API'),
        ' 即可解锁大模型深度梳理');

  // 上传区
  const fileInput = h('input.knowledge-file-input', {
    type: 'file',
    accept: ACCEPT,
    onChange: e => {
      const f = e.target.files?.[0];
      if (f) doSort(f);
    }
  });

  const uploadZone = h('div.knowledge-upload-zone' + (loading ? '.dragging' : ''), {
    onClick: () => { if (!loading) fileInput.click(); },
    onDragover: e => { e.preventDefault(); uploadZone.classList.add('dragging'); },
    onDragleave: e => { uploadZone.classList.remove('dragging'); },
    onDrop: e => {
      e.preventDefault();
      uploadZone.classList.remove('dragging');
      const f = e.dataTransfer.files?.[0];
      if (f) doSort(f);
    }
  },
    h('div.knowledge-upload-icon', {}, loading ? '⏳' : '📄'),
    h('div.knowledge-upload-title', {}, loading ? '正在梳理知识点…' : '拖拽文档到此处，或点击上传'),
    h('div.knowledge-upload-sub', {},
      `支持 ${ACCEPT_LABEL} 格式（Word 请另存为 .docx）`,
      h('br'),
      remote ? '大模型将自动梳理知识脉络与重点' : '本地结构分析：大纲 / 重点 / 核心概念')
  );

  // 错误提示
  const errorBlock = errorMsg
    ? h('div.search-message', {}, `⚠️ ${errorMsg}`)
    : null;

  // 结果区
  const resultArea = h('div.knowledge-result-area', {});
  if (loading) {
    resultArea.append(h('div.search-loading', {},
      h('div.spinner', {}), h('span', {}, '正在读取文档并梳理知识脉络…')));
  } else if (lastResult) {
    paintResult(resultArea, lastResult, lastFileName, remote);
  } else {
    resultArea.append(h('div.search-empty', {},
      h('div.search-empty-icon', {}, '🧠'),
      h('h4', {}, '上传文档，自动梳理知识脉络'),
      h('p', {}, remote
        ? '上传一份含知识点的学习文档，思齐将调用大模型为你提炼：知识大纲、重点段落、核心概念与学习建议。'
        : '上传一份含知识点的学习文档，思齐将基于文本结构为你分析：知识大纲、重点段落、核心概念与学习建议。'),
      h('div.knowledge-usage', {},
        h('p', {}, '💡 适合梳理：课堂笔记、章节总结、复习提纲、知识清单'),
        h('p', {}, '💡 建议文档包含清晰的标题层级（如"第一章""1.1"），梳理效果更佳')
      )
    ));
  }

  return h('div.knowledge-view', {},
    h('h3.section-title', {}, '🧠 知识点梳理'),
    modeTip,
    h('div.knowledge-upload-card', {}, fileInput, uploadZone),
    errorBlock,
    resultArea
  );
}

/** 读取文档并梳理 */
async function doSort(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['docx', 'txt', 'md'].includes(ext)) {
    errorMsg = `不支持的格式 .${ext}，请上传 ${ACCEPT_LABEL} 文件。`;
    rerender();
    return;
  }
  loading = true;
  errorMsg = '';
  lastResult = null;
  lastFileName = file.name;
  rerender();
  try {
    const text = await readDocText(file);
    lastResult = await sortKnowledge(text, file.name);
    // 保存到历史记录
    store.update(state => ({
      knowledgeSortHistory: [
        { fileName: file.name, title: lastResult.title, time: Date.now() },
        ...(state.knowledgeSortHistory || [])
      ].slice(0, 10)
    }));
  } catch (e) {
    errorMsg = e.message || '文档解析失败，请检查文件格式。';
  } finally {
    loading = false;
    rerender();
  }
}

/** 渲染梳理结果 */
function paintResult(container, r, fileName, remote) {
  container.innerHTML = '';

  // 头部：标题 + 来源
  const head = h('div.knowledge-result-head', {},
    h('div.knowledge-result-title-row', {},
      h('h4.knowledge-result-title', {}, r.title || '未命名文档'),
      h('span.kp-tag.source' + (remote ? '.remote' : '.local'), {},
        remote ? '☁️ 大模型梳理' : '🧩 本地结构分析')
    ),
    fileName ? h('div.knowledge-result-file', {}, `📎 来源：${fileName}`) : null,
    r.summary ? h('p.knowledge-result-summary', {}, r.summary) : null
  );
  container.append(head);

  // 大纲树
  if (r.outline?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, '🗺️ 知识大纲'),
      ...r.outline.map(node => renderOutlineNode(node, 1))
    ));
  }

  // 重点段落
  if (r.keyPoints?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, `⭐ 重点要点（${r.keyPoints.length} 条）`),
      ...r.keyPoints.map(kp => h('div.keypoint-card', {},
        h('div.keypoint-tags', {},
          ...(kp.tags || []).map(t => h('span.kp-tag.keypoint-tag', {}, t))),
        h('p.keypoint-text', {}, kp.text)
      ))
    ));
  }

  // 核心概念
  if (r.concepts?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, `🔑 核心概念（${r.concepts.length} 个）`),
      h('div.concept-grid', {},
        ...r.concepts.map(c => h('div.concept-card', {},
          h('div.concept-name-row', {},
            h('span.concept-name', {}, c.name),
            c.weight ? h('span.concept-weight', {}, '★'.repeat(Math.min(5, Math.max(1, c.weight)))) : null
          ),
          c.explain ? h('p.concept-explain', {}, c.explain) : null
        ))
      )
    ));
  }

  // 学习建议
  if (r.studyAdvice?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, '💡 学习建议'),
      h('ul.advice-list', {},
        ...r.studyAdvice.map(s => h('li', {}, s)))
    ));
  }

  // 底部操作
  container.append(h('div.knowledge-actions', {},
    h('button.ghost-btn', {
      onClick: () => {
        lastResult = null;
        lastFileName = '';
        errorMsg = '';
        rerender();
      }
    }, '🔄 重新上传文档'),
    h('button.ghost-btn', {
      onClick: () => { location.hash = '#/student/feynman'; }
    }, '🎤 费曼复述检验'),
    h('button.ghost-btn', {
      onClick: () => { location.hash = '#/student/tutor'; }
    }, '💬 向思齐提问')
  ));
}

/** 递归渲染大纲节点 */
function renderOutlineNode(node, depth) {
  const children = node.points || [];

  // 叶子文本节点
  if (node.text) {
    return h('div.outline-text.depth-' + Math.min(depth, 3), {}, node.text);
  }
  if (!node.title) return null;

  const childNodes = children.map(c => renderOutlineNode(c, depth + 1));

  return h('details.outline-node.level-' + Math.min(node.level || depth, 3), { open: depth <= 1 },
    h('summary.outline-summary', {},
      h('span.outline-bullet', {}, node.level === 1 ? '📘' : node.level === 2 ? '📖' : '📄'),
      h('span.outline-title', {}, cleanTitle(node.title))
    ),
    childNodes.length ? h('div.outline-children', {}, ...childNodes) : null
  );
}

/** 清理标题中的编号前缀（展示更清爽） */
function cleanTitle(t) {
  return String(t || '').replace(/^#{1,6}\s+/, '').trim();
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderKnowledge());
}