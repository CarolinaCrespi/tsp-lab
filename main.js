// =======================================
// TSP Lab - main.js (pulito, senza dark/light, con i18n)
// =======================================

/* ===========================
 * 0) Hook elementi DOM
 * =========================== */
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const hud    = document.getElementById('hud');
const sel    = document.getElementById('levelSelect');

/* ===========================
 * 1) i18n minimo (IT/EN)
 *    Usa <html lang="it|en"> impostato dalla pagina
 * =========================== */
const I18N = {
  it: {
    ui: {
      you: "Tu",
      you_partial: "Tu (parziale)",
      start: "Partenza",
      length: "lunghezza",
      best: "migliore",
      iteration: "iterazione",
      generation: "generazione",
      optimal: "(ottimo)"
    },
    alerts: {
      closeIncomplete: "Devi visitare tutte le città prima di chiudere il ciclo.",
      closeForbidden:  "La strada per tornare alla partenza è chiusa in questo livello.",
      needSeed2opt:    "2-Opt richiede un tour iniziale (il tuo tour completo o NN).",
      hkHeavy:         "Held-Karp è pesante: consigliato ≤ 20 città.",
      hkNotFound:      "Held-Karp non ha trovato un tour (controlla connettività).",
      bfHeavy:         "Brute Force è praticabile fino a ~11 città.",
      bfNotFound:      "Brute Force non ha trovato un tour (controlla connettività)."
    },
    algo: {
      hk:     { title: "Held-Karp",           type: "Esatto",
                text: "Divide il problema in sottoproblemi (programmazione dinamica) e li combina: garantisce sempre il giro più corto." },
      bf:     { title: "Brute Force",         type: "Esatto",
                text: "Prova tutte le sequenze di città e sceglie quella con il percorso più breve (fattoriale, solo per N piccoli)." },
      nn:     { title: "Nearest Neighbor",    type: "Euristica",
                text: "Parti da una città e vai sempre alla più vicina non ancora visitata, finché chiudi il giro." },
      twoopt: { title: "2-Opt",               type: "Euristica",
                text: "Migliora iterativamente un tour invertendo segmenti quando accorciano il percorso." },
      aco:    { title: "Ant Colony Opt.",     type: "Metaeuristica",
                text: "Ispirata alle formiche: i percorsi corti accumulano più 'feromone' e vengono preferiti." },
      ga:     { title: "Genetic Algorithm",   type: "Metaeuristica",
                text: "Evolve una popolazione di tour con selezione, crossover e mutazione verso soluzioni migliori." }
    }
  },
  en: {
    ui: {
      you: "You",
      you_partial: "You (partial)",
      start: "Start",
      length: "length",
      best: "best",
      iteration: "iteration",
      generation: "generation",
      optimal: "(optimal)"
    },
    alerts: {
      closeIncomplete: "You must visit all cities before closing the tour.",
      closeForbidden:  "Returning to the start is forbidden in this level.",
      needSeed2opt:    "2-Opt needs an initial tour (your full tour or NN).",
      hkHeavy:         "Held-Karp is heavy: recommended ≤ 20 cities.",
      hkNotFound:      "Held-Karp failed to find a tour (check connectivity).",
      bfHeavy:         "Brute Force is feasible up to ~11 cities.",
      bfNotFound:      "Brute Force failed to find a tour (check connectivity)."
    },
    algo: {
      hk:     { title: "Held-Karp",           type: "Exact",
                text: "Dynamic programming over subsets; guarantees the optimal tour." },
      bf:     { title: "Brute Force",         type: "Exact",
                text: "Tries all permutations of cities and picks the shortest (factorial complexity)." },
      nn:     { title: "Nearest Neighbor",    type: "Heuristic",
                text: "Start anywhere and always go to the closest unvisited city until you close the tour." },
      twoopt: { title: "2-Opt",               type: "Heuristic",
                text: "Iteratively improves a tour by reversing edges that shorten its length." },
      aco:    { title: "Ant Colony Opt.",     type: "Metaheuristic",
                text: "Pheromone-based search where shorter tours get reinforced." },
      ga:     { title: "Genetic Algorithm",   type: "Metaheuristic",
                text: "Evolves a population of tours via selection, crossover, and mutation." }
    }
  }
};
const LANG = () => (String(document.documentElement.lang||'it').toLowerCase().startsWith('en') ? 'en' : 'it');
const tr = (path, fallback='') => {
  try {
    return path.split('.').reduce((o,k)=>o[k], I18N[LANG()]) ?? fallback;
  } catch { return fallback; }
};

/* ===========================
 * 2) Costanti UI & Stili
 * =========================== */
const STYLES = {
  nn:     { stroke: '#9aa3b2', dash: [10,7], marker: 'square'   }, // Euristica
  twoopt: { stroke: '#4a8bff', dash: [],     marker: 'circle'   }, // Euristica
  aco:    { stroke: '#52f2b2', dash: [3,5],  marker: 'triangle' }, // Metaeuristica
  hk:     { stroke: '#ffd166', dash: [],     marker: 'diamond'  }, // Esatto
  bf:     { stroke: '#ff8aa8', dash: [2,3],  marker: 'cross'    }, // Esatto
  ga:     { stroke: '#c7ff6b', dash: [6,4],  marker: 'circle'   }  // Metaeuristica
};

