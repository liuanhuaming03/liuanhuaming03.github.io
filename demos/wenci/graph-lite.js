/* 演示用轻量关系图：替代 CDN 上的 ECharts，只实现本页用到的 graph 系列（环形布局 + 连线标签）。 */
(function () {
  if (window.echarts) return;
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  window.echarts = {
    init(dom) {
      return {
        setOption(opt) {
          const s = (opt.series || [])[0] || {};
          const nodes = s.data || [], links = s.links || [];
          const w = dom.clientWidth || 640, h = dom.clientHeight || 360;
          dom.innerHTML = "";
          const svg = el("svg", { width: "100%", height: "100%", viewBox: `0 0 ${w} ${h}` });
          const cx = w / 2, cy = h / 2 + 10, r = Math.min(w, h) * 0.34;
          const pos = {};
          const main = nodes.findIndex((n) => n.symbolSize >= 50);
          nodes.forEach((n, i) => {
            if (i === main) { pos[n.name] = [cx, cy]; return; }
            const k = i - (main >= 0 && i > main ? 1 : 0), m = nodes.length - (main >= 0 ? 1 : 0);
            const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(m, 1);
            pos[n.name] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
          });
          links.forEach((l) => {
            const a = pos[l.source], b = pos[l.target]; if (!a || !b) return;
            svg.appendChild(el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#334155", "stroke-width": 1.5 }));
            const t = l.label && l.label.formatter;
            if (t) svg.appendChild(el("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 4, fill: "#8892a4", "font-size": 11, "text-anchor": "middle" }, t));
          });
          nodes.forEach((n) => {
            const [x, y] = pos[n.name]; const rad = (n.symbolSize || 25) / 2;
            const color = (n.itemStyle && n.itemStyle.color) || "#00d4ff";
            svg.appendChild(el("circle", { cx: x, cy: y, r: rad, fill: color, "fill-opacity": 0.85, stroke: "#0b1220", "stroke-width": 2 }));
            svg.appendChild(el("text", { x, y: y + rad + 15, fill: "#e0e6ed", "font-size": 12, "text-anchor": "middle" }, n.name));
          });
          const cats = (s.categories || []);
          cats.forEach((c, i) => {
            svg.appendChild(el("circle", { cx: 16 + i * 80, cy: 16, r: 6, fill: c.itemStyle.color }));
            svg.appendChild(el("text", { x: 26 + i * 80, y: 20, fill: "#8892a4", "font-size": 12 }, c.name));
          });
          dom.appendChild(svg);
        },
        resize() {},
        dispose() {},
      };
    },
  };
})();
