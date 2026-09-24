(async () => {
 const root=document.querySelector('#rate-history');if(!root)return;
 const $=s=>root.querySelector(s), ns='http://www.w3.org/2000/svg';
 const play=$('#rate-play'),slider=$('#rate-scrub'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let data;
 try {const response=await fetch('/assets/cash-rate-history.json?v=2');if(!response.ok)throw Error();data=await response.json();}
 catch {$('#rate-date').textContent='History unavailable';return;}
 const frames=data.frames, date=s=>Date.parse(s+'T00:00:00Z'),year=365.25*86400000;
 const start=date('2009-01-01'),end=date('2029-01-01');
 const max=Math.ceil(Math.max(...frames.map(f=>Math.max(...f.forward)),...data.actual.map(a=>a[1]))),min=-.5;
 let width=1000,height=400,left=40,right=970,bottom=345;
 const x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-20);
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;}
 const curve=f=>f.forward.map((v,j)=>`${j?'L':'M'}${x(date(f.date)+data.horizons[j]*year).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
 function actualPath(until){const points=data.actual.filter(a=>date(a[0])<=until);if(!points.length)return '';let d=`M${x(date(points[0][0]))},${y(points[0][1])}`;for(const a of points.slice(1))d+=`H${x(date(a[0]))}V${y(a[1])}`;return d+`H${x(until)}`;}
 const ghosts=[];let priorQuarter='';frames.forEach((f,i)=>{const quarter=f.date.slice(0,4)+'-'+Math.floor((Number(f.date.slice(5,7))-1)/3);if(quarter!==priorQuarter){priorQuarter=quarter;}else{return;}if(true){const p=el('path',{d:curve(f)});$('#rate-ghosts').append(p);ghosts.push([i,p]);}});
 $('#rate-future').setAttribute('d',actualPath(date(frames.at(-1).date)));
 let index=0,playing=false,raf,last=0,started=false,initialIndex=0;
 const fmt=new Intl.DateTimeFormat('en-AU',{month:'short',year:'numeric',timeZone:'UTC'});
 function draw(){const f=frames[index],t=date(f.date);$('#rate-date').textContent=fmt.format(t);
 slider.value=index;slider.setAttribute('aria-valuetext',fmt.format(t));$('#rate-forward').setAttribute('d',curve(f));$('#rate-actual').setAttribute('d',actualPath(t));$('#rate-cursor').setAttribute('x1',x(t));$('#rate-cursor').setAttribute('x2',x(t));$('#rate-dot').setAttribute('cx',x(t));$('#rate-dot').setAttribute('cy',y(f.target));
 ghosts.forEach(([i,p])=>p.style.display=i<index?'':'none');$('#rate-future').style.display=$('#rate-reveal').checked?'':'none';
 }
 function stop(){playing=false;cancelAnimationFrame(raf);play.textContent=index===frames.length-1?'Replay history':'Play history';}
 function tick(now){if(!playing)return;const next=Math.min(frames.length-1,initialIndex+Math.floor((now-last)/36720*(frames.length-1)));if(next!==index){index=next;draw();}if(index===frames.length-1){stop();return;}raf=requestAnimationFrame(tick);}
 function run(){if(index===frames.length-1)index=0;playing=true;play.textContent='Pause';last=performance.now();initialIndex=index;draw();raf=requestAnimationFrame(tick);}
 play.addEventListener('click',()=>{started=true;playing?stop():run();});slider.addEventListener('input',()=>{started=true;stop();index=Number(slider.value);draw();});$('#rate-reveal').addEventListener('change',draw);
 root.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{stop();index=frames.findIndex(f=>f.date.startsWith(b.dataset.month));if(index<0)index=0;draw();}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});reduce.addEventListener('change',()=>{if(reduce.matches)stop();});
 const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&!started){started=true;if(!reduce.matches)run();}else if(!e.isIntersecting&&playing)stop();}},{threshold:.3});
 function resize(){
 const measured=Math.round($('#rate-chart').getBoundingClientRect().width);if(!measured)return;
 width=measured;height=width<600?280:Math.round(width*.4);left=36;right=width-18;bottom=height-35;
 $('#rate-chart').setAttribute('viewBox',`0 0 ${width} ${height}`);
 const clip=$('#rate-clip rect');for(const[k,v]of Object.entries({x:left,y:20,width:right-left,height:bottom-20}))clip.setAttribute(k,v);
 $('#rate-cursor').setAttribute('y2',bottom);
 $('#rate-grid').replaceChildren();$('#rate-labels').replaceChildren();
 for(let v=0;v<=max;v++){$('#rate-grid').append(el('line',{x1:left,x2:right,y1:y(v),y2:y(v)}));$('#rate-labels').append(el('text',{x:left-8,y:y(v)+4,'text-anchor':'end'},v+'%'));}
 const years=width<600?[2010,2015,2020,2025]:[2010,2012,2014,2016,2018,2020,2022,2024,2026,2028];
 for(const yr of years)$('#rate-labels').append(el('text',{x:x(date(yr+'-01-01')),y:height-10,'text-anchor':'middle'},String(yr)));
 ghosts.forEach(([i,p])=>p.setAttribute('d',curve(frames[i])));
 $('#rate-future').setAttribute('d',actualPath(date(frames.at(-1).date)));draw();
 }
 play.disabled=false;slider.disabled=false;slider.max=frames.length-1;resize();
 new ResizeObserver(resize).observe($('#rate-chart'));observer.observe(root);
})();
