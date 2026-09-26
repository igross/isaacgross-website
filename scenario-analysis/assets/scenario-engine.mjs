// All shocks begin in the September 2026 quarter. Data arrays begin at impact.
export function scenario(data, model, amounts) {
  const active = Object.entries(amounts).filter(([, value]) => value !== 0);
  for (const [id, amount] of active) {
    if (!model.mapped[id] || !Number.isFinite(amount)) throw new Error('Invalid shock');
  }
  const result = {};
  for (const [key, baseline] of Object.entries(data.baseline)) {
    const covered = key in model.mapped[model.shocks[0].id];
    const delta = baseline.values.map((b, t) => {
      if (!Number.isFinite(b)) return null;
      if (t < data.shockStart) return 0;
      if (!covered) return null;
      const h = t - data.shockStart;
      let value = 0;
      for (const [id, amount] of active) {
        const response = model.mapped[id][key]?.[h];
        if (!Number.isFinite(response)) return null;
        value += amount * response;
      }
      // Index and dollar forecasts need a percentage-to-level conversion.
      return ['TWI', 'Crude'].includes(key) ? b * value / 100 : value;
    });
    result[key] = {baseline: baseline.values, delta, covered,
      values: baseline.values.map((b, t) => delta[t] === null ? null : b + delta[t])};
  }
  return result;
}

export function csv(data, model, result, amounts) {
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = [['Model', model.name], ['Baseline', data.vintage], ['Shocks start',data.quarters[data.shockStart]],
    ['Shock units','Percent or percentage points as specified for each shock'],
    ...Object.entries(amounts).filter(([, a])=>a!==0).map(([id,a])=>['Shock',id,a*(model.shocks.find(s=>s.id===id).displayFactor||1),model.shocks.find(s=>s.id===id).unit,model.shocks.find(s=>s.id===id).sizeDescription||'']),
    ['Variable','Unit','Quarter','Endpoint status','Baseline','Scenario','Difference','Response coverage']];
  for (const [key, series] of Object.entries(result)) {
    data.quarters.forEach((q,t)=>rows.push([data.baseline[key].name,data.baseline[key].unit,q,
      data.baseline[key].observations?.[t] ?? (data.published[t]?'RBA published':'Interpolated'),
      series.baseline[t],series.values[t],series.delta[t],series.covered?'Mapped':'Unavailable']));
  }
  return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