// Etichette/città
let showLabels         = true;             // mostra etichette piccole
const LABEL_MODE       = 'letters';        // 'letters' | 'numbers' | 'json'
const SHUFFLE_LABELS   = true;
const LABEL_FONT       = '10px system-ui';
const START_LABEL_FONT = '12px system-ui';

/* ===========================
 * 3) Stato
 * =========================== */
let level   = null;                         // dati livello (JSON)
let nodes   = [];                           // [{id,x,y}]
let weight  = null;                         // funzione w(u,v)
let tour    = [];                           // percorso utente (ids)
let used    = new Set();                    // nodi cliccati dall'utente

// tour calcolati dagli algoritmi
let algoTours = { nn:null, twoopt:null, aco:null, hk:null, bf:null, ga:null };

// visibilità: "mostra solo l'algoritmo selezionato"
let visibility = { nn:false, twoopt:false, aco:false, hk:false, bf:false, ga:false };

// punteggi persistenti mostrati nell'HUD
let scores = { nn:'n/d', twoopt:'n/d', aco:'n/d', hk:'n/d', bf:'n/d', ga:'n/d' };

// tooltip / etichette
let labels  = [];
let hoverId = -1;

/* ===========================
 * 4) Event Listeners UI
 * =========================== */
document.getElementById('btnLoad').onclick  = () => loadLevel(sel.value);
document.getElementById('btnReset').onclick = resetTour;
const btnClose = document.getElementById('btnClose');
if (btnClose) btnClose.onclick = closeCycle;

// bottoni algoritmi
bindButton('btnNN',   runNN);
bindButton('btn2Opt', run2Opt);
bindButton('btnACO',  runACO);
bindButton('btnGA',   runGA);
bindButton('btnHK',   runHeldKarp);
bindButton('btnBF',   runBruteForce);

canvas.addEventListener('click', onClick);
canvas.addEventListener('mousemove', onMove);

// canvas responsivo/retina
window.addEventListener('resize', () => { resizeCanvasToDisplaySize(); draw(); });

function bindButton(id, fn){ const b=document.getElementById(id); if(b) b.onclick=fn; }

/* ===========================
 * 5) Utility generiche
 * =========================== */
