/**
 * 学生端 · 基于遗忘曲线的间隔复习
 */
import { h } from '../../utils/helpers.js';
import { store } from '../../store/storage.js';
import {
  completeReview, getDueReviews, getUpcoming, forceDueForDemo, reviewOverview, kpReviewName
} from '../../engine/reviewScheduler.js';

export function renderReview() {
  const state = store.getState();
  const now = Date.now();
  const due = getDueReviews(state.reviews, now);
  const upcoming = getUpcoming(state.reviews, now);
  const overview = reviewOverview(state.reviews, now);
  const mature = state.reviews.filter(r => r.mature);

  const kpis = h('div.kpi-row', {},
    stat('复习计划', overview.total),
    stat('今日待复习', overview.due),
    stat('即将到来', overview.upcoming),
    stat('已形成长期记忆', overview.mature)
  );

  const demoBar = h('div.review-demo-bar', {},
    h('span', {}, '演示辅助：真实间隔在未来，可模拟时间流逝，把全部计划提前到现在。'),
    h('button.ghost-btn', {
      onClick: () => {
        const forced = forceDueForDemo(store.getState().reviews);
        store.update({ reviews: forced });
        rerender();
      }
    }, '模拟到期')
  );

  const dueSection = h('div.section', {},
    h('h3.section-title', {}, '🔔 今日待复习'),
    !due.length
      ? h('p.empty', '当前没有到期的复习，先去答题或引导答疑掌握知识点吧。')
      : h('div.review-cards', {}, ...due.map(r =>
        h('div.review-item', {},
          h('div.review-item-main', {},
            h('strong', {}, kpReviewName(r.kpId)),
            h('div', {}, `当前间隔 ${r.intervalDays} 天 · 已复习 ${r.history.length} 次`)
          ),
          h('div.review-actions', {},
            h('button.primary-btn.sm', { onClick: () => finish(r, true) }, '记得，通过'),
            h('button.ghost-btn.sm', { onClick: () => finish(r, false) }, '想不起来')
          )
        )
      ))
  );

  const upcomingSection = h('div.section', {},
    h('h3.section-title', {}, '📅 未来复习安排'),
    !upcoming.length ? h('p.empty', '暂无未来安排。')
      : h('div.upcoming-list', {}, ...upcoming.map(r =>
        h('div.upcoming-row', {},
          h('span', {}, kpReviewName(r.kpId)),
          h('span', {}, `${r.intervalDays} 天间隔`),
          h('span', {}, '到期：' + new Date(r.nextDue).toLocaleDateString('zh-CN'))
        )
      ))
  );

  const matureSection = h('div.section', {},
    h('h3.section-title', {}, '🧠 长期记忆（已完成全部间隔）'),
    !mature.length ? h('p.empty', '还没有知识点进入长期记忆。')
      : h('div', {}, ...mature.map(r => h('span.kw-chip', { style: { margin: '4px' } }, kpReviewName(r.kpId))))
  );

  return h('div.review-view', {}, kpis, demoBar, dueSection, upcomingSection, matureSection);
}

function finish(review, success) {
  const next = completeReview(review, success);
  store.upsertReview(next);
  rerender();
}

function stat(label, value) {
  return h('div.stat-card', {}, h('div.stat-label', {}, label), h('div.stat-value', {}, value));
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderReview());
}
