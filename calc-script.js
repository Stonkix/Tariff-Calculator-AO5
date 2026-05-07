/**
 * Калькулятор Астрал.ОФД (АО5)
 */
(function () {
'use strict';

// ── Маппинг колонок JSON ──────────────────────────────────────────────────
const TARIFF_MAP = {
  'zero':     { ip: 'Zero\n(Нулевка)',                      ul: 'Zero\n(Нулевка)'                    },
  'uno':      { ip: 'Uno(Минимальный)',                     ul: 'Column5'                      },
  'tre_s':    { ip: 'Tre S(Упрощенный)',                    ul: 'Column7'                      },
  'tre_o':    { ip: null,                                   ul: 'Tre O(Базовый) \n25/26'       },
  'opt3':     { ip: 'Quattro(Оптимальный)3 мес',            ul: 'Column14'                     },
  'opt6':     { ip: 'Quattro(Оптимальный) 6 мес',           ul: 'Column16'                     },
  'opt12':    { ip: 'Quattro(Оптимальный)\n 12 мес',        ul: 'Column10'                     },
  'opt24':    { ip: 'Quattro 2(Оптимальный 2) \n24 мес',    ul: 'Column12'                     },
};

// Карточки тарифов (Solo). Оптимальный — одна карточка-группа
// owns: для каких типов организации доступна карточка
const TARIFF_CARDS = [
  {
    id: 'optimal', name: 'Оптимальный', sub: 'Любая СНО, 4 направления',
    owns: ['ul','ip'],
    durations: [
      { id: 'opt12', label: '12 мес' },
      { id: 'opt24', label: '24 мес' },
    ]
  },
  { id: 'tre_o', name: 'Базовый',    sub: 'Любая СНО, 3 направления · 12 мес',  owns: ['ul']       },
  { id: 'tre_s', name: 'Упрощенный', sub: 'Спецрежимы, 3 направления · 12 мес', owns: ['ul','ip']  },
  { id: 'uno',   name: 'Минимальный',sub: 'Любая СНО, 1 направление · 12 мес',  owns: ['ul','ip']  },
  { id: 'zero',  name: 'Нулёвка',    sub: 'Нулевая отчётность · 12 мес',        owns: ['ul','ip']  },
];

const GK_RANGES = [
  { min: 3,  max: 5,        ip: 'ГК ИП/ФЛ', ul: 'ГК ЮЛ'   },
  { min: 6,  max: 10,       ip: 'Column18',  ul: 'Column24' },
  { min: 11, max: 15,       ip: 'Column19',  ul: 'Column25' },
  { min: 16, max: 25,       ip: 'Column20',  ul: 'Column26' },
  { min: 26, max: 50,       ip: 'Column21',  ul: 'Column27' },
  { min: 51, max: Infinity, ip: 'Column22',  ul: 'Column28' },
];

const EXT_DEFS = [
  { field: 'extIp',    col: 'Расширения', label: 'Доп. направление ИП/ФЛ' },
  { field: 'extUl',    col: 'Column30',   label: 'Доп. направление ЮЛ'    },
  { field: 'extIfns',  col: 'Column31',   label: 'Доп. ИФНС'              },
  { field: 'extStat',  col: 'Column32',   label: 'Доп. Росстат'           },
  { field: 'extFsrar', col: 'Column33',   label: 'ФСРАР'                  },
];

// Глобальные расширения (Solo/UB)
const GLOBAL_EXT = [
  { id: 'ext-ip',    col: 'Расширения', label: 'Доп. направление (ИП/ФЛ)' },
  { id: 'ext-ul',    col: 'Column30',   label: 'Доп. направление (ЮЛ)'    },
  { id: 'ext-ifns',  col: 'Column31',   label: 'Доп. ИФНС'                },
  { id: 'ext-stat',  col: 'Column32',   label: 'Доп. Росстат'             },
  { id: 'ext-fsrar', col: 'Column33',   label: 'ФСРАР'                    },
];

// ── Данные ────────────────────────────────────────────────────────────────
let DATA = [], DMAP = {};

// ── Состояние ─────────────────────────────────────────────────────────────
const S = {
  top:    'solo',
  gkMode: 'fast',
  // solo: cardId=базовый id карточки, durId=конкретный тариф (null = не выбран)
  solo: { reg: '', own: 'ul', cardId: null, durId: null },
  fast: { rows: [{ id: 1, reg: '', ul: 1, ip: 0 }] },
  det:  { cards: [newDetCard()], exist: 0 },
  ub:   { reg: '', reports: 0 },
};

function newDetCard() {
  return { id: Date.now() + Math.random(), name: '', inn: '', reg: '', own: 'ul',
           extIp: 0, extUl: 0, extIfns: 0, extStat: 0, extFsrar: 0, extOpen: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = v => Math.round(v).toLocaleString('ru-RU') + ' ₽';
const $   = id => document.getElementById(id);
const p   = (row, key) => key && row ? (parseInt(row[key]) || 0) : 0;

function tariffPrice(row, tariffId, own) {
  const col = TARIFF_MAP[tariffId] && TARIFF_MAP[tariffId][own];
  return p(row, col);
}

function gkRange(n) { return GK_RANGES.find(function(r){ return n >= r.min && n <= r.max; }); }
function gkLabel(n) { const r = gkRange(n); if(!r) return ''; return r.max===Infinity ? r.min+'+' : r.min+'–'+r.max; }

function sortedRegions() {
  return DATA.slice().sort(function(a, b){
    var aName = String((a && a.Column2) || '');
    var bName = String((b && b.Column2) || '');
    var aLow = aName.toLowerCase();
    var bLow = bName.toLowerCase();
    var aRank = aLow.indexOf('москва') !== -1 ? 0 : (aLow.indexOf('санкт-петербург') !== -1 ? 1 : 2);
    var bRank = bLow.indexOf('москва') !== -1 ? 0 : (bLow.indexOf('санкт-петербург') !== -1 ? 1 : 2);
    if (aRank !== bRank) return aRank - bRank;
    return aName.localeCompare(bName, 'ru', { sensitivity: 'base' });
  });
}

function buildRegSelect(selVal, onChange) {
  selVal = selVal || '';
  var regions = sortedRegions();
  var selectedName = '';
  if (selVal) {
    var selRow = regions.find(function(t){ return t.Column1 === selVal; });
    if (selRow) selectedName = selRow.Column2;
  }

  var wrap = document.createElement('div');
  wrap.className = 'reg-wrap';

  var display = document.createElement('div');
  display.className = 'reg-display' + (selVal ? '' : ' placeholder');
  display.setAttribute('tabindex', '0');
  var displayText = document.createElement('span');
  displayText.textContent = selectedName || 'Выберите регион';
  display.appendChild(displayText);

  var dropdown = document.createElement('div');
  dropdown.className = 'reg-dropdown';

  var searchWrap = document.createElement('div');
  searchWrap.className = 'reg-search-wrap';
  var searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.className = 'reg-search';
  searchInp.placeholder = 'Поиск региона...';
  searchWrap.appendChild(searchInp);

  var list = document.createElement('div');
  list.className = 'reg-list';

  var noRes = document.createElement('div');
  noRes.className = 'reg-opt no-results hidden';
  noRes.textContent = 'Ничего не найдено';
  list.appendChild(noRes);

  regions.forEach(function(t){
    var opt = document.createElement('div');
    opt.className = 'reg-opt' + (t.Column1 === selVal ? ' selected' : '');
    opt.dataset.val = t.Column1;
    opt.textContent = t.Column2;
    opt.onclick = function(){
      selVal = t.Column1;
      displayText.textContent = t.Column2;
      display.classList.remove('placeholder');
      list.querySelectorAll('.reg-opt').forEach(function(o){ o.classList.remove('selected'); });
      opt.classList.add('selected');
      closeDropdown();
      onChange(t.Column1);
    };
    list.appendChild(opt);
  });

  dropdown.appendChild(searchWrap);
  dropdown.appendChild(list);
  wrap.appendChild(display);
  wrap.appendChild(dropdown);

  function openDropdown() {
    wrap.classList.add('open');
    searchInp.value = '';
    filterList('');
    var sel = list.querySelector('.selected');
    if (sel) setTimeout(function(){ sel.scrollIntoView({ block: 'nearest' }); }, 0);
    setTimeout(function(){ searchInp.focus(); }, 0);
  }
  function closeDropdown() {
    wrap.classList.remove('open');
  }
  function filterList(q) {
    q = q.toLowerCase();
    var opts = list.querySelectorAll('.reg-opt:not(.no-results)');
    var visible = 0;
    opts.forEach(function(o){
      var match = o.textContent.toLowerCase().indexOf(q) !== -1;
      o.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    noRes.classList.toggle('hidden', visible > 0);
  }

  display.onclick = function(){ wrap.classList.contains('open') ? closeDropdown() : openDropdown(); };
  display.onkeydown = function(e){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
    if (e.key === 'Escape') closeDropdown();
  };
  searchInp.oninput = function(){ filterList(searchInp.value); };
  searchInp.onkeydown = function(e){ if (e.key === 'Escape') closeDropdown(); };

  document.addEventListener('click', function(e){
    if (!wrap.contains(e.target)) closeDropdown();
  });

  return wrap;
}

// Эффективный tariffId для Solo: если карточка с вариантами — durId, иначе cardId
function soloEffId() {
  if (!S.solo.cardId) return null;
  const card = TARIFF_CARDS.find(function(c){ return c.id === S.solo.cardId; });
  if (card && card.durations) return S.solo.durId; // null если срок не выбран
  return S.solo.cardId;
}

// ── Загрузка ──────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res  = await fetch('Цены АО5 для Калькулятора.json');
    const text = await res.text();
    DATA = JSON.parse('[' + text + ']').filter(function(t){ return t.Column1 && /^\d/.test(String(t.Column1)); });
    DMAP = Object.fromEntries(DATA.map(function(t){ return [t.Column1, t]; }));

    var lm = $('loading-msg'); if(lm) lm.remove();
    $('addons-wrap').style.display = '';
    $('btn-pdf').disabled = false;

    ['c-org','c-name','c-client','c-phone','c-email'].forEach(function(id){
      var el=$(id), sv=localStorage.getItem('ao5_'+id);
      if(sv && el) el.value=sv;
      if(el) el.oninput=function(e){ localStorage.setItem('ao5_'+id, e.target.value); };
    });
    render();
  } catch(e) {
    $('loading-msg').textContent = '❌ Ошибка загрузки: '+e.message;
    console.error(e);
  }
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  var dyn = $('dyn'); dyn.innerHTML = '';
  if      (S.top==='solo') renderSolo(dyn);
  else if (S.top==='gk')   renderGK(dyn);
  else                     renderUB(dyn);
  calc();
}

// ── Solo ──────────────────────────────────────────────────────────────────
function renderSolo(dyn) {
  var n = $('tpl-solo').content.cloneNode(true);
  // Заменяем нативный select на кастомный с поиском
  var regSel = n.getElementById('sol-reg');
  var regWrap = buildRegSelect(S.solo.reg, function(val){
    S.solo.reg = val; refreshTariffCards(); refreshAddonRows(); calc();
  });
  regSel.parentNode.replaceChild(regWrap, regSel);
  n.querySelectorAll('#sol-own .tb').forEach(function(b){
    b.classList.toggle('active', b.dataset.v===S.solo.own);
    b.onclick=function(){
      S.solo.own=b.dataset.v;
      // Если выбранная карточка недоступна для нового типа — сбрасываем
      if (S.solo.cardId) {
        var card=TARIFF_CARDS.find(function(c){ return c.id===S.solo.cardId; });
        if (!card || !card.owns.includes(S.solo.own)) { S.solo.cardId=null; S.solo.durId=null; }
      }
      document.querySelectorAll('#sol-own .tb').forEach(function(x){ x.classList.toggle('active',x.dataset.v===S.solo.own); });
      refreshTariffCards(); refreshAddonRows(); calc();
    };
  });
  dyn.appendChild(n);
  refreshTariffCards();
  refreshAddonRows();
}

// Скрывает/показывает строки доп. расширений в зависимости от типа организации (Solo)
function refreshAddonRows() {
  if (S.top !== 'solo') return;
  var rowIp = document.getElementById('vrow-ext-ip');
  var rowUl = document.getElementById('vrow-ext-ul');
  if (rowIp) rowIp.style.display = S.solo.own === 'ip' ? '' : 'none';
  if (rowUl) rowUl.style.display = S.solo.own === 'ul' ? '' : 'none';
}

function refreshTariffCards() {
  var cont=$('sol-tariffs'); if(!cont) return;
  var row=DMAP[S.solo.reg]||null;
  var list=TARIFF_CARDS.filter(function(c){ return c.owns.includes(S.solo.own); });

  cont.innerHTML = list.map(function(card){
    var isActive = S.solo.cardId === card.id;

    // Цена: для карточки без вариантов — одна цена; для Оптимального — «от … до …»
    var priceHtml = '';
    if (card.durations) {
      if (!row) {
        priceHtml = '<div class="tc-price no-reg">выберите регион</div>';
      } else {
        var prices = card.durations.map(function(d){ return tariffPrice(row,d.id,S.solo.own); }).filter(function(v){ return v>0; });
        if (!prices.length) {
          priceHtml='<div class="tc-price no-reg">нет цены</div>';
        } else {
          var mn=Math.min.apply(null,prices), mx=Math.max.apply(null,prices);
          priceHtml = mn===mx
            ? '<div class="tc-price">'+fmt(mn)+'</div>'
            : '<div class="tc-price">от '+fmt(mn)+'<span class="tc-price-to"> до '+fmt(mx)+'</span></div>';
        }
      }
    } else {
      var pr = row ? tariffPrice(row,card.id,S.solo.own) : 0;
      priceHtml = '<div class="tc-price'+(pr?'':' no-reg')+'">'+(pr?fmt(pr):'выберите регион')+'</div>';
    }

    // Блок срока — только если карточка активна и есть варианты
    var durBlock = '';
    if (isActive && card.durations) {
      durBlock = '<div class="tc-dur-wrap">' +
        card.durations.map(function(d){
          var pr2 = row ? tariffPrice(row,d.id,S.solo.own) : 0;
          return '<div class="tc-dur-opt'+(S.solo.durId===d.id?' active':'')+'"'+
            ' onclick="event.stopPropagation();CalcApp.selectDuration(\''+d.id+'\')">'+
            '<span class="dur-m">'+d.label+'</span>'+
            '<span class="dur-p">'+(pr2?fmt(pr2):'—')+'</span>'+
            '</div>';
        }).join('') +
        '</div>';
    }

    return '<div class="tariff-card'+(isActive?' active':'')+'" onclick="CalcApp.selectCard(\''+card.id+'\')">'+
      '<div class="tc-name">'+card.name+'</div>'+
      '<div class="tc-sub">'+card.sub+'</div>'+
      priceHtml+
      durBlock+
      '</div>';
  }).join('');
}

// ── GK ────────────────────────────────────────────────────────────────────
function renderGK(dyn) {
  var n=$('tpl-gk').content.cloneNode(true);
  dyn.appendChild(n);
  document.querySelectorAll('#gk-tabs .inner-tab').forEach(function(b){
    b.classList.toggle('active',b.dataset.m===S.gkMode);
    b.onclick=function(){
      S.gkMode=b.dataset.m;
      document.querySelectorAll('#gk-tabs .inner-tab').forEach(function(x){ x.classList.toggle('active',x.dataset.m===S.gkMode); });
      renderGKInner();
    };
  });
  renderGKInner();
}

function renderGKInner() {
  var inner=$('gk-inner'); if(!inner) return;
  inner.innerHTML='';
  if(S.gkMode==='fast') renderFast(inner);
  else renderDetailed(inner, S.gkMode==='addon');
  calc();
}

function renderFast(cont) {
  var n=$('tpl-fast').content.cloneNode(true);
  var tr=n.getElementById('gk-tariff-row'); if(tr) tr.style.display='none';

  var rows=n.getElementById('fr-rows');
  S.fast.rows.forEach(function(r){
    var d=document.createElement('div'); d.className='ft-row';
    var regWrap = buildRegSelect(r.reg, function(val){ CalcApp.updFast(r.id,'reg',val); });
    var ulInp=document.createElement('input'); ulInp.type='number'; ulInp.value=r.ul; ulInp.min='0'; ulInp.placeholder='0';
    ulInp.oninput=function(){ CalcApp.updFast(r.id,'ul',this.value); };
    ulInp.onkeydown=function(e){ if(['-','e','E',',','.'].includes(e.key)) e.preventDefault(); };
    var ipInp=document.createElement('input'); ipInp.type='number'; ipInp.value=r.ip; ipInp.min='0'; ipInp.placeholder='0';
    ipInp.oninput=function(){ CalcApp.updFast(r.id,'ip',this.value); };
    ipInp.onkeydown=function(e){ if(['-','e','E',',','.'].includes(e.key)) e.preventDefault(); };
    var rmBtn=document.createElement('button'); rmBtn.className='btn-rm'; rmBtn.innerHTML='&times;';
    rmBtn.onclick=function(){ CalcApp.rmFast(r.id); };
    d.appendChild(regWrap); d.appendChild(ulInp); d.appendChild(ipInp); d.appendChild(rmBtn);
    rows.appendChild(d);
  });
  n.getElementById('btn-add-fast').onclick=CalcApp.addFast;
  cont.appendChild(n);
}

function renderDetailed(cont, showExist) {
  var n=$('tpl-detailed').content.cloneNode(true);
  if(showExist){ n.getElementById('ex-row').style.display='flex'; n.getElementById('ex-cnt').value=S.det.exist; }
  var cards=n.getElementById('det-cards');

  S.det.cards.forEach(function(c, idx){
    var wrap=document.createElement('div'); wrap.className='cc'; wrap.dataset.cid=c.id;

    // Кнопка удаления
    if(idx>0){
      var rb=document.createElement('button'); rb.className='cc-remove'; rb.innerHTML='&times;';
      rb.style.display='flex';
      rb.onclick=function(){ CalcApp.rmDet(c.id); };
      wrap.appendChild(rb);
    }

    // Название + ИНН
    var row1=document.createElement('div'); row1.className='g2'; row1.style.marginBottom='10px';
    var inpName=document.createElement('input'); inpName.type='text'; inpName.className='cc-inner-input';
    inpName.placeholder='Название компании'; inpName.value=c.name;
    inpName.oninput=function(e){ var x=getCard(c.id); if(x) x.name=e.target.value; };
    var inpInn=document.createElement('input'); inpInn.type='text'; inpInn.className='cc-inner-input';
    inpInn.placeholder='ИНН'; inpInn.value=c.inn;
    inpInn.oninput=function(e){ var x=getCard(c.id); if(x) x.inn=e.target.value; };
    row1.appendChild(inpName); row1.appendChild(inpInn); wrap.appendChild(row1);

    // Регион + ЮЛ/ИП
    var row2=document.createElement('div'); row2.className='g2'; row2.style.marginBottom='10px';
    var regWrap2=buildRegSelect(c.reg, (function(cid){ return function(val){ var x=getCard(cid); if(x){ x.reg=val; calc(); } }; })(c.id));
    var tg=document.createElement('div'); tg.className='tg cc-own';
    ['ul','ip'].forEach(function(v){
      var b=document.createElement('button'); b.className='tb'+(c.own===v?' active':'');
      b.dataset.v=v; b.textContent=v==='ul'?'ЮЛ':'ИП / ФЛ';
      b.onclick=function(){ var x=getCard(c.id); if(!x) return; x.own=v; renderGKInner(); };
      tg.appendChild(b);
    });
    row2.appendChild(regWrap2); row2.appendChild(tg); wrap.appendChild(row2);

    // Доп. направления — раскрывающийся блок
    var extBtn=document.createElement('button'); extBtn.className='cc-ext-toggle';
    extBtn.type='button';
    extBtn.innerHTML=(c.extOpen?'▾':'▸')+' Доп. направления';
    var extBody=document.createElement('div'); extBody.className='cc-ext-body'+(c.extOpen?' open':'');
    extBtn.onclick=function(){
      var x=getCard(c.id); if(!x) return;
      x.extOpen=!x.extOpen;
      extBtn.innerHTML=(x.extOpen?'▾':'▸')+' Доп. направления';
      extBody.classList.toggle('open', x.extOpen);
    };

    var extGrid=document.createElement('div'); extGrid.className='cc-ext-grid';
    EXT_DEFS.forEach(function(ef){
      var row3=document.createElement('div'); row3.className='cc-ext-row';
      var sp=document.createElement('span'); sp.textContent=ef.label;
      var inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.placeholder='0';
      inp.value=c[ef.field]||0;
      inp.onkeydown=function(e){ if(['-','e','E',',','.'].includes(e.key)) e.preventDefault(); };
      inp.oninput=(function(field){ return function(e){ var x=getCard(c.id); if(x){ x[field]=parseInt(e.target.value)||0; calc(); } }; })(ef.field);
      row3.appendChild(sp); row3.appendChild(inp);
      extGrid.appendChild(row3);
    });
    extBody.appendChild(extGrid);
    wrap.appendChild(extBtn); wrap.appendChild(extBody);

    cards.appendChild(wrap);
  });

  n.getElementById('btn-add-det').onclick=CalcApp.addDet;
  cont.appendChild(n);
}

function getCard(id){ return S.det.cards.find(function(c){ return c.id===id; }); }

// ── УБ ────────────────────────────────────────────────────────────────────
function renderUB(dyn) {
  var n=$('tpl-ub').content.cloneNode(true);
  var ubRegSel = n.getElementById('ub-reg');
  var ubRegWrap = buildRegSelect(S.ub.reg, function(val){ S.ub.reg = val; calc(); });
  ubRegSel.parentNode.replaceChild(ubRegWrap, ubRegSel);

  var ubOrgs = n.getElementById('ub-orgs');
  if (ubOrgs) {
    var orgRow = ubOrgs.closest('.frow');
    if (orgRow && orgRow.parentNode) orgRow.parentNode.removeChild(orgRow);
  }

  var ubReports = n.getElementById('ub-reports');
  if (ubReports) {
    var repRow = ubReports.closest('.frow');
    var repLabel = repRow ? repRow.querySelector('label') : null;
    if (repLabel) repLabel.textContent = 'Количество отчётов в квартал';
  }
  n.getElementById('ub-reports').value=S.ub.reports;
  n.getElementById('ub-reports').oninput=function(e){ S.ub.reports=parseInt(e.target.value)||0; calc(); };
  dyn.appendChild(n);
}

// ── Calc ──────────────────────────────────────────────────────────────────
function calc() {
  var priceEl=$('r-price'), discEl=$('r-disc'), detailEl=$('det-body');
  if(!priceEl) return;

  var total=0, lines=[], gkBase=0, gkDisc=0, baseTotal=0;

  if(S.top==='solo'){
    discEl.textContent='';
    var row=DMAP[S.solo.reg];
    var effId=soloEffId();
    if(row && effId){
      var pr=tariffPrice(row,effId,S.solo.own);
      if(pr){
        total+=pr;
        var card=TARIFF_CARDS.find(function(c){ return c.id===S.solo.cardId; });
        var durOpt=card&&card.durations&&card.durations.find(function(d){ return d.id===effId; });
        var tName=card?card.name:effId;
        var durLbl=durOpt?' · '+durOpt.label:'';
        lines.push(tName+durLbl+' | '+S.solo.own.toUpperCase()+' | '+row.Column2+' | '+fmt(pr));
      } else {
        lines.push('Выбранный тариф недоступен для данного типа организации.');
      }
    } else if(!S.solo.cardId){
      lines.push('Выберите тариф для расчёта.');
    } else if(!row){
      lines.push('Выберите регион.');
    } else {
      lines.push('Выберите срок тарифа.');
    }

  } else if(S.top==='gk'){
    var cnt=
      S.gkMode==='addon' ? S.det.exist+S.det.cards.length :
      S.gkMode==='fast'  ? S.fast.rows.reduce(function(a,r){ return a+(r.ul||0)+(r.ip||0); },0) :
                           S.det.cards.length;

    if(cnt<3){
      detailEl.innerText='Нужно минимум 3 организации.';
      priceEl.textContent='Мин. 3 орг.'; discEl.textContent=''; return;
    }
    var keys=gkRange(cnt);
    if(!keys){ detailEl.innerText='Ошибка диапазона ГК.'; return; }
    var rangeLbl='ГК '+gkLabel(cnt)+' орг.';

    if(S.gkMode==='fast'){
      S.fast.rows.forEach(function(r){
        var row2=DMAP[r.reg]; if(!row2) return;
        if(r.ul>0){ var gp=p(row2,keys.ul); total+=gp*r.ul; gkDisc+=gp*r.ul; lines.push('ЮЛ · '+row2.Column2+' | '+rangeLbl+' | '+fmt(gp)+' × '+r.ul+' = '+fmt(gp*r.ul)); }
        if(r.ip>0){ var gp2=p(row2,keys.ip); total+=gp2*r.ip; gkDisc+=gp2*r.ip; lines.push('ИП · '+row2.Column2+' | '+rangeLbl+' | '+fmt(gp2)+' × '+r.ip+' = '+fmt(gp2*r.ip)); }
      });
    } else {
      S.det.cards.forEach(function(c){
        var row3=DMAP[c.reg]; if(!row3) return;
        var gp3=p(row3,keys[c.own]); total+=gp3; gkDisc+=gp3;
        var lbl=c.name||'Организация';
        lines.push(lbl+' | '+c.own.toUpperCase()+' · '+row3.Column2+' | '+rangeLbl+' | '+fmt(gp3));
        EXT_DEFS.forEach(function(ef){
          var cnt2=c[ef.field]||0; if(!cnt2) return;
          var pr2=p(row3,ef.col); total+=pr2*cnt2;
          lines.push('  ↳ '+ef.label+' | '+fmt(pr2)+' × '+cnt2+' = '+fmt(pr2*cnt2));
        });
      });
    }
    var pct=gkBase>0?Math.round(((gkBase-gkDisc)/gkBase)*100):0;
    discEl.textContent=pct>0?'Скидка ГК: '+pct+'%':'';

  } else {
    discEl.textContent='';
    var ubRow=DMAP[S.ub.reg];
    if(ubRow){
      var lic=p(ubRow,'Уполномоченная бухгалтерия'); total+=lic;
      lines.push('\u041b\u0438\u0446\u0435\u043d\u0437\u0438\u044f \u0423\u0411 (\u0432 \u0433\u043e\u0434) \u00b7 '+ubRow.Column2+' | '+fmt(lic));
      var rc=S.ub.reports||0;
      if(rc>0){
        var rk=rc<=200?'Column35':rc<=500?'Column36':rc<=1000?'Column37':'Column38';
        var rate=p(ubRow,rk), minP=p(ubRow,'Column39'), rawFee=rate*rc, fee=Math.max(rawFee,minP);
        var minNote=(minP>0&&rawFee<minP)?' (\u043c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043b\u0430\u0442\u0451\u0436 \u0437\u0430 \u043a\u0432\u0430\u0440\u0442\u0430\u043b)':'';
        total+=fee; lines.push('\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u043e\u0442\u0447\u0451\u0442\u043e\u0432 (\u0432 \u043a\u0432\u0430\u0440\u0442\u0430\u043b) \u00b7 '+rc+' \u0448\u0442. \u00d7 '+fmt(rate)+' | '+fmt(fee)+minNote);
      }
      var info=$('ub-info');
      if(info){
        var r35=p(ubRow,'Column35'),r36=p(ubRow,'Column36'),r37=p(ubRow,'Column37'),r38=p(ubRow,'Column38'),r39=p(ubRow,'Column39');
        info.style.display='';
        info.innerHTML='<b>\u0421\u0442\u0430\u0432\u043a\u0438 \u0437\u0430 \u043e\u0442\u0447\u0451\u0442 (\u0432 \u043a\u0432\u0430\u0440\u0442\u0430\u043b) \u00b7 '+ubRow.Column2+':</b><br>'+
          '1\u2013200: <b>'+fmt(r35)+'</b>/\u043e\u0442\u0447. &nbsp;\u00b7&nbsp; 201\u2013500: <b>'+fmt(r36)+'</b>/\u043e\u0442\u0447. &nbsp;\u00b7&nbsp; 501\u20131000: <b>'+fmt(r37)+'</b>/\u043e\u0442\u0447. &nbsp;\u00b7&nbsp; 1001+: <b>'+fmt(r38)+'</b>/\u043e\u0442\u0447.<br>'+
          '\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043b\u0430\u0442\u0451\u0436: <b>'+fmt(r39)+'</b>/\u043a\u0432\u0430\u0440\u0442\u0430\u043b';
      }
    } else {
      lines.push('Выберите регион для расчёта.');
      var info2=$('ub-info'); if(info2) info2.style.display='none';
    }
  }

  // Глобальные расширения (Solo и UB, а также GK Fast)
  if(S.top!=='gk' || S.gkMode==='fast'){
    baseTotal = total; // скидка только на основную лицензию
    total+=calcGlobalExt(lines);
  } else {
    baseTotal = total;
  }

  // Доп. скидка — применяется только к основной лицензии
  var dv=parseFloat($('disc-val')&&$('disc-val').value)||0;
  var dt=($('disc-type')&&$('disc-type').value)||'pct';
  if(dv>0&&baseTotal>0){
    var da=dt==='pct'?baseTotal*(dv/100):Math.min(dv,baseTotal);
    lines.push('\nДоп. скидка '+(dt==='pct'?dv+'%':'(руб)')+' | −'+fmt(da));
    total=Math.max(0,total-da);
  }

  detailEl.innerText=lines.length?lines.join('\n'):'Введите данные для расчёта...';
  priceEl.textContent=fmt(total);
}

function calcGlobalExt(lines){
  if(!$('adn-ext')||!$('adn-ext').classList.contains('on')) return 0;
  var regCode=S.top==='solo'?S.solo.reg:S.top==='ub'?S.ub.reg:(S.fast.rows[0]&&S.fast.rows[0].reg||'');
  var row=DMAP[regCode]||null; var add=0;
  GLOBAL_EXT.forEach(function(e){
    var el=document.getElementById(e.id); var cnt=parseInt(el&&el.value)||0;
    if(cnt>0){ var pr=p(row,e.col); add+=pr*cnt; lines.push(e.label+' | '+fmt(pr)+' × '+cnt+' = '+fmt(pr*cnt)); }
  });
  return add;
}

// PDF
function initPDF() {
  var pdfBtn = $('btn-pdf');
  if (!pdfBtn) return;
  pdfBtn.onclick = async function() {
    pdfBtn.disabled = true;
    var originalText = pdfBtn.textContent;
    pdfBtn.textContent = 'Формируем PDF...';
    try {
      await buildPDF();
    } catch (e) {
      console.error('Ошибка PDF:', e);
      alert('Ошибка PDF: ' + e.message);
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = originalText;
    }
  };
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPdfAssets(mode) {
  var assets = document.getElementById('calc-assets');
  if (!assets) throw new Error('Не найден блок ассетов #calc-assets');
  var prefix = mode === 'ub' ? 'ub' : 'main';
  var headerSrc = assets.getAttribute('data-' + prefix + '-header-src') || '';
  var footerSrcs = [];
  for (var i = 1; i <= 7; i++) {
    var src = assets.getAttribute('data-' + prefix + '-footer-src-' + i);
    if (src) footerSrcs.push(src);
  }
  return { headerSrc: headerSrc, footerSrcs: footerSrcs };
}

async function buildPDF() {
  var jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFClass) throw new Error('jsPDF не найден');
  if (typeof html2canvas === 'undefined') throw new Error('html2canvas не найден');

  var mode = S.top === 'ub' ? 'ub' : 'main';
  var assets = getPdfAssets(mode);

  var PAGE_W = 794;
  var PAGE_H = 1122;
  var PAD = 50;
  var BOTTOM_PAD = 25;
  var FOOTER_GAP = 25;
  var ACCENT = '#008ec0';
  var MF = "font-family:'Nunito',sans-serif;box-sizing:border-box;";

  var totalText = (($('r-price') && $('r-price').innerText) || '').trim();
  var discText = (($('r-disc') && $('r-disc').innerText) || '').trim();
  var clientName = (($('c-client') && $('c-client').value) || '').trim();
  var partnerOrg = (($('c-org') && $('c-org').value) || '').trim();
  var managerName = (($('c-name') && $('c-name').value) || '').trim();
  var managerPhone = (($('c-phone') && $('c-phone').value) || '').trim();
  var managerEmail = (($('c-email') && $('c-email').value) || '').trim();
  var lines = ((($('det-body') && $('det-body').innerText) || '')
    .split('\n')
    .map(function(s){ return s.trim(); })
    .filter(Boolean));


  var waitImg = function(img) {
    return new Promise(function(res) {
      if (!img.src) return res();
      if (img.complete && img.naturalHeight > 0) return res();
      img.onload = img.onerror = res;
    });
  };
  var mount = function(el) {
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '-9999px';
    el.style.zIndex = '-1';
    document.body.appendChild(el);
  };
  var unmount = function(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  var toCanvas = function(el) {
    return html2canvas(el, {
      scale: 5,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: PAGE_W,
      windowWidth: PAGE_W
    });
  };
  var measureHeight = function(html) {
    var div = document.createElement('div');
    div.style.cssText = 'width:' + PAGE_W + 'px;position:absolute;top:0;left:-9999px;visibility:hidden;';
    div.innerHTML = html;
    document.body.appendChild(div);
    var h = div.getBoundingClientRect().height;
    document.body.removeChild(div);
    return h;
  };

  var rowHTML = function(line) {
    if (line.indexOf('|') === -1) {
      return '<tr><td colspan="2" style="padding:3px 0;font-size:9pt;color:#999;' + MF + '">' + escHtml(line) + '</td></tr>';
    }
    var parts = line.split('|').map(function(x){ return x.trim(); }).filter(Boolean);
    if (!parts.length) return '';
    var price = parts[parts.length - 1];
    var label = parts.slice(0, -1).join(' | ');
    return '<tr>' +
      '<td style="padding:5px 0;border-bottom:1px solid #eee;font-size:9.5pt;color:#444;' + MF + '">' + escHtml(label) + '</td>' +
      '<td style="padding:5px 0;border-bottom:1px solid #eee;text-align:right;font-weight:800;color:' + ACCENT + ';font-size:9.5pt;white-space:nowrap;' + MF + '">' + escHtml(price) + '</td>' +
      '</tr>';
  };

  var summaryText = mode === 'ub'
    ? 'Лицензия'
    : (clientName ? 'Стоимость для ' + clientName + ':' : 'Итоговая стоимость:');

  var summaryHTML = function() {
    var disc = discText
      ? '<div style="color:#2ca35c;font-size:11px;font-weight:800;margin-top:3px;">' + escHtml(discText) + '</div>'
      : '';
    return '<div style="background:#c9edf9;padding:15px 20px;border-radius:12px;text-align:center;margin-top:15px;' + MF + '">' +
      '<div style="font-size:13px;color:#3e4a50;margin-bottom:5px;">' + escHtml(summaryText) + '</div>' +
      '<div style="font-size:24px;line-height:1.1;font-weight:900;color:' + ACCENT + ';">' + escHtml(totalText) + '</div>' +
      disc +
      '</div>';
  };

  var contactHTML = function() {
    var nm = managerName || 'Не указано';
    var ph = managerPhone || '';
    var em = managerEmail || '';
    return '<div style="margin-top:10px;padding:15px 20px;border:1px solid #ddd;border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;' + MF + '">' +
      '<div style="flex:1;">' +
        '<div style="font-size:16px;color:' + ACCENT + ';font-weight:900;line-height:1;">Ваш менеджер</div>' +
        '<div style="font-size:13px;color:#333;font-weight:700;line-height:1.2;margin-top:2px;">' + escHtml(nm) + '</div>' +
        (ph ? '<div style="font-size:13px;color:#333;line-height:1.2;">' + escHtml(ph) + '</div>' : '') +
        (em ? '<div style="font-size:12px;color:#666;line-height:1.2;">' + escHtml(em) + '</div>' : '') +
        (partnerOrg ? '<div style="font-size:12px;color:#666;line-height:1.2;">' + escHtml(partnerOrg) + '</div>' : '') +
      '</div>' +
      '<a class="pdf-service-link" href="https://astral.ru/products/astral-otchet-5-0/?utm_source=kp&utm_medium=clients" target="_blank" rel="noopener noreferrer" style="background:#b6e8f7;color:' + ACCENT + ';padding:8px 14px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap;text-decoration:none;display:inline-block;">Подробнее о сервисе →</a>' +
      '</div>';
  };

  var makeFooterImgsHTML = function(from, count, naturalSizes, scaleFactor) {
    var contentWidth = PAGE_W - PAD * 2;
    var footerScale = scaleFactor || 1;
    var items = assets.footerSrcs.slice(from, from + count).map(function(src, idx) {
      var nat = naturalSizes[from + idx];
      var imgW = (nat && nat.w) ? Math.min(Math.round(nat.w / footerScale), contentWidth) : contentWidth;
      var isLast = idx === count - 1;
      return '<div style="margin-bottom:' + (isLast ? 0 : FOOTER_GAP) + 'px;">' +
        '<img src="' + src + '" crossorigin="anonymous" style="display:block;width:' + imgW + 'px;height:auto;">' +
        '</div>';
    }).join('');
    return '<div style="padding:0 ' + PAD + 'px;box-sizing:border-box;">' + items + '</div>';
  };

  var headerDiv = document.createElement('div');
  headerDiv.style.cssText = 'width:' + PAGE_W + 'px;background:#fff;';
  var headerNaturalW = PAGE_W;
  if (assets.headerSrc) {
    var headerImg = document.createElement('img');
    headerImg.src = assets.headerSrc;
    headerImg.style.cssText = 'width:' + PAGE_W + 'px;display:block;';
    headerDiv.appendChild(headerImg);
  }
  mount(headerDiv);
  await Promise.all(Array.from(headerDiv.querySelectorAll('img')).map(waitImg));
  await new Promise(function(r){ setTimeout(r, 100); });
  if (assets.headerSrc && headerDiv.querySelector('img')) {
    var loadedHeader = headerDiv.querySelector('img');
    if (loadedHeader && loadedHeader.naturalWidth) headerNaturalW = loadedHeader.naturalWidth;
  }
  var canvasHeader = await toCanvas(headerDiv);
  unmount(headerDiv);
  var headerH = Math.round(PAGE_W * canvasHeader.height / canvasHeader.width);
  var ASSET_SCALE = headerNaturalW / PAGE_W;
  if (!isFinite(ASSET_SCALE) || ASSET_SCALE < 1) ASSET_SCALE = 1;

  var contentWidth = PAGE_W - PAD * 2;
  var footerNaturalSizes = await Promise.all(assets.footerSrcs.map(function(src) {
    return new Promise(function(res) {
      var img = new Image();
      img.onload = function(){ res({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function(){ res({ w: 0, h: 0 }); };
      img.src = src;
    });
  }));
  var footerDisplayHeights = footerNaturalSizes.map(function(sz) {
    if (!sz.w) return 0;
    var dw = Math.min(Math.round(sz.w / ASSET_SCALE), contentWidth);
    return Math.round(sz.h * dw / sz.w);
  });

  var titleH = measureHeight('<div style="padding:20px ' + PAD + 'px 0;' + MF + '"><h2 style="color:' + ACCENT + ';font-size:15px;margin:0 0 10px 0;font-weight:800;">Стоимость подключения:</h2></div>');

  var rowHeights = lines.map(function(line) {
    return measureHeight('<div style="width:' + PAGE_W + 'px;padding:0 ' + PAD + 'px;box-sizing:border-box;' + MF + '"><table style="width:100%;border-collapse:collapse;"><tbody>' + rowHTML(line) + '</tbody></table></div>');
  });

  var summaryOnlyHTML = '<div style="padding:0 ' + PAD + 'px 10px;' + MF + '">' + summaryHTML() + '</div>';
  var contactOnlyHTML = '<div style="padding:0 ' + PAD + 'px 10px;' + MF + '">' + contactHTML() + '</div>';
  var summaryBlockHTML = '<div style="padding:0 ' + PAD + 'px 10px;' + MF + '">' + summaryHTML() + contactHTML() + '</div>';

  var summaryOnlyH = measureHeight(summaryOnlyHTML);
  var contactOnlyH = measureHeight(contactOnlyHTML);
  var summaryBlockH = summaryOnlyH + contactOnlyH;

  var availableP1 = PAGE_H - headerH - 30;
  var availableRest = PAGE_H - 30;
  var pages = [];
  var remaining = lines.slice();
  var isFirstPage = true;

  while (remaining.length > 0 || pages.length === 0) {
    var available = isFirstPage ? availableP1 : availableRest;
    var overhead = isFirstPage ? titleH : 30;
    var used = overhead;
    var pageLines = [];

    for (var li = 0; li < remaining.length; li++) {
      var rowIdx = lines.length - remaining.length + li;
      if (used + rowHeights[rowIdx] <= available) {
        used += rowHeights[rowIdx];
        pageLines.push(remaining[li]);
      } else {
        break;
      }
    }
    if (!pageLines.length && remaining.length) {
      pageLines.push(remaining[0]);
      used += rowHeights[lines.length - remaining.length];
    }

    remaining = remaining.slice(pageLines.length);
    var isLast = remaining.length === 0;
    var summaryOnThisPage = false;
    if (isLast) {
      if (used + summaryBlockH <= available) summaryOnThisPage = 'full';
      else if (used + summaryOnlyH <= available) summaryOnThisPage = 'summary-only';
    }

    var addedH = summaryOnThisPage === 'full' ? summaryBlockH : (summaryOnThisPage === 'summary-only' ? summaryOnlyH : 0);
    pages.push({ lines: pageLines, isFirst: isFirstPage, isLast: isLast, summaryOnThisPage: summaryOnThisPage, usedH: used + addedH });
    isFirstPage = false;
    if (isLast) break;
  }

  var lastPage = pages[pages.length - 1];
  if (!lastPage.summaryOnThisPage) {
    if (summaryBlockH + 30 <= availableRest) {
      pages.push({ lines: [], isFirst: false, isLast: true, summaryOnThisPage: 'full', usedH: summaryBlockH + 30 });
    } else {
      pages.push({ lines: [], isFirst: false, isLast: false, summaryOnThisPage: 'summary-only', usedH: summaryOnlyH + 30 });
      pages.push({ lines: [], isFirst: false, isLast: true, summaryOnThisPage: 'contact-only', usedH: contactOnlyH + 30 });
    }
  } else if (lastPage.summaryOnThisPage === 'summary-only') {
    pages.push({ lines: [], isFirst: false, isLast: true, summaryOnThisPage: 'contact-only', usedH: contactOnlyH + 30 });
  }

  var finalPage = pages[pages.length - 1];
  var availableForFooter = (finalPage.isFirst ? availableP1 : availableRest) - finalPage.usedH - BOTTOM_PAD;
  var footerOnLastPage = 0;
  var accumulated = 0;
  for (var fi = 0; fi < footerDisplayHeights.length; fi++) {
    if (!footerDisplayHeights[fi]) continue;
    var gap = footerOnLastPage > 0 ? FOOTER_GAP : 0;
    if (accumulated + gap + footerDisplayHeights[fi] <= availableForFooter) {
      accumulated += gap + footerDisplayHeights[fi];
      footerOnLastPage = fi + 1;
    } else {
      break;
    }
  }
  var footerOnExtraPage = assets.footerSrcs.length - footerOnLastPage;

  var canvases = [];
  var linkRects = [];
  for (var pi = 0; pi < pages.length; pi++) {
    var pg = pages[pi];
    var isLastPg = pi === pages.length - 1;
    var div = document.createElement('div');
    div.style.cssText = 'width:' + PAGE_W + 'px;background:#fff;';
    var tableRows = pg.lines.map(rowHTML).join('');
    var tableHTML = tableRows
      ? '<div style="padding:' + (pg.isFirst ? '20px' : '30px') + ' ' + PAD + 'px 0;' + MF + '">' +
          (pg.isFirst ? '<h2 style="color:' + ACCENT + ';font-size:15px;margin:0 0 10px 0;font-weight:800;">Стоимость подключения:</h2>' : '') +
          '<table style="width:100%;border-collapse:collapse;"><tbody>' + tableRows + '</tbody></table>' +
        '</div>'
      : '';

    var summaryRendered = '';
    if (pg.summaryOnThisPage === 'full') summaryRendered = summaryBlockHTML;
    else if (pg.summaryOnThisPage === 'summary-only') summaryRendered = summaryOnlyHTML;
    else if (pg.summaryOnThisPage === 'contact-only') summaryRendered = contactOnlyHTML;

    var footerHTML = (isLastPg && footerOnLastPage > 0)
      ? '<div style="margin-top:' + BOTTOM_PAD + 'px;">' + makeFooterImgsHTML(0, footerOnLastPage, footerNaturalSizes, ASSET_SCALE) + '</div>'
      : '';
    div.innerHTML = tableHTML + summaryRendered + footerHTML;

    mount(div);
    await Promise.all(Array.from(div.querySelectorAll('img')).map(waitImg));
    var linkRect = null;
    var linkEl = div.querySelector('.pdf-service-link');
    if (linkEl) {
      var hostRect = div.getBoundingClientRect();
      var anchorRect = linkEl.getBoundingClientRect();
      linkRect = {
        x: anchorRect.left - hostRect.left,
        y: anchorRect.top - hostRect.top,
        w: anchorRect.width,
        h: anchorRect.height
      };
    }
    await new Promise(function(r){ setTimeout(r, 150); });
    var canvas = await toCanvas(div);
    canvases.push(canvas);
    linkRects.push(linkRect);
    unmount(div);
  }

  var canvasExtraFooter = null;
  if (footerOnExtraPage > 0) {
    var divF = document.createElement('div');
    divF.style.cssText = 'width:' + PAGE_W + 'px;background:#fff;padding-top:40px;box-sizing:border-box;';
    divF.innerHTML = makeFooterImgsHTML(footerOnLastPage, footerOnExtraPage, footerNaturalSizes, ASSET_SCALE);
    mount(divF);
    await Promise.all(Array.from(divF.querySelectorAll('img')).map(waitImg));
    await new Promise(function(r){ setTimeout(r, 150); });
    canvasExtraFooter = await toCanvas(divF);
    unmount(divF);
  }

  if (!canvases.length) throw new Error('Не удалось сформировать страницы PDF');
  var pdf = new jsPDFClass({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  var PW = pdf.internal.pageSize.getWidth();
  var addServiceLink = function(canvas, rectPx, yOffsetPt) {
    if (!rectPx) return;
    // rectPx измеряется в CSS-пикселях контейнера шириной PAGE_W
    var k = PW / PAGE_W;
    var x = rectPx.x * k;
    var y = yOffsetPt + rectPx.y * k;
    var w = rectPx.w * k;
    var h = rectPx.h * k;
    pdf.link(x, y, w, h, { url: 'https://astral.ru/products/astral-otchet-5-0/?utm_source=kp&utm_medium=clients' });
  };
  var headerHpt = PW * (canvasHeader.height / canvasHeader.width);
  pdf.addImage(canvasHeader.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, PW, headerHpt);
  pdf.addImage(canvases[0].toDataURL('image/jpeg', 1.0), 'JPEG', 0, headerHpt, PW, PW * (canvases[0].height / canvases[0].width));
  addServiceLink(canvases[0], linkRects[0], headerHpt);

  for (var ci = 1; ci < canvases.length; ci++) {
    pdf.addPage();
    pdf.addImage(canvases[ci].toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, PW, PW * (canvases[ci].height / canvases[ci].width));
    addServiceLink(canvases[ci], linkRects[ci], 0);
  }

  if (canvasExtraFooter) {
    pdf.addPage();
    pdf.addImage(canvasExtraFooter.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, PW, PW * (canvasExtraFooter.height / canvasExtraFooter.width));
  }

  var safe = clientName.replace(/[^а-яёА-ЯЁa-zA-Z0-9 _-]/g, '').trim();
  var modeName = mode === 'ub' ? 'УБ' : 'Обычное';
  pdf.save(safe ? ('КП_АО5_' + modeName + '_' + safe + '.pdf') : ('КП_АО5_' + modeName + '.pdf'));
}

// ── Public API ────────────────────────────────────────────────────────────
var CalcApp = {
  selectCard: function(cardId){
    var card=TARIFF_CARDS.find(function(c){ return c.id===cardId; });
    if(!card) return;
    if(S.solo.cardId===cardId){
      // Повторный клик — снять выбор
      S.solo.cardId=null; S.solo.durId=null;
    } else {
      S.solo.cardId=cardId;
      // Если нет вариантов — durId не нужен; если есть — сбрасываем до явного выбора
      S.solo.durId = card.durations ? (S.solo.durId||null) : null;
    }
    refreshTariffCards(); calc();
  },
  selectDuration: function(durId){
    S.solo.durId=durId;
    refreshTariffCards(); calc();
  },
  addFast: function(){ S.fast.rows.push({id:Date.now(),reg:'',ul:1,ip:0}); renderGKInner(); },
  rmFast:  function(id){ if(S.fast.rows.length>1){ S.fast.rows=S.fast.rows.filter(function(x){ return x.id!==id; }); renderGKInner(); } },
  updFast: function(id,f,v){ var r=S.fast.rows.find(function(x){ return x.id===id; }); if(r) r[f]=f==='reg'?v:(parseInt(v)||0); calc(); },
  addDet:  function(){ S.det.cards.push(newDetCard()); renderGKInner(); },
  rmDet:   function(id){ if(S.det.cards.length>1){ S.det.cards=S.det.cards.filter(function(x){ return x.id!==id; }); renderGKInner(); } },
  toggleAddon: function(id){ document.getElementById(id).classList.toggle('on'); calc(); },
  setExist: function(n){ S.det.exist=n; calc(); },
  calc: calc,
};
window.CalcApp=CalcApp;

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.top-tab').forEach(function(b){
    b.onclick=function(){
      document.querySelectorAll('.top-tab').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active'); S.top=b.dataset.top; render(); refreshAddonRows();
    };
  });
  initPDF();
  loadData();
});

})();