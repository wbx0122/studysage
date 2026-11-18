/**
 * 学生端 · 试卷分析
 * ─────────────────────────────────────────────
 * 上传考试试卷照片（图片版），自动分析本次考试情况并给出改进建议：
 *  - 拖拽/点击上传多张试卷图片（自动压缩），缩略图预览可删除；
 *  - 远程模式：大模型 vision 直接看图分析（最准确）；
 *  - 本地模式：Tesseract.js OCR 提取文字 → 规则分析；OCR 不可用可手动输入。
 * 结果展示：得分概览、错题明细、优势与薄弱点、改进建议、复习规划。
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import { llmAdapter } from '../../engine/llmAdapter.js';
import { compressImage, analyzeExam } from '../../engine/examAnalysisEngine.js';

let images = [];          // 已上传图片 dataURL 列表
let manualText = '';      // 手动输入文本
let loading = false;
let loadingMsg = '';
let ocrProgress = 0;
let errorMsg = '';
let lastResult = null;

export function renderExamAnalysis() {
  const remote = llmAdapter.isRemote;

  // 模式提示条
  const modeTip = remote
    ? h('div.search-mode-tip.remote', {},
        h('span.dot', {}), '已连接远程大模型，可直接看图分析试卷（推荐上传清晰的整卷照片）')
    : h('div.search-mode-tip.local', {},
        h('span.dot', {}), '当前为本地模式，通过 OCR 识别文字后规则分析；',
        h('button.link-btn', {
          onClick: () => { location.hash = '#/teacher/settings'; }
        }, '连接支持视觉的大模型 API'),
        ' 可直接看图分析，效果更佳');

  // 上传区
  const fileInput = h('input.exam-file-input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    onChange: e => addFiles(e.target.files)
  });

  const uploadZone = h('div.exam-upload-zone' + (loading ? '.dragging' : ''), {
    onClick: () => { if (!loading) fileInput.click(); },
    onDragover: e => { e.preventDefault(); uploadZone.classList.add('dragging'); },
    onDragleave: e => { uploadZone.classList.remove('dragging'); },
    onDrop: e => {
      e.preventDefault();
      uploadZone.classList.remove('dragging');
      if (!loading) addFiles(e.dataTransfer.files);
    }
  },
    h('div.exam-upload-icon', {}, loading ? '⏳' : '📸'),
    h('div.exam-upload-title', {}, loading ? loadingMsg : '拖拽试卷照片到此处，或点击上传'),
    h('div.exam-upload-sub', {},
      '支持 JPG / PNG，可多选（试卷多页一起传效果更好）',
      h('br'),
      remote ? '大模型将直接看图分析错题与失分原因' : '本地 OCR 识别文字后分析，也可在下方手动输入')
  );

  // 缩略图预览
  const thumbsRow = images.length
    ? h('div.exam-thumbs', {},
        ...images.map((src, i) => h('div.exam-thumb', {},
          h('img', { src, alt: `试卷${i + 1}` }),
          h('button.exam-thumb-del', {
            onClick: e => { e.stopPropagation(); removeImage(i); }
          }, '×')
        ))
      )
    : null;

  // 手动输入区
  const manualInput = h('textarea.exam-manual-input', {
    id: 'examManualText',
    rows: 4,
    placeholder: '本地模式 OCR 不准时，可在此输入试卷内容，例如：\n得分：85/100\n1. 计算题：3x+5=20，解方程 × 计算错误\n5. 二次函数最值问题 ✗ 概念混淆……',
    value: manualText,
    onInput: e => { manualText = e.target.value; }
  });

  const manualSection = h('details.exam-manual-section', {},
    h('summary.exam-manual-summary', {},
      '✍️ 手动输入试卷内容（可选，本地模式推荐）'),
    h('p.exam-manual-hint', {},
      '按"题号 + 题目 + 错误标记"的格式输入，系统会自动识别错题并分类。标记示例：× 、✗ 、扣3分、-2。'),
    manualInput
  );

  // 分析按钮
  const analyzeBtn = h('button.primary-btn.exam-analyze-btn', {
    onClick: doAnalyze,
    disabled: loading || (!images.length && manualText.trim().length < 10)
  }, loading ? '分析中…' : '🔍 开始分析');

  // 错误提示
  const errorBlock = errorMsg
    ? h('div.search-message', {}, `⚠️ ${errorMsg}`)
    : null;

  // 进度条
  const progressBlock = (loading && ocrProgress > 0 && ocrProgress < 1)
    ? h('div.exam-progress', {},
        h('div.exam-progress-bar', { style: `width:${Math.round(ocrProgress * 100)}%` }),
        h('span.exam-progress-text', {}, `OCR 识别中 ${Math.round(ocrProgress * 100)}%`))
    : null;

  // 结果区
  const resultArea = h('div.exam-result-area', {});
  if (loading) {
    resultArea.append(h('div.search-loading', {},
      h('div.spinner', {}), h('span', {}, loadingMsg || '正在分析试卷…')));
  } else if (lastResult) {
    paintResult(resultArea, lastResult);
  } else {
    resultArea.append(h('div.search-empty', {},
      h('div.search-empty-icon', {}, '📋'),
      h('h4', {}, '上传试卷照片，智能诊断考试情况'),
      h('p', {}, remote
        ? '上传试卷照片，思齐将看图分析：错题明细、失分原因、薄弱知识点，并给出针对性改进建议与复习规划。'
        : '上传试卷照片（OCR 识别）或手动输入内容，思齐将分析错题类型、薄弱知识点，并给出改进建议与复习规划。'),
      h('div.knowledge-usage', {},
        h('p', {}, '💡 拍摄建议：光线充足、试卷平铺、文字清晰，红笔批注和×标记更容易识别'),
        h('p', {}, '💡 多页试卷可一次上传多张照片，分析更完整')
      )
    ));
  }

  return h('div.exam-view', {},
    h('h3.section-title', {}, '📋 试卷分析'),
    modeTip,
    h('div.exam-upload-card', {}, fileInput, uploadZone, thumbsRow),
    manualSection,
    analyzeBtn,
    errorBlock,
    progressBlock,
    resultArea
  );
}

/** 添加图片文件（压缩后入列） */
async function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) { errorMsg = '请选择图片文件。'; rerender(); return; }
  errorMsg = '';
  loading = true;
  loadingMsg = '正在处理图片…';
  rerender();
  try {
    for (const f of files) {
      if (images.length >= 6) { errorMsg = '最多上传 6 张图片。'; break; }
      const dataUrl = await compressImage(f);
      images.push(dataUrl);
    }
  } catch (e) {
    errorMsg = e.message;
  } finally {
    loading = false;
    loadingMsg = '';
    rerender();
  }
}