function resizeCanvasToDisplaySize() {
  const cssSize = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.floor(cssSize.width  * dpr);
  const H = Math.floor(cssSize.height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width  = W;
    canvas.height = H;
  }
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function makeLabels(mode, n, jsonLabels){
  if(mode === 'json' && Array.isArray(jsonLabels) && jsonLabels.length === n) return [...jsonLabels];
  if(mode === 'numbers') return Array.from({length:n}, (_,i)=> String(i+1));
  const arr = []; for(let i=0;i<n;i++) arr.push(letterIndex(i)); return arr;
}
function letterIndex(k){
  const A='A'.charCodeAt(0);
  if(k<26) return String.fromCharCode(A+k);
  const first = Math.floor(k/26)-1, second = k%26;
  return String.fromCharCode(A+first)+String.fromCharCode(A+second);
}

function length(path){
  if(!path || path.length < 2) return 0;
  let L=0;
  for(let i=0;i<path.length-1;i++){
    const u=path[i], v=path[i+1], w=weight(u,v);
    if(!Number.isFinite(w)) return Infinity;
    L += w;
  }
  if(path.length === nodes.length){
    const wClose = weight(path[path.length-1], path[0]);
    if(!Number.isFinite(wClose)) return Infinity;
    L += wClose;
  }
  return L;
}

/* ===========================
 * 6) UI helpers
 * =========================== */
function showAlgoInfo(key, extraStatsHtml=''){
  const box = document.getElementById('algoInfo');
  if(!box || !I18N[LANG()].algo[key]) return;
  const a = I18N[LANG()].algo[key];
  box.innerHTML = `
    <h4>${a.title}</h4>
    <div class="meta">${a.type}</div>
    <div>${a.text}</div>
    ${extraStatsHtml ? `<div style="margin-top:8px">${extraStatsHtml}</div>` : ''}
  `;
  box.classList.add('show');
  box.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function updateScore(key, value){
  scores[key] = value; // es. 'nn' -> '123.4'
  setHUDFromScores();
}

function setHUDFromScores(){
  const parts = [];
  const isFull = tour.length === nodes.length &&
                 Number.isFinite(weight(tour[tour.length-1], tour[0]));
  const youLabel = isFull ? tr('ui.you') : tr('ui.you_partial');

  parts.push(`<span style="color:#b9c2d0">${youLabel}: ${currentYou()}</span>`);
  if(scores.nn!=='n/d')     parts.push(`<span style="color:${STYLES.nn.stroke}">NN: ${scores.nn}</span>`);
  if(scores.twoopt!=='n/d') parts.push(`<span style="color:${STYLES.twoopt.stroke}">2-Opt: ${scores.twoopt}</span>`);
  if(scores.aco!=='n/d')    parts.push(`<span style="color:${STYLES.aco.stroke}">ACO: ${scores.aco}</span>`);
  if(scores.hk!=='n/d')     parts.push(`<span style="color:${STYLES.hk.stroke}">HK: ${scores.hk}</span>`);
  if(scores.bf!=='n/d')     parts.push(`<span style="color:${STYLES.bf.stroke}">BF: ${scores.bf}</span>`);
  if(scores.ga!=='n/d')     parts.push(`<span style="color:${STYLES.ga.stroke}">GA: ${scores.ga}</span>`);
  hud.innerHTML = parts.join(' | ');
}

function currentYou(){
  const L = length(tour);
  return (tour.length >= 2 && Number.isFinite(L))
    ? L.toFixed(1)
    : '–';
}

/* ===============================
 * 7) Motore animazione (condiviso)
 * =============================== */
let _anim = { handle:null, running:false };

function stopAnimation(){
  if(_anim.handle){ clearTimeout(_anim.handle); }
  _anim = { handle:null, running:false };
}

function animateLoop({stepFn, onFrame, onEnd, delay=180}){
  stopAnimation();
  _anim.running = true;

  function tick(){
    if(!_anim.running) return;
    const s = stepFn();               // { done, iter/gen, bestTour, bestLen }
    if(!s) { stopAnimation(); onEnd?.(); return; }

    onFrame?.(s);

    if(s.done){
      stopAnimation();
      onEnd?.(s);
    }else{
      _anim.handle = setTimeout(tick, delay);
    }
  }
  tick();
}

/* ===========================
 * 8) Caricamento livello
 * =========================== */
async function loadLevel(name){
  const url = new URL(`levels/${name}.json`, window.location.href);
  try{
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} su ${url.pathname}`);
    level = await res.json();
  }catch(e){
    alert(window.location.protocol==='file:' ? 'Apri con Live Server.' : `Errore caricando ${name}.json → ${e.message}`);
    return;
  }

  resizeCanvasToDisplaySize();

  // nodi
  nodes = buildNodesFromLevel(level);

  // pesi/archi
  if(Array.isArray(level.edges) && level.edges.length){
    const map = new Map();
    for(const e of level.edges){
      const w = Math.hypot(nodes[e.u].x - nodes[e.v].x, nodes[e.u].y - nodes[e.v].y);
      map.set(`${e.u}-${e.v}`, w); map.set(`${e.v}-${e.u}`, w);
    }
    weight = (u,v) => map.has(`${u}-${v}`) ? map.get(`${u}-${v}`) : Infinity;
  } else {
    weight = (u,v) => Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
  }

  // etichette
  labels = makeLabels(LABEL_MODE, nodes.length, level?.labels);
  if (LABEL_MODE === 'letters' && SHUFFLE_LABELS) shuffle(labels);

  resetTour();           // azzera tour/algoritmi/hud
  draw();
  updateLegend();
}

function buildNodesFromLevel(level){
  if(Array.isArray(level.nodes) && level.nodes.length && !level.layout){
    return level.nodes.map(n => ({...n}));
  }
  const n = Number.isInteger(level.n) ? level.n : (Array.isArray(level.nodes) ? level.nodes.length : 0);
  const layout = (level.layout || 'uniform').toLowerCase();
  const seed   = Number.isInteger(level.seed) ? level.seed : 123;
  if(n<=0) return [];

  if(layout==='uniform') return sunflowerNodes(n, seed);
  if(layout==='random')  return randomNodes(n);
  return sunflowerNodes(n, seed);
}

function sunflowerNodes(n, seed){
  const rng = mulberry32(seed);
  const margin=36, W=canvas.width-2*margin, H=canvas.height-2*margin;
  const g=(Math.sqrt(5)-1)/2;
  const pts=[];
  for(let i=0;i<n;i++){
    const t=(i+0.5)/n, r=Math.sqrt(t), theta=2*Math.PI*g*i;
    let x=(W/2)+(W/2-12)*r*Math.cos(theta);
    let y=(H/2)+(H/2-12)*r*Math.sin(theta);
    x+=(rng()-0.5)*14; y+=(rng()-0.5)*14;
    pts.push({id:i, x:x+margin, y:y+margin});
  }
  return pts;
}

function randomNodes(n){
  const margin=36, W=canvas.width-2*margin, H=canvas.height-2*margin;
  const area=W*H, base=Math.sqrt(area/Math.max(1,n));
  let minDist=0.55*base, minDistFloor=12, maxTries=4000;
  const pts=[]; let tries=0;

  while(pts.length<n && tries<maxTries){
    const x=margin+Math.random()*W, y=margin+Math.random()*H;
    let ok=true;
    for(const p of pts){ const dx=x-p.x, dy=y-p.y; if(dx*dx+dy*dy<minDist*minDist){ ok=false; break; } }
    if(ok){ pts.push({id:pts.length, x,y}); } else { tries++; if(tries%800===0 && minDist>minDistFloor){ minDist=Math.max(minDist*0.92, minDistFloor); } }
  }
  if(pts.length<n){
    const rest=sunflowerNodes(n-pts.length, Math.floor(Math.random()*1e9));
    for(const p of rest){ pts.push({id:pts.length, x:p.x, y:p.y}); }
  }
  for(let i=0;i<pts.length;i++) pts[i].id=i;
  return pts;
}

function mulberry32(a){
  return function(){
    let t=a+=0x6D2B79F5;
    t=Math.imul(t^t>>>15, t|1);
    t^=t+Math.imul(t^t>>>7, t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

/* ===========================
 * 9) Interazione utente
 * =========================== */
function resetTour(){
  tour = [];
  used = new Set();
  algoTours = { nn:null, twoopt:null, aco:null, hk:null, bf:null, ga:null };
  visibility = { nn:false, twoopt:false, aco:false, hk:false, bf:false, ga:false };
  hoverId = -1;
  scores = { nn:'n/d', twoopt:'n/d', aco:'n/d', hk:'n/d', bf:'n/d', ga:'n/d' };
  setHUDFromScores();

  const box = document.getElementById('algoInfo');
  if(box){ box.classList.remove('show'); box.innerHTML=''; }

  draw();
  updateLegend();
}

function closeCycle(){
  if(!level) return;
  if(tour.length !== nodes.length){ alert(tr('alerts.closeIncomplete')); return; }
  if(!Number.isFinite(weight(tour[tour.length-1], tour[0]))){
    alert(tr('alerts.closeForbidden'));
    setHUDFromScores(); draw(); return;
  }
  setHUDFromScores();
  draw();
}

function onMove(ev){
  if(!level) return;
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top)  * (canvas.height / rect.height);
  hoverId = nearestNodeAt(x,y, 14);
  draw();
}

function onClick(ev){
  if(!level) return;
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top)  * (canvas.height / rect.height);
  const id = nearestNodeAt(x,y);
  if(id === -1) return;

  if(used.has(id)){
    if(tour.length && tour[tour.length-1] === id){
      used.delete(id);
      tour.pop();
    }
  } else {
    used.add(id);
    tour.push(id);
  }

  setHUDFromScores();
  draw();
}

function nearestNodeAt(x,y, radius=16){
  let best=-1, bestD=radius;
  for(const n of nodes){
    const d = Math.hypot(x-n.x, y-n.y);
    if(d < bestD){ best = n.id; bestD = d; }
  }
  return best;
}

/* ===========================
 * 10) Disegno
 * =========================== */
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // griglia
  ctx.globalAlpha = 0.15;
  for(let x=50;x<canvas.width;x+=50) line(x,0,x,canvas.height);
  for(let y=50;y<canvas.height;y+=50) line(0,y,canvas.width,y);
  ctx.globalAlpha = 1;

  // archi tenui tra tutte le città (sempre palette dark)
  drawFaintEdges();

  // algoritmi (rispettando "visibility")
  if(algoTours.nn     && visibility.nn)     drawTourWithStyle(algoTours.nn,     STYLES.nn);
  if(algoTours.twoopt && visibility.twoopt) drawTourWithStyle(algoTours.twoopt, STYLES.twoopt);
  if(algoTours.aco    && visibility.aco)    drawTourWithStyle(algoTours.aco,    STYLES.aco);
  if(algoTours.hk     && visibility.hk)     drawTourWithStyle(algoTours.hk,     STYLES.hk);
  if(algoTours.bf     && visibility.bf)     drawTourWithStyle(algoTours.bf,     STYLES.bf);
  if(algoTours.ga     && visibility.ga)     drawTourWithStyle(algoTours.ga,     STYLES.ga);

  // tour utente (sopra)
  if(tour.length > 1){
    ctx.lineWidth = 3; ctx.setLineDash([]); ctx.strokeStyle='#89f';
    path(tour); ctx.stroke();
  }

  // nodi + badge + etichette
  for(const n of nodes){
    const r=7;
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle = used.has(n.id) ? '#0f0' : '#fff'; ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle = (n.id === (level?.start ?? 0)) ? '#ff0' : '#445'; ctx.stroke();

    if(n.id === (level?.start ?? 0)) drawStartBadge(n.x, n.y-16, tr('ui.start'));
    if(showLabels && n.id !== (level?.start ?? 0)) drawSmallLabel(n.x+10, n.y-10, labels[n.id]);
  }

  // tooltip hover
  if(hoverId !== -1){
    const n = nodes[hoverId]; const text = showLabels ? labels[hoverId] : '•';
    ctx.font='12px system-ui'; const w=ctx.measureText(text).width+10;
    ctx.fillStyle='rgba(20,26,38,0.9)'; ctx.fillRect(n.x+12, n.y-28, w, 18);
    ctx.strokeStyle='#445'; ctx.lineWidth=1; ctx.strokeRect(n.x+12, n.y-28, w, 18);
    ctx.fillStyle='#e6ebff'; ctx.fillText(text, n.x+17, n.y-15);
  }
}

function drawFaintEdges(){
  if(!nodes || nodes.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; // fisso (dark)
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const u = nodes[i].id, v = nodes[j].id;
      const w = weight(u,v);
      if(!Number.isFinite(w)) continue;        // rispetta livelli con archi mancanti
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[j].x, nodes[j].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function line(x1,y1,x2,y2){
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
  ctx.strokeStyle='#1b2535'; ctx.lineWidth=1; ctx.stroke();
}

function path(p){
  if(!p.length) return;
  ctx.beginPath();
  const s=nodes[p[0]]; ctx.moveTo(s.x,s.y);
  for(let i=1;i<p.length;i++){ const q=nodes[p[i]]; ctx.lineTo(q.x,q.y); }
  if(p.length>=nodes.length && Number.isFinite(weight(p[p.length-1], p[0]))){ ctx.lineTo(s.x,s.y); }
}

function drawTourWithStyle(p, style){
  if(!p || p.length<2) return;
  ctx.lineWidth=2; ctx.strokeStyle=style.stroke; ctx.setLineDash(style.dash||[]);
  path(p); ctx.stroke(); ctx.setLineDash([]);
  for(const id of p){ const n=nodes[id]; drawMarker(n.x,n.y,style.marker,style.stroke); }
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
  ctx.save(); ctx.font=LABEL_FONT; const pad=3, h=16; const w=ctx.measureText(text).width+pad*2;
  ctx.fillStyle='rgba(13,18,28,0.85)'; ctx.fillRect(x-2,y-12,w,h);
  ctx.strokeStyle='#2a3650'; ctx.lineWidth=1; ctx.strokeRect(x-2,y-12,w,h);
  ctx.fillStyle='#cdd7f3'; ctx.fillText(text, x+pad-2, y+1);
  ctx.restore();
}

function drawStartBadge(x,y,text){
  ctx.save(); ctx.font=START_LABEL_FONT; const padX=6, h=18; const w=ctx.measureText(text).width+padX*2;
  roundRect(ctx, x-w/2, y-h/2, w, h, 9);
  ctx.fillStyle='#ffdf6a'; ctx.fill(); ctx.strokeStyle='#9b7f27'; ctx.lineWidth=1.2; ctx.stroke();
  ctx.fillStyle='#2b2205'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,x,y);
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,  x+w,y+h, rr);
  ctx.arcTo(x+w,y+h,x,  y+h, rr);
  ctx.arcTo(x,  y+h,x,  y,   rr);
  ctx.arcTo(x,  y,  x+w,y,   rr);
  ctx.closePath();
}

/* ===========================
 * 11) Algoritmi
 * =========================== */
// — Euristiche
function nn(start=level?.start ?? 0){
  const N=nodes.length, seen=new Array(N).fill(false); let t=[start]; seen[start]=true;
  for(let k=1;k<N;k++){
    const u=t[t.length-1]; let best=-1, bestW=Infinity;
    for(let v=0; v<N; v++){
      if(seen[v]) continue; const w=weight(u,v);
      if(Number.isFinite(w) && w<bestW){ bestW=w; best=v; }
    }
    if(best===-1) return null; t.push(best); seen[best]=true;
  }
  if(!Number.isFinite(weight(t[N-1], t[0]))) return null;
  return t;
}

function twoOpt(t, maxPass=4){
  if(!t) return null;
  const N=t.length; let improved=true, pass=0;
  const validEdge=(a,b)=>Number.isFinite(weight(a,b));
  while(improved && pass++<maxPass){
    improved=false;
    for(let i=0;i<N-3;i++){
      for(let j=i+2;j<N-1;j++){
        const a=t[i], b=t[i+1], c=t[j], d=t[j+1];
        if(!validEdge(a,c) || !validEdge(b,d)) continue;
        const delta=(weight(a,c)+weight(b,d))-(weight(a,b)+weight(c,d));
        if(delta < -1e-9){
          const mid=t.slice(i+1,j+1).reverse();
          t=t.slice(0,i+1).concat(mid, t.slice(j+1));
          improved=true;
        }
      }
    }
  }
  if(!Number.isFinite(weight(t[N-1], t[0]))) return null;
  return t;
}

// — Metaeuristica: Ant Colony (micro)
function acoSolve({alpha,beta,rho,ants,iters,candidateK}){
  const N=nodes.length;
  const D=Array.from({length:N},()=>Array(N).fill(Infinity));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    if(i===j) continue; const w=weight(i,j); D[i][j]=Number.isFinite(w)?w:Infinity;
  }
  const candidates=Array.from({length:N},(_,u)=>{
    const list=[]; for(let v=0;v<N;v++) if(Number.isFinite(D[u][v])) list.push([v,D[u][v]]);
    list.sort((a,b)=>a[1]-b[1]); return list.slice(0, Math.min(candidateK, list.length)).map(e=>e[0]);
  });
  const tau0=1/(N*meanFinite(D)), tau=Array.from({length:N},()=>Array(N).fill(tau0));
  let bestTour=null, bestLen=Infinity;

  for(let it=0; it<iters; it++){
    const tours=[];
    for(let k=0;k<ants;k++){
      const start=level?.start ?? Math.floor(Math.random()*N);
      const t=build(start,tau,D,candidates,alpha,beta);
      if(t){ const L=length(t); if(Number.isFinite(L)){ tours.push({tour:t,L}); if(L<bestLen){ bestLen=L; bestTour=t; } } }
    }
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){ tau[i][j]*=(1-rho); if(tau[i][j]<1e-12) tau[i][j]=1e-12; }
    for(const {tour:t,L} of tours){
      const dep=1/L;
      for(let i=0;i<t.length;i++){
        const u=t[i], v=t[(i+1)%t.length]; if(Number.isFinite(D[u][v])){ tau[u][v]+=dep; tau[v][u]+=dep; }
      }
    }
  }
  return bestTour ? {tour:bestTour, L:bestLen} : null;

  function meanFinite(M){ let s=0,c=0; for(let i=0;i<N;i++) for(let j=0;j<N;j++){ if(Number.isFinite(M[i][j])){ s+=M[i][j]; c++; } } return s/(c||1); }
  function build(start,tau,D,cand,alpha,beta){
    const vis=new Array(N).fill(false), t=[start]; vis[start]=true; let u=start;
    for(let step=1; step<N; step++){
      const v=pick(u,vis,tau,D,cand[u],alpha,beta); if(v===-1) return null; t.push(v); vis[v]=true; u=v;
    }
    if(!Number.isFinite(D[t[N-1]][t[0]])) return null; return t;
  }
  function pick(u,vis,tau,D,cand,alpha,beta){
    const choices=[];
    for(const v of cand){
      if(!vis[v] && Number.isFinite(D[u][v])){
        const eta=1/D[u][v], p=Math.pow(tau[u][v],alpha)*Math.pow(eta,beta);
        if(p>0) choices.push([v,p]);
      }
    }
    if(!choices.length){
      for(let v=0;v<N;v++){
        if(!vis[v] && Number.isFinite(D[u][v])){
          const eta=1/D[u][v], p=Math.pow(tau[u][v],alpha)*Math.pow(eta,beta);
          if(p>0) choices.push([v,p]);
        }
      }
      if(!choices.length) return -1;
    }
    const sum=choices.reduce((a,b)=>a+b[1],0); let r=Math.random()*sum;
    for(const [v,p] of choices){ r-=p; if(r<=0) return v; }
    return choices[choices.length-1][0];
  }
}

// — Esatti
function heldKarpExact(){
  const N=nodes.length, start=level?.start ?? 0;
  const V=[...Array(N).keys()].filter(i=>i!==start);
  const idx=new Map(); V.forEach((v,k)=>idx.set(v,k));
  const S=1<<V.length;
  const DP=Array.from({length:S},()=>Array(N).fill(Infinity));
  const parent=Array.from({length:S},()=>Array(N).fill(-1));

  for(const j of V){
    const m=1<<idx.get(j); const w=weight(start,j);
    if(Number.isFinite(w)){ DP[m][j]=w; parent[m][j]=start; }
  }
  for(let m=1;m<S;m++){
    for(const j of V){
      const jbit=1<<idx.get(j); if(!(m&jbit)) continue;
      const prevMask=m^jbit; if(prevMask===0) continue;
      for(const k of V){
        const kbit=1<<idx.get(k); if(!(prevMask&kbit)) continue;
        const wkj=weight(k,j); if(!Number.isFinite(wkj)) continue;
        const cand=DP[prevMask][k]+wkj;
        if(cand<DP[m][j]){ DP[m][j]=cand; parent[m][j]=k; }
      }
    }
  }
  let best=Infinity, last=-1; const FULL=S-1;
  for(const j of V){
    const w=weight(j,start); if(!Number.isFinite(w)) continue;
    const cand=DP[FULL][j]+w; if(cand<best){ best=cand; last=j; }
  }
  if(!Number.isFinite(best)) return null;

  const tour=[start]; let mask=FULL, cur=last, stack=[];
  while(cur!==start && cur!==-1){ stack.push(cur); const jbit=1<<idx.get(cur); const prev=parent[mask][cur]; mask^=jbit; cur=prev; }
  stack.reverse().forEach(v=>tour.push(v));
  return tour;
}

function bruteForceExact(){
  const N=nodes.length, start=level?.start ?? 0;
  const rest=[...Array(N).keys()].filter(i=>i!==start);
  let bestTour=null, best=Infinity;

  function perm(a,l){
    if(l===a.length){
      const t=[start, ...a];
      if(!Number.isFinite(weight(t[t.length-1], start))) return;
      const L=length(t);
      if(Number.isFinite(L)&&L<best){ best=L; bestTour=t.slice(); }
      return;
    }
    for(let i=l;i<a.length;i++){
      [a[l],a[i]]=[a[i],a[l]]; perm(a, l+1); [a[l],a[i]]=[a[i],a[l]];
    }
  }
  perm(rest, 0);
  return bestTour ? bestTour : null;
}

/* ===========================
 * 12) Bottoni algoritmi
 * =========================== */
function runNN(){
  const base=nn(level.start ?? 0);
  algoTours.nn = base;
  visibility = { nn: !!base, twoopt:false, aco:false, hk:false, bf:false, ga:false };

  updateScore('nn', base ? length(base).toFixed(1) : 'n/d');
  draw(); updateLegend();

  const info = base ? `<small>${tr('ui.length')}: <strong>${length(base).toFixed(1)}</strong></small>` : '';
  showAlgoInfo('nn', info);
}

function run2Opt(){
  // seed preferito: tour dell’utente se completo; altrimenti NN
  let seed=null;
  const youFull = (tour.length===nodes.length) && Number.isFinite(weight(tour[tour.length-1], tour[0]));
  if(youFull) seed=[...tour];
  if(!seed){
    const base=nn(level.start ?? 0);
    if(base) algoTours.nn=base;
    seed = base ? [...base] : null;
  }
  if(seed){
    const two=twoOpt(seed, 6);
    algoTours.twoopt=two;
    visibility = { nn:false, twoopt: !!two, aco:false, hk:false, bf:false, ga:false };

    updateScore('twoopt', two ? length(two).toFixed(1) : 'n/d');
    draw(); updateLegend();

    const info = two ? `<small>${tr('ui.length')}: <strong>${length(two).toFixed(1)}</strong></small>` : '';
    showAlgoInfo('twoopt', info);
  } else {
    alert(tr('alerts.needSeed2opt'));
  }
}

// ===================================
// ACO ANIMATO (Ant Colony Optimization)
// ===================================
function runACO(){
  visibility = { nn:false, twoopt:false, aco:true, hk:false, bf:false, ga:false };

  const stepper = acoCreateStepper({
    alpha:1.0, beta:3.0, rho:0.5,
    ants:30, iters:50,
    candidateK:6
  });

  animateLoop({
    delay: 180,
    stepFn: stepper.step,
    onFrame: ({iter, bestTour, bestLen})=>{
      if(bestTour){
        algoTours.aco = bestTour;
        updateScore('aco', Number.isFinite(bestLen) ? bestLen.toFixed(1) : 'n/d');
        draw();
      }
      showAlgoInfo('aco', `<small>${tr('ui.iteration')}: <strong>${iter}</strong> &nbsp; • &nbsp; ${tr('ui.best')}: <strong>${Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d'}</strong></small>`);
    }
  });
}

