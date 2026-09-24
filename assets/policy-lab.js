(() => {
  const root = document.querySelector('#policy-lab');
  if (!root) return;
  const slider = root.querySelector('input');
  const chart = root.querySelector('svg');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame;
  const paths = ['demand', 'inflation'].map(id => root.querySelector('#lab-' + id));
  function update(animate = true) {
    cancelAnimationFrame(frame);
    const shock = Number(slider.value);
    root.querySelector('output').textContent = `${shock > 0 ? '+' : ''}${shock.toFixed(2)} percentage points`;
    slider.setAttribute('aria-valuetext', `${shock.toFixed(2)} percentage points`);
    root.querySelector('.lab-response').textContent = shock === 0 ? 'No rate change: both paths stay at the baseline.' : shock > 0 ? 'A rate rise cools demand first. Inflation responds more slowly.' : 'A rate cut supports demand first. Inflation responds more slowly.';
    const series = [[], []];
    for (let q = 0; q <= 48; q++) {
      const t = q / 4;
      series[0].push([60 + t * 45, 165 + shock * 65 * (t / 2) * Math.exp(1 - t / 2)]);
      series[1].push([60 + t * 45, 165 + shock * 38 * (t * t / 16) * Math.exp(2 - t / 2)]);
    }
    paths.forEach((p, i) => {
      p.setAttribute('d', series[i].map(([x,y],j) => `${j?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
      p.style.strokeDasharray = 'none';
      p.style.strokeDashoffset = '0';
    });
    if (!animate || reduced.matches) return;
    const lengths = paths.map(p => p.getTotalLength());
    paths.forEach((p,i) => {p.style.strokeDasharray = lengths[i];p.style.strokeDashoffset = lengths[i];});
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1,(now-start)/1100);
      paths.forEach((p,i) => p.style.strokeDashoffset = lengths[i]*(1-progress));
      if(progress<1) frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }
  slider.addEventListener('input', () => update(false));
  slider.addEventListener('change', () => update());
  root.querySelectorAll('[data-shock]').forEach(button => button.addEventListener('click', () => {slider.value=button.dataset.shock;update();}));
  root.querySelector('.lab-replay').addEventListener('click', () => update());
  reduced.addEventListener('change', () => update(false));
  root.hidden=false;
  update(false);
})();