/** 删除指定图片 */
function removeImage(i) {
  images.splice(i, 1);
  rerender();
}

/** 执行分析 */
async function doAnalyze() {
  if (loading) return;
  if (!images.length && manualText.trim().length < 10) {
    errorMsg = '请上传试卷图片，或输入至少 10 字的试卷内容。';
    rerender();
    return;
  }
  loading = true;
  errorMsg = '';
  lastResult = null;
  ocrProgress = 0;
  loadingMsg = llmAdapter.isRemote && images.length ? '大模型正在看图分析…' : '正在识别试卷文字…';
  rerender();
  try {
    const result = await analyzeExam(images, manualText, {
      onOcrProgress: p => {
        ocrProgress = p;
        loadingMsg = `正在识别试卷文字 ${Math.round(p * 100)}%…`;
        const bar = document.querySelector('.exam-progress-bar');
        if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      }
    });
    lastResult = result;
    // 保存历史
    store.update(state => ({
      examAnalysisHistory: [
        {
          subject: result.subject,
          score: result.score,
          mistakeCount: result.mistakes?.length || 0,
          time: Date.now()
        },
        ...(state.examAnalysisHistory || [])
      ].slice(0, 10)
    }));
  } catch (e) {
    errorMsg = e.message || '分析失败，请重试。';
  } finally {
    loading = false;
    loadingMsg = '';
    ocrProgress = 0;
    rerender();
  }
}