function acoCreateStepper({alpha,beta,rho,ants,iters,candidateK}){
  const N = nodes.length;
  const D = Array.from({length:N}, ()=> Array(N).fill(Infinity));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    if(i===j) continue;
    const w = weight(i,j);
    D[i][j] = Number.isFinite(w) ? w : Infinity;
  }
  const candidates = Array.from({length:N}, (_,u)=>{
    const list=[]; for(let v=0; v<N; v++) if(Number.isFinite(D[u][v])) list.push([v, D[u][v]]);
    list.sort((a,b)=>a[1]-b[1]);
    return list.slice(0, Math.min(candidateK, list.length)).map(e=>e[0]);
  });

  const tau0 = 1 / (N * meanFinite(D));
  const tau  = Array.from({length:N}, ()=> Array(N).fill(tau0));

  let bestTour=null, bestLen=Infinity, iter=0;

  function step(){
    if(iter >= iters) return { done:true, iter, bestTour, bestLen };

    const tours=[];
    for(let k=0; k<ants; k++){
      const start = level?.start ?? Math.floor(Math.random()*N);
      const t = build(start);
      if(t){
        const L = length(t);
        if(Number.isFinite(L)){
          tours.push({tour:t, L});
          if(L < bestLen){ bestLen=L; bestTour=t; }
        }
      }
    }

    // Evaporazione
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      tau[i][j] *= (1-rho);
      if(tau[i][j] < 1e-12) tau[i][j] = 1e-12;
    }
    // Deposito
    for(const {tour:t,L} of tours){
      const dep = 1/L;
      for(let i=0;i<t.length;i++){
        const u=t[i], v=t[(i+1)%t.length];
        if(Number.isFinite(D[u][v])){ tau[u][v]+=dep; tau[v][u]+=dep; }
      }
    }

    iter++;
    return { done:false, iter, bestTour, bestLen };
  }

  function meanFinite(M){
    let s=0,c=0; for(let i=0;i<N;i++) for(let j=0;j<N;j++){ if(Number.isFinite(M[i][j])){ s+=M[i][j]; c++; } }
    return s/(c||1);
  }
  function build(start){
    const vis=new Array(N).fill(false); const t=[start]; vis[start]=true; let u=start;
    for(let step=1; step<N; step++){
      const v = pick(u, vis);
      if(v === -1) return null;
      t.push(v); vis[v]=true; u=v;
    }
    if(!Number.isFinite(D[t[N-1]][t[0]])) return null;
    return t;
  }
  function pick(u, vis){
    const choices=[];
    for(const v of candidates[u]){
      if(!vis[v] && Number.isFinite(D[u][v])){
        const eta=1/D[u][v];
        const p = Math.pow(tau[u][v], alpha) * Math.pow(eta, beta);
        if(p>0) choices.push([v,p]);
      }
    }
    if(!choices.length){
      for(let v=0; v<N; v++){
        if(!vis[v] && Number.isFinite(D[u][v])){
          const eta=1/D[u][v];
          const p = Math.pow(tau[u][v], alpha) * Math.pow(eta, beta);
          if(p>0) choices.push([v,p]);
        }
      }
      if(!choices.length) return -1;
    }
    const sum=choices.reduce((a,b)=>a+b[1],0);
    let r=Math.random()*sum;
    for(const [v,p] of choices){ r-=p; if(r<=0) return v; }
    return choices[choices.length-1][0];
  }

  return { step };
}

