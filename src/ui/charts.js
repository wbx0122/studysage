/**
 * 轻量 SVG 图表组件（零依赖、离线可用）
 * 提供：柱状图、环形图、横向条形图；配色集中管理，避免紫/靛蓝。
 */
import { h } from '../utils/helpers.js';

export const PALETTE = [
  '#0ea5a4', '#f59e0b', '#ef4444', '#22c55e',
  '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#ec4899', '#64748b'
];

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 纵向柱状图：data = [{label, value, color?}] */
export function barChart(data, { width = 560, height = 260, unit = '' } = {}) {
  const wrap = h('div.chart-wrap');
  if (!data.length) return wrap.append(h('p.empty', '暂无数据')), wrap;
  const padL = 42, padB = 46, padT = 16, padR = 12;
  const max = Math.max(...data.map(d => d.value), 1);
  const bw = (width - padL - padR) / data.length;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });

  // 网格线与纵轴刻度
  for (let i = 0; i <= 4; i++) {
    const y = padT + (height - padT - padB) * (i / 4);
    const val = Math.round(max * (1 - i / 4));
    svg.append(svgEl('line', { x1: padL, y1: y, x2: width - padR, y2: y, stroke: '#e5e7eb', 'stroke-width': 1 }));
    const t = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-text' });
    t.textContent = val;
    svg.append(t);
  }

  data.forEach((d, i) => {
    const hpx = (height - padT - padB) * (d.value / max);
    const x = padL + bw * i + bw * 0.18;
    const y = height - padB - hpx;
    const rect = svgEl('rect', {
      x, y, width: bw * 0.64, height: Math.max(2, hpx), rx: 4,
      fill: d.color || PALETTE[i % PALETTE.length]
    });
    rect.append(svgEl('title', {}));
    rect.querySelector('title').textContent = `${d.label}：${d.value}${unit}`;
    svg.append(rect);
    const top = svgEl('text', { x: x + bw * 0.32, y: y - 6, 'text-anchor': 'middle', class: 'bar-value' });
    top.textContent = d.value;
    svg.append(top);
    const label = svgEl('text', { x: x + bw * 0.32, y: height - padB + 18, 'text-anchor': 'middle', class: 'axis-text' });
    label.textContent = d.label;
    svg.append(label);
  });
  wrap.append(svg);
  return wrap;
}

/** 环形图：segments = [{label, value, color?}] */
export function donutChart(segments, { size = 240 } = {}) {
  const wrap = h('div.donut-wrap');
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return wrap.append(h('p.empty', '暂无数据')), wrap;
  const cx = size / 2, cy = size / 2, r = size * 0.34, inner = size * 0.22;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, role: 'img' });
  let angle = -Math.PI / 2;

  segments.forEach((s, i) => {
    const frac = s.value / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = a2 - angle > Math.PI ? 1 : 0;
    const color = s.color || PALETTE[i % PALETTE.length];
    const p = svgEl('path', {
      d: arc(cx, cy, r, inner, angle, a2), fill: color, class: 'donut-seg'
    });
    const tt = svgEl('title');
    tt.textContent = `${s.label}：${s.value}（${Math.round(frac * 100)}%）`;
    p.append(tt);
    svg.append(p);
    angle = a2;
  });
  const center = svgEl('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'donut-total' });
  center.textContent = total;
  const sub = svgEl('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'donut-sub' });
  sub.textContent = '总计';
  svg.append(center, sub);

  const legend = h('div.chart-legend');
  segments.forEach((s, i) => {
    const frac = Math.round((s.value / total) * 100);
    legend.append(
      h('div.legend-item', {},
        h('span.legend-dot', { style: { background: s.color || PALETTE[i % PALETTE.length] } }),
        h('span.legend-label', {}, s.label),
        h('span.legend-value', {}, `${s.value} · ${frac}%`)
      )
    );
  });
  wrap.append(h('div.donut-svg', {}, svg), legend);
  return wrap;
}

/** 堆叠柱状图：groups = [{label, segments:[{label, value, color}]}]，每根柱子内多段堆叠 */
export function stackedBarChart(groups, { width = 560, height = 280, unit = '' } = {}) {
  const wrap = h('div.chart-wrap');
  if (!groups.length) return wrap.append(h('p.empty', '暂无数据')), wrap;
  const padL = 42, padB = 46, padT = 20, padR = 12;
  const max = Math.max(...groups.map(g => g.segments.reduce((a, s) => a + s.value, 0)), 1);
  const bw = (width - padL - padR) / groups.length;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });

  // 网格线与纵轴刻度
  for (let i = 0; i <= 4; i++) {
    const y = padT + (height - padT - padB) * (i / 4);
    const val = Math.round(max * (1 - i / 4));
    svg.append(svgEl('line', { x1: padL, y1: y, x2: width - padR, y2: y, stroke: '#e5e7eb', 'stroke-width': 1 }));
    const t = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-text' });
    t.textContent = val;
    svg.append(t);
  }

  groups.forEach((g, i) => {
    const total = g.segments.reduce((a, s) => a + s.value, 0);
    let acc = 0;
    const x = padL + bw * i + bw * 0.18;
    const barW = bw * 0.64;
    g.segments.forEach(seg => {
      if (!seg.value) return;
      const hpx = (height - padT - padB) * (seg.value / max);
      const y = height - padB - acc - hpx;
      const rect = svgEl('rect', {
        x, y, width: barW, height: Math.max(2, hpx), rx: 3,
        fill: seg.color, stroke: '#fff', 'stroke-width': 0.75
      });
      const tt = svgEl('title');
      tt.textContent = `${g.label} · ${seg.label}：${seg.value}${unit}`;
      rect.append(tt);
      svg.append(rect);
      acc += hpx;
    });
    // 顶部总人数
    if (total > 0) {
      const top = svgEl('text', { x: x + barW / 2, y: height - padB - acc - 6, 'text-anchor': 'middle', class: 'bar-value' });
      top.textContent = total;
      svg.append(top);
    }
    // x 轴科目名
    const label = svgEl('text', { x: x + barW / 2, y: height - padB + 18, 'text-anchor': 'middle', class: 'axis-text' });
    label.textContent = g.label;
    svg.append(label);
  });
  wrap.append(svg);

  // 图例（取第一组的段标签与颜色）
  const segs = groups[0].segments || [];
  if (segs.length) {
    const legend = h('div.chart-legend');
    segs.forEach(seg => {
      legend.append(
        h('div.legend-item', {},
          h('span.legend-dot', { style: { background: seg.color } }),
          h('span.legend-label', {}, seg.label)
        )
      );
    });
    wrap.append(legend);
  }
  return wrap;
}

function arc(cx, cy, r, inner, a1, a2) {
  const p = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const [x1, y1] = p(r, a1), [x2, y2] = p(r, a2);
  const [x3, y3] = p(inner, a2), [x4, y4] = p(inner, a1);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${a2 - a1 > Math.PI ? 1 : 0} 0 ${x4} ${y4} Z`;
}

/** 横向条形排行：data = [{label, value}] */
export function rankBars(data, { unit = '', color = '#0ea5a4' } = {}) {
  const wrap = h('div.rank-bars');
  const max = Math.max(...data.map(d => d.value), 1);
  data.forEach((d, i) => {
    const row = h('div.rank-row', {},
      h('div.rank-head', {}, h('span.rank-name', { title: d.label }, d.label), h('span.rank-num', {}, `${d.value}${unit}`)),
      h('div.rank-track', {}, h('div.rank-fill', { style: { width: `${(d.value / max) * 100}%`, background: d.color || color } }))
    );
    wrap.append(row);
  });
  return wrap;
}
