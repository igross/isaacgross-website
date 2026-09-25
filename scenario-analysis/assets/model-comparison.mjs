// Match monetary policy and FX on initial outcomes; commodity prices on size.
// No partial comparison: every nonzero selected shock must have a counterpart.
export function comparison(data,model,amounts){
  const other=data.models.find(m=>m.id!==model.id),mapped={};
  const pairs=[['ncr','eps_r','CR'],['wpcom','eps_p_star_z',null],['rtwi','eps_psi','TWI']];
  const active=Object.entries(amounts).filter(([,v])=>v!==0);
  if(!active.length)return null;
  for(const [id,value] of active){
    const pair=pairs.find(p=>p[model.id==='martin'?0:1]===id);
    if(!pair)return null;
    const target=pair[other.id==='martin'?0:1],key=pair[2];
    const from=key?model.mapped[id][key][0]:model.shocks.find(s=>s.id===id).displayFactor;
    const to=key?other.mapped[target][key][0]:other.shocks.find(s=>s.id===target).displayFactor;
    if(!Number.isFinite(from)||!Number.isFinite(to)||Math.abs(to)<1e-12)return null;
    mapped[target]=(mapped[target]||0)+value*from/to;
  }
  return {model:other,amounts:mapped};
}