function runHeldKarp(){
  const N=nodes.length;
  if(N>20){ alert(tr('alerts.hkHeavy')); return; }
  const hk=heldKarpExact();
  if(hk){
    algoTours.hk=hk;
    visibility = { nn:false, twoopt:false, aco:false, hk:true, bf:false, ga:false };

    updateScore('hk', length(hk).toFixed(1));
    draw(); updateLegend();

    showAlgoInfo('hk', `<small>${tr('ui.length')} ${tr('ui.optimal')}: <strong>${length(hk).toFixed(1)}</strong></small>`);
  } else {
    alert(tr('alerts.hkNotFound'));
  }
}

function runBruteForce(){
  const N=nodes.length;
  if(N>11){ alert(tr('alerts.bfHeavy')); return; }
  const bf=bruteForceExact();
  if(bf){
    algoTours.bf=bf;
    visibility = { nn:false, twoopt:false, aco:false, hk:false, bf:true, ga:false };

    updateScore('bf', length(bf).toFixed(1));
    draw(); updateLegend();

    showAlgoInfo('bf', `<small>${tr('ui.length')} ${tr('ui.optimal')}: <strong>${length(bf).toFixed(1)}</strong></small>`);
  } else {
    alert(tr('alerts.bfNotFound'));
  }
}