/** 渲染分析结果 */
function paintResult(container, r) {
  container.innerHTML = '';

  // 概览卡
  const scoreBlock = r.score
    ? h('div.exam-score-box', {},
        h('span.exam-score-num', {}, String(r.score.obtained)),
        h('span.exam-score-total', {}, `/${r.score.total}`),
        h('span.exam-score-rate', {}, r.score.total ? `${Math.round(r.score.obtained / r.score.total * 100)}%` : '')
      )
    : null;

  container.append(h('div.exam-result-head', {},
    h('div.exam-result-title-row', {},
      h('h4.exam-result-title', {}, `${r.subject || '未识别科目'}${r.examTitle ? ' · ' + r.examTitle : ''}`),
      h('span.kp-tag.source' + (llmAdapter.isRemote ? '.remote' : '.local'), {},
        llmAdapter.isRemote ? '☁️ 大模型分析' : '🧩 本地规则分析')
    ),
    scoreBlock,
    r.overview ? h('p.exam-result-overview', {}, r.overview) : null
  ));

  // 错题明细
  if (r.mistakes?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, `❌ 错题明细（${r.mistakes.length} 题）`),
      ...r.mistakes.map(m => h('div.mistake-card', {},
        h('div.mistake-head', {},
          h('span.mistake-question', {}, m.question || '未知题目'),
          m.errorType ? h('span.mistake-type-tag.' + typeClass(m.errorType), {}, m.errorType) : null
        ),
        m.knowledgePoint ? h('div.mistake-kp', {}, '考查知识点：', h('strong', {}, m.knowledgePoint)) : null,
        m.analysis ? h('p.mistake-analysis', {}, m.analysis) : null,
        m.suggestion ? h('div.mistake-suggestion', {}, '💡 ', m.suggestion) : null
      ))
    ));
  }

  // 优势与薄弱点（两栏）
  if (r.strengths?.length || r.weakAreas?.length) {
    container.append(h('div.exam-sw-grid', {},
      r.strengths?.length ? h('div.knowledge-section.exam-strengths', {},
        h('div.kp-block-title', {}, '✅ 做得好的方面'),
        h('ul.advice-list', {}, ...r.strengths.map(s => h('li', {}, s)))
      ) : null,
      r.weakAreas?.length ? h('div.knowledge-section.exam-weakness', {},
        h('div.kp-block-title', {}, '⚠️ 薄弱知识领域'),
        h('div.concept-grid', {},
          ...r.weakAreas.map(w => h('div.concept-card.weak', {}, h('span.concept-name', {}, w)))
        )
      ) : null
    ));
  }

  // 改进建议
  if (r.advice?.length) {
    container.append(h('div.knowledge-section', {},
      h('div.kp-block-title', {}, '💡 改进建议'),
      h('ul.advice-list.numbered', {}, ...r.advice.map(s => h('li', {}, s)))
    ));
  }

  // 复习规划
  if (r.studyPlan) {
    container.append(h('div.knowledge-section.exam-plan-section', {},
      h('div.kp-block-title', {}, '📅 复习规划'),
      h('p.exam-plan-text', {}, r.studyPlan)
    ));
  }

  // 底部操作
  container.append(h('div.knowledge-actions', {},
    h('button.ghost-btn', {
      onClick: () => {
        lastResult = null;
        errorMsg = '';
        rerender();
      }
    }, '🔄 重新分析'),
    h('button.ghost-btn', {
      onClick: () => { location.hash = '#/student/mistakes'; }
    }, '📕 收入错题本'),
    h('button.ghost-btn', {
      onClick: () => { location.hash = '#/student/feynman'; }
    }, '🎤 费曼复述检验')
  ));
}

/** 错误类型 → 样式类 */
function typeClass(type) {
  const map = {
    '计算错误': 't-calc', '概念混淆': 't-concept', '审题不清': 't-read',
    '方法不当': 't-method', '粗心大意': 't-careless', '知识盲区': 't-blind'
  };
  return map[type] || 't-other';
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderExamAnalysis());
}