/**
 * 应用外壳：侧边导航 + 角色切换 + 内容区
 * 学生端与教师端导航完全差异化，角色状态持久化。
 */
import { h, clearNode } from '../utils/helpers.js';
import { store } from '../store/storage.js';

const NAV = {
  student: [
    { hash: '#/student/search', icon: '🌐', label: '全网知识搜索' },
    { hash: '#/student/knowledge', icon: '🧠', label: '知识点梳理' },
    { hash: '#/student/exam', icon: '📋', label: '试卷分析' },
    { hash: '#/student/tutor', icon: '💬', label: '引导式答疑' },
    { hash: '#/student/quiz', icon: '📝', label: '答题 / 自测' },
    { hash: '#/student/mastery', icon: '📊', label: '掌握度与路径' },
    { hash: '#/student/mistakes', icon: '📕', label: '错题本' },
    { hash: '#/student/feynman', icon: '🎤', label: '费曼复述' },
    { hash: '#/student/review', icon: '🔁', label: '间隔复习' }
  ],
  teacher: [
    { hash: '#/teacher/dashboard', icon: '📈', label: '学情看板' },
    { hash: '#/teacher/data', icon: '📊', label: '成绩导入分析' },
    { hash: '#/teacher/settings', icon: '⚙️', label: '引擎设置' }
  ]
};

const DEFAULT_HASH = {
  student: '#/student/tutor',
  teacher: '#/teacher/dashboard'
};

export function getDefaultHash(role) {
  return DEFAULT_HASH[role];
}

export function renderShell(onNavigate) {
  const { role } = store.getState();

  const navItems = NAV[role].map(item =>
    h('button.nav-item' + (location.hash === item.hash ? '.active' : ''), {
      'data-hash': item.hash,
      onClick: () => onNavigate(item.hash)
    },
      h('span.nav-icon', {}, item.icon),
      h('span.nav-label', {}, item.label)
    )
  );

  const roleSwitch = h('div.role-switch', {},
    h('button.role-btn' + (role === 'student' ? '.active' : ''), {
      onClick: () => switchRole('student', onNavigate)
    }, '🎓 学生端'),
    h('button.role-btn' + (role === 'teacher' ? '.active' : ''), {
      onClick: () => switchRole('teacher', onNavigate)
    }, '👩‍🏫 教师端')
  );

  const sidebar = h('aside.sidebar', {},
    h('div.brand', {},
      h('div.brand-mark', {}, '思'),
      h('div.brand-text', {},
        h('div.brand-name', {}, '思齐 StudySage'),
        h('div.brand-slogan', {}, 'AI 学习辅助智能体')
      )
    ),
    h('nav.side-nav', {}, ...navItems),
    h('div.side-foot', {}, roleSwitch)
  );

  const header = h('header.topbar', {},
    h('div.topbar-title', {}, currentTitle()),
    h('div.topbar-right', {},
      h('span.role-tag', {}, role === 'student' ? '学生视角' : '教师视角'),
      h('button.ghost-btn', { onClick: () => { if (confirm('确定清空全部本地演示数据并重置？')) { store.reset(); onNavigate(getDefaultHash('student')); } } }, '重置演示数据')
    )
  );

  const main = h('main.content', { id: 'view-root' });
  return h('div.app', { 'data-role': role }, sidebar, h('div.main-col', {}, header, main));
}

function currentTitle() {
  const all = [...NAV.student, ...NAV.teacher];
  const cur = all.find(n => n.hash === location.hash);
  return h('span', {}, cur ? `${cur.icon} ${cur.label}` : '思齐');
}

function switchRole(next, onNavigate) {
  store.update({ role: next });
  onNavigate(DEFAULT_HASH[next]);
}

export function mountView(node) {
  const root = document.getElementById('view-root');
  clearNode(root);
  if (node) root.append(node);
}