/* ===============================
 * 13) GENETIC ALGORITHM ANIMATO (GA)
 * =============================== */
function runGA(){
  visibility = { nn:false, twoopt:false, aco:false, hk:false, bf:false, ga:true };

  const stepper = gaCreateStepper({
    pop: 50,
    gens: 60,
    pmut: 0.25,
    tournament: 6
  });

  animateLoop({
    delay: 160,
    stepFn: stepper.step,
    onFrame: ({gen, bestTour, bestLen})=>{
      if(bestTour){
        algoTours.ga = bestTour;
        updateScore('ga', Number.isFinite(bestLen) ? bestLen.toFixed(1) : 'n/d');
        draw();
      }
      showAlgoInfo('ga', `<small>${tr('ui.generation')}: <strong>${gen}</strong> &nbsp; • &nbsp; ${tr('ui.best')}: <strong>${Number.isFinite(bestLen)?bestLen.toFixed(1):'n/d'}</strong></small>`);
    }
  });
}

function gaCreateStepper({pop=40, gens=60, pmut=0.25, tournament=6}){
  const N = nodes.length;
  const start = level?.start ?? 0;
  if(N < 3) return { step: ()=>({done:true, gen:0, bestTour:null, bestLen:Infinity}) };

  const valid = (t)=> Number.isFinite(weight(t[t.length-1], t[0]));
  const tourLen = (t)=> length(t);

  const seed = nn(start) || [...Array(N).keys()];
  const base = seed[0]===start ? seed : [start, ...seed.filter(x=>x!==start)];

  function randomTour(){
    const arr = base.slice(1);
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    const t = [start, ...arr];
    return valid(t) ? t : null;
  }

  let popu = [];
  while(popu.length < pop){
    const t = randomTour();
    if(t) popu.push(t);
  }

  function selectParent(){
    let best = null, bestL = Infinity;
    for(let i=0;i<tournament;i++){
      const cand = popu[Math.floor(Math.random()*popu.length)];
      const L = tourLen(cand);
      if(L < bestL){ bestL=L; best=cand; }
    }
    return best;
  }

  function crossover(p1,p2){
    const a=p1.slice(1), b=p2.slice(1), n=a.length;
    const i=Math.floor(Math.random()*n), j=Math.floor(Math.random()*(n));
    const lo=Math.min(i,j), hi=Math.max(i,j);
    const child=new Array(n).fill(-1);
    for(let k=lo;k<=hi;k++) child[k]=a[k];
    let idx=0;
    for(let k=0;k<n;k++){
      const gene=b[k];
      if(!child.includes(gene)){
        while(child[idx]!==-1) idx++;
        child[idx]=gene;
      }
    }
    const t=[start, ...child];
    return valid(t) ? t : null;
  }

  function mutate(t){
    if(Math.random()>pmut) return t;
    let i = 1 + Math.floor(Math.random()*(t.length-3));
    let j = i + 1 + Math.floor(Math.random()*(t.length-1-i));
    const child = t.slice(0,i).concat(t.slice(i,j).reverse(), t.slice(j));
    return valid(child) ? child : t;
  }

  let gen = 0;
  let bestTour = null, bestLen = Infinity;

  function step(){
    if(gen >= gens){
      return { done:true, gen, bestTour, bestLen };
    }

    popu.sort((u,v)=> tourLen(u)-tourLen(v));
    if(Number.isFinite(tourLen(popu[0])) && tourLen(popu[0])<bestLen){
      bestLen = tourLen(popu[0]); bestTour = popu[0];
    }

    const elite = popu.slice(0, Math.max(2, Math.floor(pop*0.12)));
    const next = [...elite];

    while(next.length < pop){
      const p1 = selectParent();
      const p2 = selectParent();
      let child = crossover(p1,p2) || randomTour();
      child = mutate(child);
      next.push(child);
    }
    popu = next;
    gen++;

    return { done:false, gen, bestTour, bestLen };
  }

  return { step };
}

/* ===========================
 * 14) Legenda esterna
 * =========================== */
function updateLegend(){
  const legend=document.getElementById('legend'); if(!legend) return;
  const chip = (label, style, dashClass='') => `
    <span class="legend-chip" style="color:${style.stroke}">
      <span class="legend-line ${dashClass}"></span> ${label}
    </span>`;
  legend.innerHTML = [
    chip('NN',     STYLES.nn,     'legend-dash-long'),
    chip('2-Opt',  STYLES.twoopt, ''),
    chip('ACO',    STYLES.aco,    'legend-dash-short'),
    chip('HK',     STYLES.hk,     ''),
    chip('BF',     STYLES.bf,     'legend-dash-short'),
    chip('GA',     STYLES.ga,     'legend-dash-long'),
    `<span class="legend-chip" style="color:#89f"><span class="legend-line"></span> ${tr('ui.you')}</span>`
  ].join('');
}

/* ===========================
 * 15) Avvio
 * =========================== */
loadLevel('10');            // livello default
resizeCanvasToDisplaySize();// prima sincronizzazione
draw();
