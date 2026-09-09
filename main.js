// =======================================
// TSP Lab — main.js (v2 full rewrite)
// =======================================

/* ===========================
 * 0) DOM hooks
 * =========================== */
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const hud    = document.getElementById('hud');
const sel    = document.getElementById('levelSelect');

/* ===========================
 * 1) i18n helper
 * =========================== */
const I18N = {
  it: {
    ui: {
      you:"Tu", you_partial:"Tu (parziale)", start:"Partenza",
      length:"lunghezza", best:"migliore", iteration:"iterazione",
      generation:"generazione", optimal:"(ottimo)", temperature:"temp"
    },
    alerts: {
      hkNotFound:"Held-Karp non ha trovato un tour.",
      bfNotFound:"Brute Force non ha trovato un tour."
    },
    algo: {
      hk:     {title:"Held-Karp",          type:"Esatto"},
      bf:     {title:"Brute Force",         type:"Esatto"},
      nn:     {title:"Nearest Neighbor",    type:"Euristica"},
      twoopt: {title:"2-Opt",              type:"Euristica"},
      sa:     {title:"Simulated Annealing", type:"Metaeuristica (singola)"},
      aco:    {title:"Ant Colony Opt.",     type:"Metaeuristica (popolazione)"},
      ga:     {title:"Genetic Algorithm",   type:"Metaeuristica (popolazione)"}
    }
  },
  en: {
    ui: {
      you:"You", you_partial:"You (partial)", start:"Start",
      length:"length", best:"best", iteration:"iteration",
      generation:"generation", optimal:"(optimal)", temperature:"temp"
    },
    alerts: {
      hkNotFound:"Held-Karp failed to find a tour.",
      bfNotFound:"Brute Force failed to find a tour."
    },
    algo: {
      hk:     {title:"Held-Karp",          type:"Exact"},
      bf:     {title:"Brute Force",         type:"Exact"},
      nn:     {title:"Nearest Neighbor",    type:"Heuristic"},
      twoopt: {title:"2-Opt",              type:"Heuristic"},
      sa:     {title:"Simulated Annealing", type:"Metaheuristic (single)"},
      aco:    {title:"Ant Colony Opt.",     type:"Metaheuristic (population)"},
      ga:     {title:"Genetic Algorithm",   type:"Metaheuristic (population)"}
    }
  }
};
const LANG = () => (String(document.documentElement.lang||'it').toLowerCase().startsWith('en')?'en':'it');
const tr = (path, fallback='') => {
  try { return path.split('.').reduce((o,k)=>o[k], I18N[LANG()]) ?? fallback; }
  catch { return fallback; }
};
const trPage = (key, fallback='') => {
  try { return TSP_I18N[LANG()][key] ?? fallback; } catch { return fallback; }
};

/* ===========================
 * 2) Styles & constants
 * =========================== */
const STYLES = {
  nn:     {stroke:'#4FD1FF', lightStroke:'#0EA5D9', dash:[10,7], marker:'square'},
  sa:     {stroke:'#9B8CFF', lightStroke:'#5B4FC7', dash:[6,4],  marker:'diamond'},
  aco:    {stroke:'#3FE0C5', lightStroke:'#1FA88F', dash:[3,5],  marker:'triangle'},
  bf:     {stroke:'#FF6B81', lightStroke:'#E8434A', dash:[2,3],  marker:'cross'},
  ga:     {stroke:'#FF8FC7', lightStroke:'#D6488A', dash:[6,4],  marker:'circle'}
};
function userColor(){ return isLight() ? '#2b2140' : '#fdf6ff'; }

const RIVAL_NAME = { bf:'Il Perfezionista', nn:'Il Furbo', sa:'Il Freddo', aco:'La Colonia', ga:"L'Evoluto" };
function rivalName(k){ return RIVAL_NAME[k] || k.toUpperCase(); }

let showLabels = true;
const LABEL_MODE = 'letters';
const SHUFFLE_LABELS = true;
const LABEL_FONT = '10px system-ui';
const START_LABEL_FONT = '12px system-ui';

/* ===========================
 * 3) State
 * =========================== */
let level   = null;
let nodes   = [];
let weight  = null;
let tour    = [];
let used    = new Set();

const ALGO_KEYS = ['bf','nn','sa','aco','ga'];
let algoTours  = {}; // key → tour array
let visibility = {}; // key → bool (toggle)
let scores     = {}; // key → string
let acoPheromone = null; // for pheromone visualisation

let labels  = [];
let hoverId = -1;

// Timer
let timerInterval = null;
let timerRemaining = 0;

// Animation progress indicator on canvas
let animProgress = null; // { label, progress (0-1), color, detail }

// Traveller animation state
let traveller = null; // { path, color, t (0→1), speed, trail:[], emoji }
let travellerRAF = null;

// Confetti particles
let confetti = [];
let confettiRAF = null;

function resetAlgoState(){
  algoTours={}; visibility={}; scores={};
  ALGO_KEYS.forEach(k=>{ algoTours[k]=null; visibility[k]=false; scores[k]='n/d'; });
  acoPheromone = null;
  animProgress = null;
  stopTraveller();
  stopConfetti();
}
resetAlgoState();

/* ===========================
 * 4) Event listeners
 * =========================== */
sel.addEventListener('change', ()=> loadLevel(sel.value));
document.getElementById('btnReset').onclick = resetTour;
document.getElementById('btnUndo').onclick = undoLast;

// Algo buttons — toggle behavior
ALGO_KEYS.forEach(key=>{
  const btn = document.querySelector(`[data-algo="${key}"]`);
  if(!btn) return;
  btn.addEventListener('click', ()=> runAlgo(key));
});

canvas.addEventListener('click', onClick);
canvas.addEventListener('mousemove', onMove);
window.addEventListener('resize', ()=>{ resizeCanvasToDisplaySize(); draw(); });

/* ===========================
 * 5) Utility
 * =========================== */
