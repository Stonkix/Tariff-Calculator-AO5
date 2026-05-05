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
  ub:   { reg: '', orgs: 1, reports: 0 },
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

function regOpts(sel) {
  sel = sel || '';
  return '<option value="" disabled'+(sel?'':' selected')+'>Выберите регион</option>' +
    DATA.map(function(t){ return '<option value="'+t.Column1+'"'+(sel===t.Column1?' selected':'')+'>'+t.Column2+'</option>'; }).join('');
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
  var regSel = n.getElementById('sol-reg');
  regSel.innerHTML = regOpts(S.solo.reg);
  regSel.onchange = function(e){ S.solo.reg=e.target.value; refreshTariffCards(); refreshAddonRows(); calc(); };
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
  // скрываем строку тарифа
  var tr=n.getElementById('gk-tariff-row'); if(tr) tr.style.display='none';

  var rows=n.getElementById('fr-rows');
  S.fast.rows.forEach(function(r){
    var d=document.createElement('div'); d.className='ft-row';
    d.innerHTML=
      '<select onchange="CalcApp.updFast('+r.id+',\'reg\',this.value)">'+regOpts(r.reg)+'</select>'+
      '<input type="number" value="'+r.ul+'" min="0" placeholder="0"'+
             ' oninput="CalcApp.updFast('+r.id+',\'ul\',this.value)"'+
             ' onkeydown="if([\'-\',\'e\',\'E\',\',\',\'.\'].includes(event.key))event.preventDefault();">'+
      '<input type="number" value="'+r.ip+'" min="0" placeholder="0"'+
             ' oninput="CalcApp.updFast('+r.id+',\'ip\',this.value)"'+
             ' onkeydown="if([\'-\',\'e\',\'E\',\',\',\'.\'].includes(event.key))event.preventDefault();">'+
      '<button class="btn-rm" onclick="CalcApp.rmFast('+r.id+')">×</button>';
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
    var selReg=document.createElement('select'); selReg.className='cc-inner-select';
    selReg.innerHTML=regOpts(c.reg);
    selReg.onchange=function(e){ var x=getCard(c.id); if(x){ x.reg=e.target.value; calc(); } };
    var tg=document.createElement('div'); tg.className='tg cc-own';
    ['ul','ip'].forEach(function(v){
      var b=document.createElement('button'); b.className='tb'+(c.own===v?' active':'');
      b.dataset.v=v; b.textContent=v==='ul'?'ЮЛ':'ИП / ФЛ';
      b.onclick=function(){ var x=getCard(c.id); if(!x) return; x.own=v; renderGKInner(); };
      tg.appendChild(b);
    });
    row2.appendChild(selReg); row2.appendChild(tg); wrap.appendChild(row2);

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
  n.getElementById('ub-reg').innerHTML=regOpts(S.ub.reg);
  n.getElementById('ub-reg').onchange=function(e){ S.ub.reg=e.target.value; calc(); };
  n.getElementById('ub-orgs').value=S.ub.orgs;
  n.getElementById('ub-orgs').oninput=function(e){ S.ub.orgs=parseInt(e.target.value)||0; calc(); };
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
      lines.push('Лицензия УБ · '+ubRow.Column2+' | '+fmt(lic));
      var rc=S.ub.reports||0;
      if(rc>0){
        var rk=rc<=200?'Column35':rc<=500?'Column36':rc<=1000?'Column37':'Column38';
        var rate=p(ubRow,rk), minP=p(ubRow,'Column39'), fee=Math.max(rate*rc,minP);
        total+=fee; lines.push('Отчёты: '+rc+' × '+fmt(rate)+' (мин. '+fmt(minP)+') = '+fmt(fee));
      }
      var info=$('ub-info');
      if(info){
        var r35=p(ubRow,'Column35'),r36=p(ubRow,'Column36'),r37=p(ubRow,'Column37'),r38=p(ubRow,'Column38'),r39=p(ubRow,'Column39');
        info.style.display='';
        info.innerHTML='<b>Ставки за отчёт · '+ubRow.Column2+':</b><br>'+
          '1–200: <b>'+fmt(r35)+'</b>/отч. &nbsp;·&nbsp; 201–500: <b>'+fmt(r36)+'</b>/отч. &nbsp;·&nbsp; 501–1000: <b>'+fmt(r37)+'</b>/отч. &nbsp;·&nbsp; 1001+: <b>'+fmt(r38)+'</b>/отч.<br>'+
          'Минимальный платёж: <b>'+fmt(r39)+'</b>/мес.';
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
  $('btn-pdf').onclick=function(){ alert('PDF будет доступен в следующей версии.'); };
  loadData();
});

})();