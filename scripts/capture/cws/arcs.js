// The icon's three sound arcs (assets/brand/icon.svg: radii 13, 24, 35 about the cone mouth, about +-48 degrees),
// scaled up as a background motif. Usage: <svg class=arcs data-cx data-cy data-r data-w data-color data-opacity>.
for (const svg of document.querySelectorAll('svg.arcs')) {
  const d = svg.dataset, cx = +d.cx, cy = +d.cy, r = +d.r;
  svg.setAttribute('width', document.body.clientWidth); svg.setAttribute('height', document.body.clientHeight);
  svg.style.left = 0; svg.style.top = 0;
  svg.innerHTML = [[13, 50], [24, 47], [35, 45]].map(([k, deg]) => {
    const R = (r * k) / 13, a = (deg * Math.PI) / 180, x = cx + R * Math.cos(a), dy = R * Math.sin(a);
    return `<path d="M${x},${cy - dy}A${R},${R} 0 0 1 ${x},${cy + dy}"/>`;
  }).join('');
  Object.assign(svg.style, { fill: 'none', stroke: d.color, strokeWidth: d.w, strokeLinecap: 'round', opacity: d.opacity });
}