function resizeCanvasToDisplaySize(){
  const wrap = canvas.parentElement;
  if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Available space in the container
  const availW = Math.floor(rect.width);
  const availH = Math.floor(rect.height);

  // Target aspect ratio 8:5 (landscape, good for widescreen)
  const AR = 8/5;
  let cssW, cssH;
  if(availW / availH > AR){
    // container is wider than needed → height-limited
    cssH = availH;
    cssW = Math.floor(cssH * AR);
  } else {
    // container is taller than needed → width-limited
    cssW = availW;
    cssH = Math.floor(cssW / AR);
  }

  // Apply CSS size
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // Apply backing store (retina)
  const W = Math.floor(cssW * dpr);
  const H = Math.floor(cssH * dpr);
  if(canvas.width !== W || canvas.height !== H){
    canvas.width  = W;
    canvas.height = H;
  }
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function makeLabels(mode,n,jsonLabels){
  if(mode==='json'&&Array.isArray(jsonLabels)&&jsonLabels.length===n) return [...jsonLabels];
  if(mode==='numbers') return Array.from({length:n},(_,i)=>String(i+1));
  const arr=[]; for(let i=0;i<n;i++) arr.push(letterIndex(i)); return arr;
}
function letterIndex(k){
  const A='A'.charCodeAt(0);
  if(k<26) return String.fromCharCode(A+k);
  return String.fromCharCode(A+Math.floor(k/26)-1)+String.fromCharCode(A+k%26);
}

function tourLength(p){
  if(!p||p.length<2) return 0;
  let L=0;
  for(let i=0;i<p.length-1;i++){
    const w=weight(p[i],p[i+1]);
    if(!Number.isFinite(w)) return Infinity;
    L+=w;
  }
  if(p.length===nodes.length){
    const wc=weight(p[p.length-1],p[0]);
    if(!Number.isFinite(wc)) return Infinity;
    L+=wc;
  }
  return L;
}

function nodeRadius(){
  const w=canvas.getBoundingClientRect().width;
  if(w<500) return 11; if(w<800) return 9; return 7;
}

/* ===========================
 * 6) UI helpers
 * =========================== */
function showAlgoInfo(key, extraHtml=''){
  const box=document.getElementById('algoInfo');
  if(!box) return;
  let infoHtml = '';
  try { infoHtml = TSP_I18N[LANG()].info[key]; } catch{}
  if(!infoHtml){ box.classList.remove('show'); return; }
  const a = I18N[LANG()].algo[key] || {};
  box.innerHTML = `
    <h4>${a.title||key}</h4>
    <div class="meta">${a.type||''}</div>
    <div>${infoHtml}</div>
    ${extraHtml ? `<div style="margin-top:8px">${extraHtml}</div>` : ''}
  `;
  box.classList.add('show');
  // On mobile (single column), scroll to canvas so user sees the animation
  // On desktop (wide screen), scroll to the info box
  if(window.innerWidth <= 900){
    canvas.scrollIntoView({behavior:'smooth',block:'center'});
  } else {
    box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

function updateScore(key,value){
  scores[key]=value;
  refreshHUD();
}

function refreshHUD(){
  const parts=[];
  const isFull = tour.length===nodes.length && nodes.length>0 &&
                 Number.isFinite(weight(tour[tour.length-1],tour[0]));
  const youLabel = isFull ? '✦' : '✦~';
  const youVal = (tour.length>=2 && Number.isFinite(tourLength(tour))) ? tourLength(tour).toFixed(0) : '–';
  parts.push(`<span style="color:${userColor()}">${youLabel}${youVal}</span>`);

  ALGO_KEYS.forEach(k=>{
    if(scores[k]!=='n/d'){
      const label = k==='sa'?'SA': k.toUpperCase();
      const val = parseFloat(scores[k]);
      parts.push(`<span style="color:${strokeFor(STYLES[k])}">${label}:${Number.isFinite(val)?val.toFixed(0):scores[k]}</span>`);
    }
  });
  hud.innerHTML = parts.join('<span style="opacity:.3"> · </span>');
}

// Disable exact algo button if N too large
function updateExactButtons(){
  const N=nodes.length;
  const bfBtn=document.querySelector('[data-algo="bf"]');
  if(bfBtn){
    bfBtn.classList.toggle('disabled', N>11);
    bfBtn.title = N>11 ? trPage('disabled_bf') : '';
  }
}

// Toggle button active state
function refreshButtonStates(){
  ALGO_KEYS.forEach(k=>{
    const btn=document.querySelector(`[data-algo="${k}"]`);
    if(btn) btn.classList.toggle('active', visibility[k]);
  });
}

/* ===========================
 * 7) Timer
 * =========================== */
function startTimer(seconds){
  stopTimer();
  timerRemaining = seconds;
  const el = document.getElementById('timer');
  if(!el) return;
  const tick = ()=>{
    if(timerRemaining<=0){ stopTimer(); return; }
    const m=Math.floor(timerRemaining/60);
    const s=timerRemaining%60;
    el.textContent = m>0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`;
    el.classList.toggle('warn', timerRemaining<=10);
    timerRemaining--;
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}
function stopTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval=null;
  const el=document.getElementById('timer');
  if(el){ el.textContent=''; el.classList.remove('warn'); }
}

/* ===========================
 * 8) Feedback banner
 * =========================== */
function showFeedback(){
  const fb=document.getElementById('feedback');
  if(!fb||!nodes.length) return;
  const isFull = tour.length===nodes.length && Number.isFinite(weight(tour[tour.length-1],tour[0]));
  if(!isFull){ fb.classList.remove('show'); return; }

  const yourLen = tourLength(tour);
  let challengeHtml = trPage('feedback_challenge');

  // Compare with any computed algo
  const computed = ALGO_KEYS.filter(k=> algoTours[k] && scores[k]!=='n/d');
  let userWon = false;
  if(computed.length){
    const comparisons = computed.map(k=>{
      const algoLen = parseFloat(scores[k]);
      const name = rivalName(k);
      const yourRound = Math.round(yourLen);
      const algoRound = Math.round(algoLen);
      if(yourRound === algoRound) return `<span style="color:var(--yellow)">≈ ${trPage('feedback_tie').replace('{algo}',name)}</span>`;
      if(yourRound < algoRound){ userWon=true; return `<span style="color:var(--teal)">✓ ${trPage('feedback_beat').replace('{algo}',name)}</span>`; }
      return `<span style="color:var(--coral)">✗ ${trPage('feedback_lost').replace('{algo}',name)}</span>`;
    });
    challengeHtml = comparisons.join(' &nbsp; ');
  }

  fb.innerHTML = `
    <button class="close-toast" onclick="closeFeedback()">✕</button>
    <div>${trPage('feedback_your')} <span class="score">${yourLen.toFixed(0)}</span></div>
    <div class="challenge">${challengeHtml}</div>
    <button onclick="resetTour()">${trPage('feedback_retry')}</button>
  `;
  fb.classList.add('show');

  // Confetti if user beat at least one algorithm
  if(userWon) setTimeout(()=>launchConfetti(), 400);
}

function closeFeedback(){
  const fb=document.getElementById('feedback');
  if(fb) fb.classList.remove('show');
}

/* ===========================
 * 9) Animation engine
 * =========================== */
let _anim={handle:null,running:false};
function stopAnimation(){
  if(_anim.handle) clearTimeout(_anim.handle);
  _anim={handle:null,running:false};
}
function animateLoop({stepFn,onFrame,onEnd,delay=180}){
  stopAnimation(); _anim.running=true;
  function tick(){
    if(!_anim.running) return;
    const s=stepFn();
    if(!s){stopAnimation();onEnd?.();return;}
    onFrame?.(s);
    if(s.done){stopAnimation();onEnd?.(s);}
    else{_anim.handle=setTimeout(tick,delay);}
  }
  tick();
}

/* ===========================
 * 10) Load level
 * =========================== */
async function loadLevel(name){
  const url=new URL(`levels/${name}.json`,window.location.href);
  try{
    const res=await fetch(url.toString(),{cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    level=await res.json();
  }catch(e){
    alert(window.location.protocol==='file:'?'Apri con Live Server.':`Errore: ${e.message}`);
    return;
  }
  resizeCanvasToDisplaySize();
  nodes=buildNodesFromLevel(level);
  // weights
  if(Array.isArray(level.edges)&&level.edges.length){
    const map=new Map();
    for(const e of level.edges){
      const w=Math.hypot(nodes[e.u].x-nodes[e.v].x, nodes[e.u].y-nodes[e.v].y);
      map.set(`${e.u}-${e.v}`,w); map.set(`${e.v}-${e.u}`,w);
    }
    weight=(u,v)=>map.has(`${u}-${v}`)?map.get(`${u}-${v}`):Infinity;
  } else {
    weight=(u,v)=>Math.hypot(nodes[u].x-nodes[v].x, nodes[u].y-nodes[v].y);
  }
  labels=makeLabels(LABEL_MODE,nodes.length,level?.labels);
  if(LABEL_MODE==='letters'&&SHUFFLE_LABELS) shuffle(labels);
  resetTour();
  updateExactButtons();
  // start timer
  if(level.timeLimitSec) startTimer(level.timeLimitSec);
  draw(); updateLegend();
}

function buildNodesFromLevel(lv){
  if(Array.isArray(lv.nodes)&&lv.nodes.length&&!lv.layout) return lv.nodes.map(n=>({...n}));
  const n=Number.isInteger(lv.n)?lv.n:(Array.isArray(lv.nodes)?lv.nodes.length:0);
  const layout=(lv.layout||'uniform').toLowerCase();
  const seed=Number.isInteger(lv.seed)?lv.seed:123;
  if(n<=0) return [];
  if(layout==='random') return randomNodes(n);
  return sunflowerNodes(n,seed);
}

function sunflowerNodes(n,seed){
  const rng=mulberry32(seed);
  const m=36,W=canvas.width-2*m,H=canvas.height-2*m;
  const g=(Math.sqrt(5)-1)/2, pts=[];
  for(let i=0;i<n;i++){
    const t=(i+0.5)/n, r=Math.sqrt(t), theta=2*Math.PI*g*i;
    let x=(W/2)+(W/2-12)*r*Math.cos(theta), y=(H/2)+(H/2-12)*r*Math.sin(theta);
    x+=(rng()-0.5)*14; y+=(rng()-0.5)*14;
    pts.push({id:i, x:x+m, y:y+m});
  }
  return pts;
}

function randomNodes(n){
  const m=36,W=canvas.width-2*m,H=canvas.height-2*m;
  const area=W*H, base=Math.sqrt(area/Math.max(1,n));
  let minDist=0.55*base, floor=12, maxTries=4000, pts=[], tries=0;
  while(pts.length<n&&tries<maxTries){
    const x=m+Math.random()*W, y=m+Math.random()*H;
    let ok=true;
    for(const p of pts){if(Math.hypot(x-p.x,y-p.y)<minDist){ok=false;break;}}
    if(ok) pts.push({id:pts.length,x,y});
    else{tries++;if(tries%800===0&&minDist>floor) minDist=Math.max(minDist*0.92,floor);}
  }
  if(pts.length<n){
    const rest=sunflowerNodes(n-pts.length,Math.floor(Math.random()*1e9));
    for(const p of rest) pts.push({id:pts.length,x:p.x,y:p.y});
  }
  for(let i=0;i<pts.length;i++) pts[i].id=i;
  return pts;
}

function mulberry32(a){
  return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return((t^t>>>14)>>>0)/4294967296; };
}

/* ===========================
 * 11) User interaction
 * =========================== */
function resetTour(){
  stopAnimation(); stopTimer();
  tour=[]; used=new Set(); hoverId=-1;
  resetAlgoState();
  refreshHUD(); refreshButtonStates();
  const box=document.getElementById('algoInfo');
  if(box){box.classList.remove('show');box.innerHTML='';}
  const fb=document.getElementById('feedback');
  if(fb) fb.classList.remove('show');
  if(level?.timeLimitSec) startTimer(level.timeLimitSec);
  draw(); updateLegend();
}

function undoLast(){
  if(!tour.length) return;
  const last=tour.pop();
  used.delete(last);
  refreshHUD(); draw();
  // hide feedback if was showing
  const fb=document.getElementById('feedback');
  if(fb) fb.classList.remove('show');
}

function onMove(ev){
  if(!level) return;
  const rect=canvas.getBoundingClientRect();
  const x=(ev.clientX-rect.left)*(canvas.width/rect.width);
  const y=(ev.clientY-rect.top)*(canvas.height/rect.height);
  hoverId=nearestNodeAt(x,y);
  draw();
}

function onClick(ev){
  if(!level) return;
  const rect=canvas.getBoundingClientRect();
  const x=(ev.clientX-rect.left)*(canvas.width/rect.width);
  const y=(ev.clientY-rect.top)*(canvas.height/rect.height);
  const id=nearestNodeAt(x,y);
  if(id===-1) return;

  if(used.has(id)){
    // undo if it's the last one
    if(tour.length&&tour[tour.length-1]===id){ used.delete(id); tour.pop(); }
  } else {
    used.add(id); tour.push(id);
  }
  refreshHUD(); draw();

  // Check if tour complete
  if(tour.length===nodes.length && Number.isFinite(weight(tour[tour.length-1],tour[0]))){
    stopTimer();
    startTraveller(tour, userColor(), '🚐');
    showFeedback();
  }
}

function nearestNodeAt(x,y,radius){
  const r=radius??nodeRadius()*2.2;
  let best=-1, bestD=r;
  for(const n of nodes){ const d=Math.hypot(x-n.x,y-n.y); if(d<bestD){best=n.id;bestD=d;} }
  return best;
}

/* ===========================
 * 12) Drawing
 * =========================== */
// Theme-aware canvas colors
function isLight(){ return document.documentElement.getAttribute('data-theme')==='light'; }
function C(dark,light){ return isLight()?light:dark; }
function strokeFor(style){ return isLight() ? (style.lightStroke || style.stroke) : style.stroke; }

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // grid
  ctx.globalAlpha=0.12;
  const gridColor = C('#1A1834','#D5D0C4');
  for(let x=50;x<canvas.width;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.strokeStyle=gridColor;ctx.lineWidth=1;ctx.stroke();}
  for(let y=50;y<canvas.height;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.strokeStyle=gridColor;ctx.lineWidth=1;ctx.stroke();}
  ctx.globalAlpha=1;

  // faint edges
  drawFaintEdges();

  // pheromone layer (ACO)
  if(acoPheromone && visibility.aco) drawPheromone();

  // algo tours
  ALGO_KEYS.forEach(k=>{
    if(algoTours[k]&&visibility[k]) drawTourWithStyle(algoTours[k],STYLES[k]);
  });

  // user tour
  if(tour.length>1){
    ctx.lineWidth=3; ctx.setLineDash([]); ctx.strokeStyle=userColor();
    pathLine(tour); ctx.stroke();
  }

  // nodes
  const r=nodeRadius();
  const startId=level?.start??0;
  const nodeDefault = C('#E6EBFF','#1C1917');
  const nodeVisited = C('#4ECDC4','#0D9488');
  const nodeBorder  = C('#2A2545','#D5D0C4');
  const startBorder = C('#FFE66D','#A16207');
  for(const n of nodes){
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle = used.has(n.id)?nodeVisited:nodeDefault; ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle=(n.id===startId)?startBorder:nodeBorder; ctx.stroke();
    if(n.id===startId) drawStartBadge(n.x,n.y-r-10,tr('ui.start'));
    if(showLabels&&n.id!==startId) drawSmallLabel(n.x+r+4,n.y-r-2,labels[n.id]);
  }

  // hover tooltip
  if(hoverId!==-1){
    const n=nodes[hoverId]; const text=showLabels?labels[hoverId]:'•';
    ctx.font='12px system-ui'; const w=ctx.measureText(text).width+10;
    const tipBg = C('rgba(13,11,26,0.92)','rgba(255,255,255,0.95)');
    const tipBorder = C('#2A2545','#D5D0C4');
    const tipText = C('#E6EBFF','#1C1917');
    ctx.fillStyle=tipBg; ctx.fillRect(n.x+12,n.y-28,w,18);
    ctx.strokeStyle=tipBorder; ctx.lineWidth=1; ctx.strokeRect(n.x+12,n.y-28,w,18);
    ctx.fillStyle=tipText; ctx.fillText(text,n.x+17,n.y-15);
  }

  // Animation progress bar
  if(animProgress) drawProgressBar();
}

function drawProgressBar(){
  const p = animProgress;
  if(!p) return;
  ctx.save();

  const W = canvas.width;
  const barH = 28;
  const barY = canvas.height - barH;
  const margin = 20;
  const barW = W - margin*2;
  const radius = 8;

  // Background bar (frosted effect)
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = C('rgba(13,11,26,0.8)','rgba(255,255,255,0.8)');
  roundRect(ctx, margin, barY, barW, barH, radius);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Filled portion
  const fillW = Math.max(0, Math.min(barW * p.progress, barW));
  if(fillW > 0){
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, margin, barY, barW, barH, radius);
    ctx.clip();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = p.color;
    ctx.fillRect(margin, barY, fillW, barH);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Border
  ctx.strokeStyle = C('rgba(255,255,255,0.1)','rgba(0,0,0,0.1)');
  ctx.lineWidth = 1;
  roundRect(ctx, margin, barY, barW, barH, radius);
  ctx.stroke();

  // Text label
  const dpr = window.devicePixelRatio || 1;
  const fontSize = Math.max(10, Math.min(13, 12*dpr)) ;
  ctx.font = `600 ${fontSize}px 'DM Sans', system-ui`;
  ctx.fillStyle = p.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textY = barY + barH/2;
  ctx.fillText(p.label, margin + 10, textY);

  // Progress percentage on right
  const pctText = `${Math.round(p.progress*100)}%`;
  ctx.textAlign = 'right';
  ctx.fillStyle = C('#CDD7F3','#3D3833');
  ctx.fillText(p.detail || pctText, margin + barW - 10, textY);

  ctx.restore();
}

function drawFaintEdges(){
  if(!nodes||nodes.length<2) return;
  ctx.save();
  ctx.strokeStyle=C('rgba(230,235,255,0.04)','rgba(28,25,23,0.08)'); ctx.lineWidth=1; ctx.setLineDash([]);
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      if(!Number.isFinite(weight(nodes[i].id,nodes[j].id))) continue;
      ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPheromone(){
  if(!acoPheromone||!nodes.length) return;
  const N=nodes.length;
  // find max pheromone for normalization
  let maxTau=0;
  for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){
    const v=acoPheromone[i][j];
    if(v>maxTau) maxTau=v;
  }
  if(maxTau<=0) return;
  ctx.save();
  for(let i=0;i<N;i++){
    for(let j=i+1;j<N;j++){
      const norm=acoPheromone[i][j]/maxTau;
      if(norm<0.05) continue;
      ctx.globalAlpha=norm*0.5;
      ctx.strokeStyle='#FF6B6B';
      ctx.lineWidth=1+norm*4;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke();
    }
  }
  ctx.restore();
}

function pathLine(p){
  if(!p.length) return;
  ctx.beginPath();
  ctx.moveTo(nodes[p[0]].x,nodes[p[0]].y);
  for(let i=1;i<p.length;i++) ctx.lineTo(nodes[p[i]].x,nodes[p[i]].y);
  if(p.length>=nodes.length&&Number.isFinite(weight(p[p.length-1],p[0])))
    ctx.lineTo(nodes[p[0]].x,nodes[p[0]].y);
}

function drawTourWithStyle(p,style){
  if(!p||p.length<2) return;
  const color = strokeFor(style);
  ctx.lineWidth=2; ctx.strokeStyle=color; ctx.setLineDash(style.dash||[]);
  pathLine(p); ctx.stroke(); ctx.setLineDash([]);
  for(const id of p){ const n=nodes[id]; drawMarker(n.x,n.y,style.marker,color); }
}

function drawMarker(x,y,kind,color){
  ctx.save(); ctx.translate(x,y); ctx.strokeStyle=color; ctx.fillStyle=color;
  switch(kind){
    case 'square':  ctx.lineWidth=1.5; ctx.strokeRect(-4,-4,8,8); break;
    case 'circle':  ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill(); break;
    case 'triangle':ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(5,4); ctx.lineTo(-5,4); ctx.closePath(); ctx.fill(); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(5,0); ctx.lineTo(0,5); ctx.lineTo(-5,0); ctx.closePath(); ctx.fill(); break;
    case 'cross':   ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.moveTo(0,-5); ctx.lineTo(0,5); ctx.stroke(); break;
  }
  ctx.restore();
}

function drawSmallLabel(x,y,text){
  if(!text) return;
  ctx.save(); ctx.font=LABEL_FONT; const pad=3,h=16,w=ctx.measureText(text).width+pad*2;
  ctx.fillStyle=C('rgba(13,11,26,0.88)','rgba(255,255,255,0.92)'); ctx.fillRect(x-2,y-12,w,h);
  ctx.strokeStyle=C('#2A2545','#D5D0C4'); ctx.lineWidth=1; ctx.strokeRect(x-2,y-12,w,h);
  ctx.fillStyle=C('#CDD7F3','#3D3833'); ctx.fillText(text,x+pad-2,y+1);
  ctx.restore();
}

function drawStartBadge(x,y,text){
  ctx.save(); ctx.font=START_LABEL_FONT; const padX=6,h=18,w=ctx.measureText(text).width+padX*2;
  roundRect(ctx,x-w/2,y-h/2,w,h,9);
  ctx.fillStyle=C('#FFE66D','#FCD34D'); ctx.fill();
  ctx.strokeStyle=C('#9B8520','#92400E'); ctx.lineWidth=1.2; ctx.stroke();
  ctx.fillStyle=C('#1A1834','#451A03'); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,x,y);
  ctx.restore();
}

function roundRect(c,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  c.beginPath(); c.moveTo(x+rr,y);
  c.arcTo(x+w,y,x+w,y+h,rr); c.arcTo(x+w,y+h,x,y+h,rr);
  c.arcTo(x,y+h,x,y,rr); c.arcTo(x,y,x+w,y,rr); c.closePath();
}

/* ===========================
 * 13) Legend (toggleable)
 * =========================== */
function updateLegend(){
  const legend=document.getElementById('legend'); if(!legend) return;
  const chip=(key,label,style,dashClass='')=>{
    const on=visibility[key]?'on':'';
    return `<span class="legend-chip ${on}" data-legend="${key}" style="color:${strokeFor(style)}">
      <span class="legend-line ${dashClass}"></span> ${label}
    </span>`;
  };
  legend.innerHTML = [
    chip('nn','NN',STYLES.nn,'legend-dash-long'),
    chip('sa','SA',STYLES.sa,'legend-dash-long'),
    chip('aco','ACO',STYLES.aco,'legend-dash-short'),
    chip('bf','BF',STYLES.bf,'legend-dash-short'),
    chip('ga','GA',STYLES.ga,'legend-dash-long'),
    `<span class="legend-chip on" style="color:${userColor()}"><span class="legend-line"></span> ${tr('ui.you')}</span>`
  ].join('');

  // click to toggle visibility
  legend.querySelectorAll('[data-legend]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const k=el.dataset.legend;
      if(!algoTours[k]) return; // nothing computed
      visibility[k]=!visibility[k];
      refreshButtonStates();
      updateLegend();
      draw();
    });
  });
}

/* ===========================
 * 14) Core algorithms
 * =========================== */

// --- Nearest Neighbor ---
function nn(start){
  const N=nodes.length, seen=new Array(N).fill(false);
  let t=[start]; seen[start]=true;
  for(let k=1;k<N;k++){
    const u=t[t.length-1]; let best=-1,bestW=Infinity;
    for(let v=0;v<N;v++){
      if(seen[v]) continue; const w=weight(u,v);
      if(Number.isFinite(w)&&w<bestW){bestW=w;best=v;}
    }
    if(best===-1) return null; t.push(best); seen[best]=true;
  }
  if(!Number.isFinite(weight(t[N-1],t[0]))) return null;
  return t;
}

// --- 2-Opt ---
function twoOpt(t,maxPass=6){
  if(!t) return null;
  const N=t.length; let improved=true,pass=0;
  while(improved&&pass++<maxPass){
    improved=false;
    for(let i=0;i<N-3;i++){
      for(let j=i+2;j<N-1;j++){
        const a=t[i],b=t[i+1],c=t[j],d=t[j+1];
        if(!Number.isFinite(weight(a,c))||!Number.isFinite(weight(b,d))) continue;
        if((weight(a,c)+weight(b,d))-(weight(a,b)+weight(c,d))<-1e-9){
          t=t.slice(0,i+1).concat(t.slice(i+1,j+1).reverse(),t.slice(j+1));
          improved=true;
        }
      }
    }
  }
  return Number.isFinite(weight(t[N-1],t[0]))?t:null;
}

// --- Held-Karp ---
function heldKarpExact(){
  const N=nodes.length, start=level?.start??0;
  const V=[...Array(N).keys()].filter(i=>i!==start);
  const idx=new Map(); V.forEach((v,k)=>idx.set(v,k));
  const S=1<<V.length;
  const DP=Array.from({length:S},()=>Array(N).fill(Infinity));
  const parent=Array.from({length:S},()=>Array(N).fill(-1));
  for(const j of V){const m=1<<idx.get(j);const w=weight(start,j);if(Number.isFinite(w)){DP[m][j]=w;parent[m][j]=start;}}
  for(let m=1;m<S;m++){
    for(const j of V){
      const jb=1<<idx.get(j);if(!(m&jb))continue;
      const pm=m^jb;if(!pm)continue;
      for(const k of V){
        const kb=1<<idx.get(k);if(!(pm&kb))continue;
        const w=weight(k,j);if(!Number.isFinite(w))continue;
        const c=DP[pm][k]+w;if(c<DP[m][j]){DP[m][j]=c;parent[m][j]=k;}
      }
    }
  }
  let best=Infinity,last=-1;const FULL=S-1;
  for(const j of V){const w=weight(j,start);if(Number.isFinite(w)){const c=DP[FULL][j]+w;if(c<best){best=c;last=j;}}}
  if(!Number.isFinite(best)) return null;
  const res=[start];let mask=FULL,cur=last,stack=[];
  while(cur!==start&&cur!==-1){stack.push(cur);const jb=1<<idx.get(cur);const prev=parent[mask][cur];mask^=jb;cur=prev;}
  stack.reverse().forEach(v=>res.push(v));
  return res;
}

// --- Brute Force ---
function bruteForceExact(){
  const N=nodes.length,start=level?.start??0;
  const rest=[...Array(N).keys()].filter(i=>i!==start);
  let bestTour=null,best=Infinity;
  function perm(a,l){
    if(l===a.length){
      const t=[start,...a];
      if(!Number.isFinite(weight(t[t.length-1],start)))return;
      const L=tourLength(t);
      if(Number.isFinite(L)&&L<best){best=L;bestTour=t.slice();}
      return;
    }
    for(let i=l;i<a.length;i++){[a[l],a[i]]=[a[i],a[l]];perm(a,l+1);[a[l],a[i]]=[a[i],a[l]];}
  }
  perm(rest,0);
  return bestTour;
}

// --- Simulated Annealing (animated) ---
function saCreateStepper({T0=100, Tmin=0.01, alpha=0.995, itersPerTemp=20}){
  const N=nodes.length, start=level?.start??0;
  // seed with NN
  let current=nn(start);
  if(!current) current=[...Array(N).keys()];
  let currentLen=tourLength(current);
  let bestTour=[...current], bestLen=currentLen;
  let T=T0, step=0, maxSteps=600;

  function doStep(){
    if(T<Tmin||step>=maxSteps) return {done:true, step, bestTour, bestLen, T};
    for(let i=0;i<itersPerTemp;i++){
      // generate neighbor by reversing a random segment (keep start fixed)
      let a=1+Math.floor(Math.random()*(N-2));
      let b=a+1+Math.floor(Math.random()*(N-a));
      if(b>=N) b=N-1;
      const neighbor=current.slice(0,a).concat(current.slice(a,b+1).reverse(),current.slice(b+1));
      if(!Number.isFinite(weight(neighbor[N-1],neighbor[0]))) continue;
      const nLen=tourLength(neighbor);
      const delta=nLen-currentLen;
      if(delta<0||Math.random()<Math.exp(-delta/T)){
        current=neighbor; currentLen=nLen;
        if(currentLen<bestLen){bestLen=currentLen;bestTour=[...current];}
      }
    }
    T*=alpha;
    step++;
    return {done:false, step, bestTour, bestLen, T};
  }
  return {step:doStep};
}

// --- ACO (animated, with pheromone export) ---
function acoCreateStepper({alpha=1.0,beta=3.0,rho=0.5,ants=30,iters=50,candidateK=6}){
  const N=nodes.length;
  const D=Array.from({length:N},()=>Array(N).fill(Infinity));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){if(i!==j){const w=weight(i,j);D[i][j]=Number.isFinite(w)?w:Infinity;}}
  const candidates=Array.from({length:N},(_,u)=>{
    const list=[];for(let v=0;v<N;v++)if(Number.isFinite(D[u][v]))list.push([v,D[u][v]]);
    list.sort((a,b)=>a[1]-b[1]);return list.slice(0,Math.min(candidateK,list.length)).map(e=>e[0]);
  });
  let s=0,c=0;for(let i=0;i<N;i++)for(let j=0;j<N;j++){if(Number.isFinite(D[i][j])){s+=D[i][j];c++;}}
  const tau0=1/(N*(s/(c||1)));
  const tau=Array.from({length:N},()=>Array(N).fill(tau0));
  let bestTour=null,bestLen=Infinity,iter=0;

  function step(){
    if(iter>=iters) return {done:true,iter,bestTour,bestLen};
    const tours=[];
    for(let k=0;k<ants;k++){
      const st=level?.start??Math.floor(Math.random()*N);
      const t=build(st);
      if(t){const L=tourLength(t);if(Number.isFinite(L)){tours.push({tour:t,L});if(L<bestLen){bestLen=L;bestTour=t;}}}
    }
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){tau[i][j]*=(1-rho);if(tau[i][j]<1e-12)tau[i][j]=1e-12;}
    for(const{tour:t,L}of tours){
      const dep=1/L;
      for(let i=0;i<t.length;i++){const u=t[i],v=t[(i+1)%t.length];if(Number.isFinite(D[u][v])){tau[u][v]+=dep;tau[v][u]+=dep;}}
    }
    acoPheromone=tau; // export for visualization
    iter++;
    return {done:false,iter,bestTour,bestLen};
  }
  function build(st){
    const vis=new Array(N).fill(false);const t=[st];vis[st]=true;let u=st;
    for(let s=1;s<N;s++){const v=pick(u,vis);if(v===-1)return null;t.push(v);vis[v]=true;u=v;}
    if(!Number.isFinite(D[t[N-1]][t[0]]))return null;return t;
  }
  function pick(u,vis){
    let choices=[];
    for(const v of candidates[u]){if(!vis[v]&&Number.isFinite(D[u][v])){const p=Math.pow(tau[u][v],alpha)*Math.pow(1/D[u][v],beta);if(p>0)choices.push([v,p]);}}
    if(!choices.length){for(let v=0;v<N;v++){if(!vis[v]&&Number.isFinite(D[u][v])){const p=Math.pow(tau[u][v],alpha)*Math.pow(1/D[u][v],beta);if(p>0)choices.push([v,p]);}}if(!choices.length)return -1;}
    const sum=choices.reduce((a,b)=>a+b[1],0);let r=Math.random()*sum;
    for(const[v,p]of choices){r-=p;if(r<=0)return v;}
    return choices[choices.length-1][0];
  }
  return {step};
}

// --- Genetic Algorithm (animated) ---
function gaCreateStepper({pop=50,gens=60,pmut=0.25,tournament=6}){
  const N=nodes.length,start=level?.start??0;
  if(N<3) return {step:()=>({done:true,gen:0,bestTour:null,bestLen:Infinity})};
  const valid=t=>Number.isFinite(weight(t[t.length-1],t[0]));
  const seed=nn(start)||[...Array(N).keys()];
  const base=seed[0]===start?seed:[start,...seed.filter(x=>x!==start)];
  function rndTour(){
    const arr=base.slice(1);for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
    const t=[start,...arr];return valid(t)?t:null;
  }
  let popu=[];while(popu.length<pop){const t=rndTour();if(t)popu.push(t);}
  function selectParent(){let b=null,bL=Infinity;for(let i=0;i<tournament;i++){const c=popu[Math.floor(Math.random()*popu.length)];const L=tourLength(c);if(L<bL){bL=L;b=c;}}return b;}
  function crossover(p1,p2){
    const a=p1.slice(1),b=p2.slice(1),n=a.length;
    const i=Math.floor(Math.random()*n),j=Math.floor(Math.random()*n);
    const lo=Math.min(i,j),hi=Math.max(i,j);
    const child=new Array(n).fill(-1);
    for(let k=lo;k<=hi;k++)child[k]=a[k];
    let idx=0;for(let k=0;k<n;k++){const gene=b[k];if(!child.includes(gene)){while(child[idx]!==-1)idx++;child[idx]=gene;}}
    const t=[start,...child];return valid(t)?t:null;
  }
  function mutate(t){
    if(Math.random()>pmut)return t;
    let i=1+Math.floor(Math.random()*(t.length-3));
    let j=i+1+Math.floor(Math.random()*(t.length-1-i));
    const c=t.slice(0,i).concat(t.slice(i,j).reverse(),t.slice(j));
    return valid(c)?c:t;
  }
  let gen=0,bestTour=null,bestLen=Infinity;
  function step(){
    if(gen>=gens) return {done:true,gen,bestTour,bestLen};
    popu.sort((u,v)=>tourLength(u)-tourLength(v));
    if(Number.isFinite(tourLength(popu[0]))&&tourLength(popu[0])<bestLen){bestLen=tourLength(popu[0]);bestTour=popu[0];}
    const elite=popu.slice(0,Math.max(2,Math.floor(pop*0.12)));
    const next=[...elite];
    while(next.length<pop){const p1=selectParent(),p2=selectParent();let child=crossover(p1,p2)||rndTour();child=mutate(child);next.push(child);}
    popu=next; gen++;
    return {done:false,gen,bestTour,bestLen};
  }
  return {step};
}

/* ===========================
 * 15) Run algorithm (unified dispatcher)
 * =========================== */
function runAlgo(key){
  // Toggle: if already active and computed, just toggle visibility
  if(algoTours[key]){
    visibility[key]=!visibility[key];
    refreshButtonStates(); updateLegend(); draw();
    if(visibility[key]) showAlgoInfo(key, `<small>${tr('ui.length')}: <strong>${scores[key]}</strong></small>`);
    return;
  }

  // Compute
  switch(key){
    case 'bf': runBruteForce(); break;
    case 'nn': runNearestNeighbor(); break;
    case 'sa': runSimulatedAnnealing(); break;
    case 'aco': runACO(); break;
    case 'ga': runGA(); break;
  }
}

function runBruteForce(){
  const bf=bruteForceExact();
  if(bf){
    algoTours.bf=bf; visibility.bf=true;
    updateScore('bf',tourLength(bf).toFixed(1));
    refreshButtonStates(); draw(); updateLegend();
    showAlgoInfo('bf',`<small>${tr('ui.length')} ${tr('ui.optimal')}: <strong>${tourLength(bf).toFixed(1)}</strong></small>`);
    startTraveller(bf, STYLES.bf.stroke, '🔍');
    showFeedback();
  } else { alert(tr('alerts.bfNotFound')); }
}

function runHeldKarp(){
  const hk=heldKarpExact();
  if(hk){
    algoTours.hk=hk; visibility.hk=true;
    updateScore('hk',tourLength(hk).toFixed(1));
    refreshButtonStates(); draw(); updateLegend();
    showAlgoInfo('hk',`<small>${tr('ui.length')} ${tr('ui.optimal')}: <strong>${tourLength(hk).toFixed(1)}</strong></small>`);
    startTraveller(hk, STYLES.hk.stroke, '🧮');
    showFeedback();
  } else { alert(tr('alerts.hkNotFound')); }
}

function runNearestNeighbor(){
  const base=nn(level?.start??0);
  algoTours.nn=base; visibility.nn=true;
  updateScore('nn',base?tourLength(base).toFixed(1):'n/d');
  refreshButtonStates(); draw(); updateLegend();
  showAlgoInfo('nn',base?`<small>${tr('ui.length')}: <strong>${tourLength(base).toFixed(1)}</strong></small>`:'');
  if(base) startTraveller(base, STYLES.nn.stroke, '👀');
  showFeedback();
}

function run2OptLinked(){
  // Always runs NN first, then improves with 2-Opt
  let seed=nn(level?.start??0);
  if(!seed){ alert('NN failed'); return; }
  // also store NN result
  if(!algoTours.nn){
    algoTours.nn=seed; visibility.nn=true;
    updateScore('nn',tourLength(seed).toFixed(1));
  }
  const improved=twoOpt([...seed],6);
  algoTours.twoopt=improved; visibility.twoopt=true;
  updateScore('twoopt',improved?tourLength(improved).toFixed(1):'n/d');
  refreshButtonStates(); draw(); updateLegend();
  const nnLen=tourLength(seed).toFixed(1);
  const optLen=improved?tourLength(improved).toFixed(1):'n/d';
  showAlgoInfo('twoopt',`<small>NN: ${nnLen} → 2-Opt: <strong>${optLen}</strong></small>`);
  if(improved) startTraveller(improved, STYLES.twoopt.stroke, '✂️');
  showFeedback();
}

function runSimulatedAnnealing(){
  visibility.sa=true;
  refreshButtonStates();
  const maxSteps=600;
  const stepper=saCreateStepper({T0:100,Tmin:0.01,alpha:0.995,itersPerTemp:20});
  animateLoop({
    delay:30,
    stepFn:stepper.step,
    onFrame:({step,bestTour,bestLen,T})=>{
      animProgress={
        label:'Simulated Annealing',
        progress:step/maxSteps,
        color:STYLES.sa.stroke,
        detail:`T:${T?.toFixed(1)??'–'} · best:${Number.isFinite(bestLen)?bestLen.toFixed(0):'–'}`
      };
      if(bestTour){
        algoTours.sa=bestTour;
        updateScore('sa',Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d');
        draw();
      }
      showAlgoInfo('sa',`<small>${tr('ui.temperature')}: <strong>${T?.toFixed(2)??'–'}</strong> · ${tr('ui.best')}: <strong>${Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d'}</strong></small>`);
    },
    onEnd:()=>{ animProgress=null; draw(); updateLegend(); if(algoTours.sa) startTraveller(algoTours.sa, STYLES.sa.stroke, '🌡️'); showFeedback(); }
  });
}

function runACO(){
  visibility.aco=true;
  refreshButtonStates();
  acoPheromone=null;
  const totalIters=50;
  const stepper=acoCreateStepper({alpha:1.0,beta:3.0,rho:0.5,ants:30,iters:totalIters,candidateK:6});
  animateLoop({
    delay:180,
    stepFn:stepper.step,
    onFrame:({iter,bestTour,bestLen})=>{
      animProgress={
        label:'Ant Colony (ACO)',
        progress:iter/totalIters,
        color:STYLES.aco.stroke,
        detail:`iter ${iter}/${totalIters} · best:${Number.isFinite(bestLen)?bestLen.toFixed(0):'–'}`
      };
      if(bestTour){
        algoTours.aco=bestTour;
        updateScore('aco',Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d');
        draw();
      }
      showAlgoInfo('aco',`<small>${tr('ui.iteration')}: <strong>${iter}</strong> · ${tr('ui.best')}: <strong>${Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d'}</strong></small>`);
    },
    onEnd:()=>{ animProgress=null; draw(); updateLegend(); if(algoTours.aco) startTraveller(algoTours.aco, STYLES.aco.stroke, '🐜'); showFeedback(); }
  });
}

function runGA(){
  visibility.ga=true;
  refreshButtonStates();
  const totalGens=60;
  const stepper=gaCreateStepper({pop:50,gens:totalGens,pmut:0.25,tournament:6});
  animateLoop({
    delay:160,
    stepFn:stepper.step,
    onFrame:({gen,bestTour,bestLen})=>{
      animProgress={
        label:'Genetic Algorithm',
        progress:gen/totalGens,
        color:STYLES.ga.stroke,
        detail:`gen ${gen}/${totalGens} · best:${Number.isFinite(bestLen)?bestLen.toFixed(0):'–'}`
      };
      if(bestTour){
        algoTours.ga=bestTour;
        updateScore('ga',Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d');
        draw();
      }
      showAlgoInfo('ga',`<small>${tr('ui.generation')}: <strong>${gen}</strong> · ${tr('ui.best')}: <strong>${Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d'}</strong></small>`);
    },
    onEnd:()=>{ animProgress=null; draw(); updateLegend(); if(algoTours.ga) startTraveller(algoTours.ga, STYLES.ga.stroke, '🧬'); showFeedback(); }
  });
}

/* ===========================
 * 16) Traveller animation
 * =========================== */
function startTraveller(path, color, emoji='🚐'){
  stopTraveller();
  if(!path||path.length<2) return;
  // Build closed path with segments
  const closedPath = [...path, path[0]]; // close the loop
  const segments = [];
  let totalDist = 0;
  for(let i=0;i<closedPath.length-1;i++){
    const a=nodes[closedPath[i]], b=nodes[closedPath[i+1]];
    const d=Math.hypot(b.x-a.x, b.y-a.y);
    segments.push({from:a, to:b, dist:d, cumDist:totalDist});
    totalDist+=d;
  }

  traveller = {
    segments, totalDist, color, emoji,
    t:0,              // 0→1 progress along entire path
    trail:[],         // trail points [{x,y,age}]
    speed: 0.001     // fraction of total path per frame
  };

  function tick(){
    if(!traveller) return;
    traveller.t += traveller.speed;
    if(traveller.t >= 1){
      traveller.t = 1;
      draw(); drawTravellerOverlay();
      // finished — leave it for a moment then clear
      setTimeout(()=>{ stopTraveller(); draw(); }, 600);
      return;
    }
    draw();
    drawTravellerOverlay();
    travellerRAF = requestAnimationFrame(tick);
  }
  travellerRAF = requestAnimationFrame(tick);
}

function stopTraveller(){
  if(travellerRAF) cancelAnimationFrame(travellerRAF);
  travellerRAF=null;
  traveller=null;
}

function getTravellerPos(){
  if(!traveller) return null;
  const {segments, totalDist, t} = traveller;
  const targetDist = t * totalDist;
  for(const seg of segments){
    if(targetDist <= seg.cumDist + seg.dist){
      const localT = (targetDist - seg.cumDist) / seg.dist;
      return {
        x: seg.from.x + (seg.to.x - seg.from.x) * localT,
        y: seg.from.y + (seg.to.y - seg.from.y) * localT
      };
    }
  }
  const last = segments[segments.length-1];
  return {x:last.to.x, y:last.to.y};
}

function drawTravellerOverlay(){
  if(!traveller) return;
  const pos = getTravellerPos();
  if(!pos) return;

  // Add to trail
  traveller.trail.push({x:pos.x, y:pos.y, age:0});
  // Age and prune trail
  traveller.trail = traveller.trail.filter(p=>{ p.age++; return p.age<30; });

  ctx.save();

  // Draw trail
  for(const p of traveller.trail){
    const alpha = 1 - p.age/30;
    const r = 3 * alpha;
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = traveller.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Draw traveller (circle with glow)
  const R = nodeRadius() + 4;

  // Glow
  ctx.shadowColor = traveller.color;
  ctx.shadowBlur = 15;
  ctx.fillStyle = traveller.color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, R, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Inner white circle
  ctx.fillStyle = C('#0D0B1A','#FFFFFF');
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, R-3, 0, Math.PI*2);
  ctx.fill();

  // Emoji
  const fontSize = Math.max(14, R*1.5);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(traveller.emoji, pos.x, pos.y);

  ctx.restore();
}

/* ===========================
 * 17) Confetti system
 * =========================== */
function launchConfetti(){
  stopConfetti();
  const colors = ['#FF6B6B','#4ECDC4','#FFE66D','#A78BFA','#FF4081','#F97316'];
  const W=canvas.width, H=canvas.height;
  confetti=[];
  for(let i=0;i<80;i++){
    confetti.push({
      x: W*0.3 + Math.random()*W*0.4,
      y: H*0.5,
      vx: (Math.random()-0.5)*12,
      vy: -Math.random()*14 - 4,
      size: 3+Math.random()*5,
      color: colors[Math.floor(Math.random()*colors.length)],
      rot: Math.random()*Math.PI*2,
      rotV: (Math.random()-0.5)*0.3,
      life: 1.0
    });
  }

  function tick(){
    if(!confetti.length){ stopConfetti(); return; }
    // Update particles
    confetti = confetti.filter(p=>{
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      p.vx *= 0.99;
      p.rot += p.rotV;
      p.life -= 0.012;
      return p.life > 0 && p.y < H+20;
    });
    // Draw on top
    draw();
    drawConfettiOverlay();
    if(confetti.length) confettiRAF = requestAnimationFrame(tick);
  }
  confettiRAF = requestAnimationFrame(tick);
}

function stopConfetti(){
  if(confettiRAF) cancelAnimationFrame(confettiRAF);
  confettiRAF=null;
  confetti=[];
}

function drawConfettiOverlay(){
  if(!confetti.length) return;
  ctx.save();
  for(const p of confetti){
    ctx.globalAlpha = Math.max(0,p.life);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ===========================
 * 18) Boot
 * =========================== */
loadLevel('10');
resizeCanvasToDisplaySize();
draw();
