'use strict';
(() => {
  let BANK = [];
  const $ = id => document.getElementById(id);
  const safe = val => String(val ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const letters = ['A','B','C','D','E','F'];
  const norm = val => String(val ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const shuffle = arr => {const out=[...arr];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
  let subjects = [];
  const labels = {
    'ARQUITECTURA DE SOFTWARE':'Arquitectura de Software',
    'DISEÑO DE SITIOS WEB':'Diseño de Sitios Web',
    'INGENIERÍA ECONÓMICA':'Ingeniería Económica',
    'PROGRAMACIÓN DISTRIBUIDA':'Programación Distribuida',
    'SEGURIDAD DE SOFTWARE':'Seguridad de Software',
    'TÓPICOS AVANZADOS DE SOFTWARE':'Tópicos Avanzados de Software'
  };
  const icons = {'ARQUITECTURA DE SOFTWARE':'⬡','DISEÑO DE SITIOS WEB':'⌘','INGENIERÍA ECONÓMICA':'▥','PROGRAMACIÓN DISTRIBUIDA':'⇄','SEGURIDAD DE SOFTWARE':'◇','TÓPICOS AVANZADOS DE SOFTWARE':'✳'};
  const name = q => labels[q.subject] || q.subject;
  let history = [];
  let currentUser = null;
  let authMode = 'login';
  let session = null;
  let last = null;
  let reviewMode = 'wrong';
  let pageNumber = 1;
  let toastTimer;

  function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3800);}
  async function api(path, init={}) {
    const res=await fetch(path, {
      credentials:'same-origin',
      headers:{'Content-Type':'application/json',...(init.headers||{})},
      ...init
    });
    let payload;
    try {payload=await res.json();} catch {throw new Error('Respuesta inválida del servidor.');}
    if(!res.ok)throw new Error(payload.error||'No se pudo completar la solicitud.');
    return payload;
  }
  function setAuthMode(mode){
    authMode=mode;const registering=mode==='register';
    $('authNameField').hidden=!registering;
    $('authName').required=registering;
    $('authPassword').autocomplete=registering?'new-password':'current-password';
    $('authTitle').textContent=registering?'¡Empieza a practicar!':'¡Bienvenido de nuevo!';
    $('authDescription').textContent=registering?'Crea una cuenta gratis y conserva tus resultados en MongoDB.':'Inicia sesión para acceder a tus materias y resultados.';
    $('authSubmit').innerHTML=registering?'Crear mi cuenta <span>↗</span>':'Entrar a UnitLab <span>↗</span>';
    $('loginTab').classList.toggle('active',!registering);
    $('registerTab').classList.toggle('active',registering);
    $('loginTab').setAttribute('aria-selected',String(!registering));
    $('registerTab').setAttribute('aria-selected',String(registering));
    $('authError').hidden=true;
  }
  async function enterApp(user){
    currentUser=user;
    const [qResult,hResult]=await Promise.all([api('/api/questions'),api('/api/attempts')]);
    BANK=qResult.questions; history=hResult.attempts;
    subjects=[...new Set(BANK.map(q=>q.subject))].sort((a,b)=>a.localeCompare(b,'es'));
    $('currentUser').textContent=user.name.split(' ')[0];
    $('userInitial').textContent=user.name.charAt(0).toUpperCase();
    $('subjectSelect').value='all'; $('bankSubject').value='all';
    populateSubject($('subjectSelect'));populateUnits('subjectSelect','unitSelect');
    populateSubject($('bankSubject'));populateUnits('bankSubject','bankUnit');
    $('authScreen').hidden=true;
    $('application').hidden=false;
    if(BANK.length!==451)toast('El banco de preguntas no tiene los 451 registros esperados.',true);
    go('home');
  }
  function showLogin(){
    $('application').hidden=true;$('authScreen').hidden=false;
    BANK=[];subjects=[];history=[];currentUser=null;session=null;last=null;
    $('authPassword').value='';$('authError').hidden=true;
  }
  async function authenticate(e){
    e.preventDefault();
    $('authError').hidden=true;$('authSubmit').disabled=true;
    const path=authMode==='register'?'/api/auth/register':'/api/auth/login';
    const data={email:$('authEmail').value.trim(),password:$('authPassword').value};
    if(authMode==='register')data.name=$('authName').value.trim();
    try {
      const response=await api(path,{method:'POST',body:JSON.stringify(data)});
      await enterApp(response.user);
      $('authPassword').value='';
    }catch(error){$('authError').textContent=error.message;$('authError').hidden=false;}
    finally{$('authSubmit').disabled=false;}
  }
  async function logout(){
    try {await api('/api/auth/logout',{method:'POST'});showLogin();}
    catch(error){toast(error.message,true);}
  }
  function closeMenu(){$('sidebar').classList.remove('open');$('backdrop').hidden=true;}
  function go(id){
    document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+id));
    document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===id));
    $('crumb').textContent=({home:'Inicio',quiz:'Cuestionario',result:'Resultados',bank:'Banco de preguntas',history:'Mis resultados'})[id]||'Inicio';
    if(id==='home')refreshHome();if(id==='bank')renderBank();if(id==='history')renderHistory();
    closeMenu();window.scrollTo({top:0,behavior:'instant'});
  }
  function questionLabel(q){return q.origin==='plus'?'PLUS':'Examen original';}
  function tags(q,includeUnit=true){return `<span class="chip ${q.origin==='plus'?'plus':'exam'}">${questionLabel(q)}</span>${includeUnit?`<span class="chip">Unidad ${q.unit}</span>`:''}${q.status==='review'?'<span class="chip review">En revisión</span>':''}${q.discrepancy?'<span class="chip discrepancy">Discrepancia SIMA</span>':''}`;}
  function populateSubject(select){const previous=select.value;select.innerHTML=`<option value="all">Todas las materias</option>`+subjects.map(s=>`<option value="${safe(s)}">${safe(labels[s]||s)}</option>`).join('');if(subjects.includes(previous))select.value=previous;}
  function populateUnits(subjectID,unitID){
    const sel=$(subjectID),target=$(unitID),prev=target.value;
    const values=[...new Set(BANK.filter(q=>sel.value==='all'||q.subject===sel.value).map(q=>q.unit))].sort((a,b)=>a-b);
    target.innerHTML='<option value="all">Todas las unidades</option>'+values.map(u=>`<option value="${u}">Unidad ${u}</option>`).join('');
    if(values.map(String).includes(prev))target.value=prev;
  }
  function wrongIDs(){return new Set(history.flatMap(h=>Array.isArray(h.wrongIds)?h.wrongIds:[]));}
  function available(){
    const subject=$('subjectSelect').value,unit=$('unitSelect').value,origin=$('originSelect').value,wrong=$('onlyWrong').checked,errors=wrongIDs();
    const seen=new Set();
    return BANK.filter(q=>{
      if(q.status==='review')return false;
      if(subject!=='all'&&q.subject!==subject)return false;
      if(unit!=='all'&&q.unit!==Number(unit))return false;
      if(origin!=='all'&&q.origin!==origin)return false;
      if(wrong&&!errors.has(q.id))return false;
      const key=q.subject+'|'+norm(q.question);if(seen.has(key))return false;seen.add(key);
      return true;
    });
  }
  function poolText(){
    const pool=available(), originals=pool.filter(q=>q.origin==='exam').length, plus=pool.length-originals;
    $('poolNotice').textContent=`${pool.length} disponibles para esta selección · ${originals} de exámenes originales y ${plus} PLUS. No se incluyen preguntas ambiguas ni repetidas.`;
    $('countInput').max=String(Math.max(pool.length,1));
  }
  function refreshHome(){
    $('stat-total').textContent=BANK.length;
    $('stat-exams').textContent=BANK.filter(q=>q.origin==='exam').length;
    $('stat-plus').textContent=BANK.filter(q=>q.origin==='plus').length;
    const total=history.reduce((sum,h)=>sum+h.total,0),hits=history.reduce((sum,h)=>sum+h.correct,0);
    $('stat-score').textContent=total?Math.round(100*hits/total)+'%':'—';
    $('reviewCountText').textContent=BANK.filter(q=>q.status==='review').length;
    $('subjectCount').textContent=subjects.length+' materias';
    $('subjectGrid').innerHTML=subjects.map(s=>{
      const qs=BANK.filter(q=>q.subject===s),real=qs.filter(q=>q.origin==='exam').length,plus=qs.length-real;
      return `<button type="button" class="subject-card" data-subject="${encodeURIComponent(s)}"><span class="subject-icon">${icons[s]||'▤'}</span><h3>${safe(labels[s]||s)} <span class="go">↗</span></h3><p>${real} originales · ${plus} PLUS · ${new Set(qs.map(q=>q.unit)).size} unidades</p></button>`;
    }).join('');
    poolText();
  }
  function startTest(pool,mode,count,shuffleAnswers=true){
    if(!pool.length){toast('No hay preguntas disponibles con los filtros elegidos.',true);return;}
    const chosen=shuffle(pool).slice(0,Math.min(count,pool.length));
    session={items:chosen,index:0,mode,answers:{},orders:{},subject:$('subjectSelect').value,unit:$('unitSelect').value,origin:$('originSelect').value};
    for(const q of chosen)session.orders[q.id]=shuffleAnswers?shuffle(q.options.map((_,i)=>i)):q.options.map((_,i)=>i);
    renderQuestion();go('quiz');
  }
  function begin(){
    const pool=available(),n=Number($('countInput').value);
    if(!pool.length){toast('No hay preguntas con esa combinación. Cambia el filtro o desactiva «solo falladas».',true);return;}
    if(!Number.isInteger(n)||n<1){toast('Indica un número válido de preguntas.',true);return;}
    if(n>pool.length)toast(`Hay ${pool.length} preguntas únicas; se utilizarán todas.`);
    const mode=document.querySelector('input[name="mode"]:checked').value;
    startTest(pool,mode,n,$('shuffleOptions').checked);
  }
  function renderQuestion(){
    if(!session)return;
    const i=session.index,q=session.items[i],current=session.answers[q.id],answered=Object.hasOwn(session.answers,q.id);
    $('quizMode').textContent=session.mode==='exam'?'Modo examen':'Modo práctica';
    $('quizSubject').textContent=name(q).toUpperCase();
    $('progressText').textContent=`Pregunta ${i+1} de ${session.items.length}`;
    $('questionNum').textContent=`${String(i+1).padStart(2,'0')} / ${session.items.length}`;
    $('answeredText').textContent=`${Object.keys(session.answers).length} respondidas`;
    $('progressBar').style.width=((i+1)/session.items.length*100)+'%';
    $('quizTags').innerHTML=tags(q);
    $('questionText').textContent=q.question;
    $('options').innerHTML=session.orders[q.id].map(idx=>{
      const selected=answered&&current===idx;
      const show=session.mode==='practice'&&answered;
      const css=(selected?' selected':'')+(show&&idx===q.correct?' is-correct':'')+(show&&selected&&idx!==q.correct?' is-wrong':'');
      return `<button type="button" class="option${css}" data-option="${idx}" ${show?'disabled':''} aria-pressed="${selected}"><span class="letter">${letters[idx]||idx+1}</span><span class="option-text">${safe(q.options[idx])}</span></button>`;
    }).join('');
    const feed=$('feedback');
    if(session.mode==='practice'&&answered){
      const ok=current===q.correct;
      feed.hidden=false;feed.classList.toggle('error',!ok);
      feed.innerHTML=`<b>${ok?'✓ ¡Correcto!':'✕ Respuesta incorrecta'}</b>${ok?'Bien respondido.':`La respuesta correcta es: <strong>${safe(q.options[q.correct])}</strong>.`}${q.explanation?`<div>${safe(q.explanation)}</div>`:''}`;
    }else{feed.hidden=true;feed.innerHTML='';}
    $('prev').disabled=i===0;
    $('next').textContent=i===session.items.length-1?'Finalizar examen ✓':'Siguiente →';
    $('dots').innerHTML=session.items.length>35?`<span class="soft-pill">${Object.keys(session.answers).length} de ${session.items.length}</span>`:session.items.map((item,n)=>`<button type="button" class="dot ${Object.hasOwn(session.answers,item.id)?'answered':''} ${n===i?'current':''}" data-step="${n}" aria-label="Ir a pregunta ${n+1}" title="Pregunta ${n+1}"></button>`).join('');
  }
  function choose(idx){
    if(!session)return;
    const q=session.items[session.index];
    if(session.mode==='practice'&&Object.hasOwn(session.answers,q.id))return;
    if(!Number.isInteger(idx)||idx<0||idx>=q.options.length)return;
    session.answers[q.id]=idx;renderQuestion();
  }
  function next(){
    if(!session)return;
    if(session.index<session.items.length-1){session.index++;renderQuestion();return;}
    const unanswered=session.items.filter(q=>!Object.hasOwn(session.answers,q.id)).length;
    if(unanswered&&!confirm(`Hay ${unanswered} pregunta(s) sin responder, que contarán como incorrectas. ¿Finalizar el examen?`))return;
    finish();
  }
  async function finish(){
    if(!session)return;
    const completed=session;
    const answers=completed.items.map(q=>({id:q.id, option:Object.hasOwn(completed.answers,q.id)?completed.answers[q.id]:null}));
    const correct=completed.items.filter(q=>completed.answers[q.id]===q.correct).length;
    const wrongIds=completed.items.filter(q=>completed.answers[q.id]!==q.correct).map(q=>q.id);
    last={items:completed.items,answers:{...completed.answers},correct,wrongIds};
    session=null;
    try {
      const result=await api('/api/attempts',{method:'POST',body:JSON.stringify({
        subject:completed.subject,unit:String(completed.unit),origin:completed.origin,mode:completed.mode,answers
      })});
      history.unshift(result.attempt);
      history=history.slice(0,200);
      // Usamos la nota calculada y validada por MongoDB/servidor.
      last.correct=result.attempt.correct;
      last.wrongIds=result.attempt.wrongIds;
    }catch(err){
      toast('No se pudo guardar el examen en tu cuenta: '+err.message,true);
    }
    renderResult();go('result');
  }
  function renderResult(){
    if(!last)return;
    const total=last.items.length,wrong=total-last.correct,pct=Math.round(100*last.correct/total),grade=(5*last.correct/total).toFixed(2).replace('.',',');
    $('finalScore').innerHTML=`${grade} <span>/ 5,00</span>`;
    $('resultInfo').textContent=wrong?'Revisa las preguntas falladas y vuelve a practicar.':'¡Excelente! Respondiste correctamente todas las preguntas.';
    $('correctMetric').textContent=last.correct;
    $('wrongMetric').textContent=wrong;
    $('percentMetric').textContent=pct+'%';
    $('retryWrong').disabled=wrong===0;
    reviewMode='wrong';document.querySelectorAll('[data-review]').forEach(el=>el.classList.toggle('active',el.dataset.review==='wrong'));
    renderReview();
  }
  function renderReview(){
    if(!last)return;
    const filtered=last.items.filter(q=>reviewMode==='all'||last.answers[q.id]!==q.correct);
    if(!filtered.length){$('reviewList').innerHTML='<div class="empty"><span>✦</span>¡Sin errores en este intento! Puedes practicar otra materia o las preguntas PLUS.</div>';return;}
    $('reviewList').innerHTML=filtered.map((q,i)=>{
      const val=last.answers[q.id],ok=val===q.correct;
      return `<article class="review-item"><div class="review-top"><div class="meta-tags">${tags(q)}<span class="chip">${safe(name(q))}</span></div><span class="review-status ${ok?'':'bad'}">${ok?'✓ Correcta':'✕ Incorrecta'}</span></div><h3>${safe(q.question)}</h3><div class="review-correction"><div class="answer-box ${ok?'ok':'bad'}"><strong>TU RESPUESTA</strong>${val===undefined?'Sin responder':safe(q.options[val])}</div><div class="answer-box ok"><strong>RESPUESTA CORRECTA</strong>${safe(q.options[q.correct])}</div></div>${q.explanation?`<p class="review-note">${safe(q.explanation)}</p>`:''}</article>`;
    }).join('');
  }
  function retryWrong(){if(!last||!last.wrongIds.length)return;const set=new Set(last.wrongIds);const pool=last.items.filter(q=>set.has(q.id));startTest(pool,'practice',pool.length,$('shuffleOptions').checked);}
  function bankPool(){
    const s=$('bankSubject').value,u=$('bankUnit').value,o=$('bankOrigin').value,t=norm($('bankSearch').value);
    return BANK.filter(q=>(s==='all'||q.subject===s)&&(u==='all'||q.unit===Number(u))&&(o==='all'||o==='review'&&q.status==='review'||o==='discrepancy'&&q.discrepancy||q.origin===o)&&(!t||norm(q.question+' '+q.options.join(' ')+' '+q.subject+' '+q.unit).includes(t)));
  }
  function renderBank(){
    const pool=bankPool(),per=15,maxPage=Math.max(1,Math.ceil(pool.length/per));pageNumber=Math.min(pageNumber,maxPage);
    $('bankTotal').textContent=BANK.length;$('bankReady').textContent=BANK.filter(q=>q.status==='correct').length;
    $('bankReview').textContent=BANK.filter(q=>q.status==='review').length;
    $('bankResultCount').textContent=`${pool.length} pregunta${pool.length===1?'':'s'} encontrada${pool.length===1?'':'s'}`;
    if(!pool.length){$('bankList').innerHTML='<div class="empty"><span>⌕</span>No se encontraron preguntas. Cambia los filtros.</div>';}
    else $('bankList').innerHTML=pool.slice((pageNumber-1)*per,pageNumber*per).map(q=>{
      const source=q.origin==='exam'?`${q.source.replace('.pdf','')} · Pregunta ${q.sourceNumber}`:'Pregunta PLUS creada para reforzar el temario';
      const r=q.status==='review';
      return `<article class="bank-item"><div class="bank-item-top"><div class="tag-line">${tags(q)}<span class="chip">${safe(name(q))}</span></div></div><h3>${safe(q.question)}</h3><div class="source">${safe(source)}</div><details class="disclosure"><summary>${r?'Ver opciones y motivo de revisión':'Ver opciones y respuesta correcta'}</summary><ol class="bank-options" type="A">${q.options.map((a,i)=>`<li class="${!r&&i===q.correct?'right':''}">${safe(a)} ${!r&&i===q.correct?'✓':''}</li>`).join('')}</ol>${r?`<p class="review-note">En revisión: ${safe(q.reviewNote)}</p>`:q.explanation?`<p class="review-note">${safe(q.explanation)}</p>`:''}</details></article>`;
    }).join('');
    $('pagination').innerHTML=pool.length<=per?'':`<button type="button" class="btn outline" data-pager="prev" ${pageNumber===1?'disabled':''}>← Anterior</button><span>Página ${pageNumber} de ${maxPage}</span><button type="button" class="btn outline" data-pager="next" ${pageNumber===maxPage?'disabled':''}>Siguiente →</button>`;
  }
  function renderHistory(){
    if(!history.length){$('historyList').innerHTML='<div class="empty"><span>◷</span>Aún no hay cuestionarios terminados. ¡Empieza con tu primera práctica!</div>';return;}
    $('historyList').innerHTML=history.map(h=>{
      const d=new Date(h.timestamp),date=Number.isNaN(d.getTime())?'Fecha no disponible':new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(d);
      const sub=h.subject==='all'?'Todas las materias':labels[h.subject]||h.subject;
      const uni=h.unit==='all'?'Todas las unidades':`Unidad ${h.unit}`;
      const typ=h.origin==='all'?'Originales + PLUS':h.origin==='exam'?'Solo originales':'Solo PLUS';
      const grade=(5*h.correct/h.total).toFixed(2).replace('.',',');
      return `<article class="history-item"><div><strong>${safe(sub)} · ${safe(uni)}</strong><p>${safe(date)} · ${h.mode==='exam'?'Examen':'Práctica'} · ${safe(typ)} · ${h.correct}/${h.total} correctas</p></div><div class="history-grade">${grade} / 5,00<small>${Math.round(100*h.correct/h.total)}% aciertos</small></div></article>`;
    }).join('');
  }
  function exportBank(){const blob=new Blob([JSON.stringify(BANK,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='UnitLab_451_preguntas.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function init(){
    document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.nav)));
    $('mobileMenu').addEventListener('click',()=>{$('sidebar').classList.add('open');$('backdrop').hidden=false;});
    $('backdrop').addEventListener('click',closeMenu);
    $('subjectSelect').addEventListener('change',()=>{populateUnits('subjectSelect','unitSelect');poolText();});
    ['unitSelect','originSelect','onlyWrong'].forEach(id=>$(id).addEventListener('change',poolText));
    $('start').addEventListener('click',begin);
    $('heroStart').addEventListener('click',()=>$('setup').scrollIntoView({behavior:'smooth',block:'center'}));
    $('subjectGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-subject]');if(!btn)return;$('subjectSelect').value=decodeURIComponent(btn.dataset.subject);populateUnits('subjectSelect','unitSelect');poolText();$('setup').scrollIntoView({behavior:'smooth',block:'center'});});
    $('seeReviews').addEventListener('click',()=>{$('bankOrigin').value='review';pageNumber=1;go('bank');});
    $('options').addEventListener('click',e=>{const opt=e.target.closest('[data-option]');if(opt)choose(Number(opt.dataset.option));});
    $('prev').addEventListener('click',()=>{if(session&&session.index>0){session.index--;renderQuestion();}});
    $('next').addEventListener('click',next);
    $('dots').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b&&session){session.index=Number(b.dataset.step);renderQuestion();}});
    $('exitQuiz').addEventListener('click',()=>{if(confirm('¿Salir del examen? Este intento no se guardará.')){session=null;go('home');}});
    $('resultBack').addEventListener('click',()=>go('home'));
    $('resultNew').addEventListener('click',()=>go('home'));
    $('retryWrong').addEventListener('click',retryWrong);
    document.querySelectorAll('[data-review]').forEach(btn=>btn.addEventListener('click',()=>{reviewMode=btn.dataset.review;document.querySelectorAll('[data-review]').forEach(item=>item.classList.toggle('active',item===btn));renderReview();}));
    $('bankSubject').addEventListener('change',()=>{populateUnits('bankSubject','bankUnit');pageNumber=1;renderBank();});
    ['bankUnit','bankOrigin'].forEach(id=>$(id).addEventListener('change',()=>{pageNumber=1;renderBank();}));
    $('bankSearch').addEventListener('input',()=>{pageNumber=1;renderBank();});
    $('pagination').addEventListener('click',e=>{const b=e.target.closest('[data-pager]');if(!b)return;pageNumber+=b.dataset.pager==='next'?1:-1;renderBank();$('bankResultCount').scrollIntoView({behavior:'smooth',block:'start'});});
    $('exportBank').addEventListener('click',exportBank);
    $('clearHistory').addEventListener('click',async()=>{
      if(!history.length){toast('No hay historial que borrar.');return;}
      if(!confirm('¿Eliminar todos los resultados guardados de tu cuenta MongoDB?'))return;
      try {await api('/api/attempts',{method:'DELETE'});history=[];renderHistory();toast('Historial eliminado de tu cuenta.');}
      catch(err){toast(err.message,true);}
    });
    $('loginTab').addEventListener('click',()=>setAuthMode('login'));
    $('registerTab').addEventListener('click',()=>setAuthMode('register'));
    $('authForm').addEventListener('submit',authenticate);
    $('logoutButton').addEventListener('click',logout);
    setAuthMode('login');
    api('/api/auth/me').then(result=>enterApp(result.user)).catch(()=>showLogin());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
