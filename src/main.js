/**
 * 思齐 StudySage · 应用入口
 * 哈希路由：根据 hash 渲染外壳与对应视图；角色切换与导航联动。
 */
import './engine/registerEngines.js';
import './engine/searchEngine.js';
import { renderShell, mountView, getDefaultHash } from './ui/appShell.js';
import { renderSearch } from './ui/student/searchView.js';
import { renderKnowledge } from './ui/student/knowledgeView.js';
import { renderExamAnalysis } from './ui/student/examAnalysisView.js';
import { renderTutor } from './ui/student/tutorView.js';
import { renderQuiz } from './ui/student/quizView.js';
import { renderMastery } from './ui/student/masteryView.js';
import { renderMistakes } from './ui/student/mistakesView.js';
import { renderFeynman } from './ui/student/feynmanView.js';
import { renderReview } from './ui/student/reviewView.js';
import { renderDashboard } from './ui/teacher/dashboardView.js';
import { renderData } from './ui/teacher/dataView.js';
import { renderSettings } from './ui/teacher/settingsView.js';
import { store } from './store/storage.js';
import { llmAdapter } from './engine/llmAdapter.js';

const ROUTES = {
  '#/student/search': renderSearch,
  '#/student/knowledge': renderKnowledge,
  '#/student/exam': renderExamAnalysis,
  '#/student/tutor': renderTutor,
  '#/student/quiz': renderQuiz,
  '#/student/mastery': renderMastery,
  '#/student/mistakes': renderMistakes,
  '#/student/feynman': renderFeynman,
  '#/student/review': renderReview,
  '#/teacher/dashboard': renderDashboard,
  '#/teacher/data': renderData,
  '#/teacher/settings': renderSettings
};

function navigate(hash) {
  if (location.hash !== hash) {
    location.hash = hash;
  } else {
    render();
  }
}

function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.append(renderShell(navigate));

  const viewFn = ROUTES[location.hash];
  if (viewFn) {
    mountView(viewFn());
  } else {
    const fallback = getDefaultHash(store.getState().role);
    location.hash = fallback;
  }
}

window.addEventListener('hashchange', render);

// 启动：先从服务端同步 API 配置（局域网共享），再渲染首页
llmAdapter.initFromServer().finally(() => {
  if (!ROUTES[location.hash]) {
    location.hash = getDefaultHash(store.getState().role);
  } else {
    render();
  }
});
