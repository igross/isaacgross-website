(async () => {
 const root=document.querySelector('#rate-history');if(!root)return;
 const $=s=>root.querySelector(s), ns='http://www.w3.org/2000/svg';
 const play=$('#rate-play'),slider=$('#rate-scrub'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let data;
 try {const response=await fetch('/assets/cash-rate-history.json');if(!response.ok)throw Error();data=await response.json();}
 catch {$('#rate-date').textContent='History unavailable';return;}
 const frames=data.frames, date=s=>Date.parse(s+'T00:00:00Z'),year=365.25*86400000;
 const start=date('2009-01-01'),end=date('2029-01-01');
 const max=Math.ceil(Math.max(...frames.flatMap(f=>f.forward),...data.actual.map(a=>a[1]))),min=-.5;
 const x=t=>52+(t-start)/(end-start)*918,y=v=>345-(v-min)/(max-min)*325;
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;}
 for(let v=0;v<=max;v++){$('#rate-grid').append(el('line',{x1:52,x2:970,y1:y(v),y2:y(v)}));$('#rate-labels').append(el('text',{x:40,y:y(v)+4,'text-anchor':'end'},v+'%'));}
 for(let yr=2009;yr<=2029;yr+=2)$('#rate-labels').append(el('text',{x:x(date(yr+'-01-01')),y:377,'text-anchor':'middle'},String(yr)));
 const curve=f=>f.forward.map((v,j)=>`${j?'L':'M'}${x(date(f.date)+data.horizons[j]*year).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
 function actualPath(until){const points=data.actual.filter(a=>date(a[0])<=until);if(!points.length)return '';let d=`M${x(date(points[0][0]))},${y(points[0][1])}`;for(const a of points.slice(1))d+=`H${x(date(a[0]))}V${y(a[1])}`;return d+`H${x(until)}`;}
 const ghosts=[];frames.forEach((f,i)=>{if(i%3===0){const p=el('path',{d:curve(f)});$('#rate-ghosts').append(p);ghosts.push([i,p]);}});
 $('#rate-future').setAttribute('d',actualPath(date(frames.at(-1).date)));
 let index=0,playing=false,raf,last=0,started=false;
 const fmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 function draw(){const f=frames[index],t=date(f.date);$('#rate-date').textContent=fmt.format(t);$('#rate-target').textContent=`Cash rate target ${f.target.toFixed(2)}%`;
 slider.value=index;slider.setAttribute('aria-valuetext',fmt.format(t));$('#rate-forward').setAttribute('d',curve(f));$('#rate-actual').setAttribute('d',actualPath(t));$('#rate-cursor').setAttribute('x1',x(t));$('#rate-cursor').setAttribute('x2',x(t));$('#rate-dot').setAttribute('cx',x(t));$('#rate-dot').setAttribute('cy',y(f.target));
 ghosts.forEach(([i,p])=>p.style.display=i<index?'':'none');$('#rate-future').style.display=$('#rate-reveal').checked?'':'none';
 }
 function stop(){playing=false;cancelAnimationFrame(raf);play.textContent=index===frames.length-1?'Replay history':'Play history';}
 function tick(now){if(!playing)return;if(now-last>180){last=now;if(index<frames.length-1){index++;draw();}else{stop();return;}}raf=requestAnimationFrame(tick);}
 function run(){if(index===frames.length-1)index=0;playing=true;play.textContent='Pause';last=performance.now();draw();raf=requestAnimationFrame(tick);}
 play.addEventListener('click',()=>playing?stop():run());slider.addEventListener('input',()=>{stop();index=Number(slider.value);draw();});$('#rate-reveal').addEventListener('change',draw);
 root.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{stop();index=frames.findIndex(f=>f.date.startsWith(b.dataset.month));if(index<0)index=0;draw();}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});reduce.addEventListener('change',()=>{if(reduce.matches)stop();});
 const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&!started){started=true;if(!reduce.matches)run();}else if(!e.isIntersecting&&playing)stop();}},{threshold:.3});
 play.disabled=false;slider.disabled=false;slider.max=frames.length-1;draw();observer.observe(root);
})();
