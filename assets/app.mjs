import {Repository,emptyData} from './storage.mjs';
import {seedProjects} from './seed.mjs';
import {money,cents,balances,assess,validateEntry,validateData,localIntent,norm,today,validDate} from './finance.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
const numberInput=c=>c==null?'':(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateLabel=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'Data não informada';
const types={income:'Recebimento',expense:'Despesa paga',commitment:'Reserva / a pagar'};
const repo=new Repository();let data=emptyData(),projectId='',view='chat',busy=false;
const project=()=>data.projects.find(p=>p.id===projectId);
let toastTimer;
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function commit(change,description){
  const next=structuredClone(data);change(next);next.audit.push({id:uid(),at:now(),description});
  await repo.save(next);data=next;render();
}
function showView(v){view=v;$$('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+v));$$('.nav[data-view]').forEach(e=>e.classList.toggle('active',e.dataset.view===v));render();}
function modal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modal').showModal();}
function close(){$('#modal').close();}
function bindForm(handler){
  $('#modalForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;$('#formError').textContent='';
    try{await handler(new FormData(f),f);}catch(err){$('#formError').textContent=err.message||String(err);}finally{button.disabled=false;}
  };
}
const formEnd=(label='Salvar registro')=>`<p id="formError" class="error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-close>Cancelar</button><button class="primary" type="submit">${label}</button></div></form>`;
function field(name,label,value='',type='text',extra=''){return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function rubricOptions(p,selected='',blank='Escolha uma rubrica'){return `<option value="">${blank}</option>`+(p?.rubrics||[]).map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('');}
function needProject(){if(project())return true;showView('projects');toast('Crie um projeto ou importe os projetos do painel.');return false;}
function render(){
  if(!data.projects.some(p=>p.id===projectId))projectId=data.projects[0]?.id||'';
  $('#projectSelect').innerHTML=data.projects.length?data.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===projectId?'selected':''}>${esc(p.name)}</option>`).join(''):'<option>Nenhum projeto cadastrado</option>';
  $('#storageTitle').textContent=repo.user?'Conta conectada':'Salvo neste navegador';
  $('#storageText').textContent=repo.user?`Registros e arquivos privados vinculados a ${repo.user.email}.`:'Registros e arquivos neste dispositivo. Baixe o backup para guardar uma cópia.';
  $('#mode').textContent=repo.user?'Nuvem conectada':'Modo local · IA pendente';
  $('#profileButton').textContent=repo.user?repo.user.email.slice(0,2).toUpperCase():'TA';
  if(repo.user)$('#composerNote').textContent='A IA usa os registros da sua conta. Anexos só são enviados para leitura quando você solicita. Confira os dados extraídos antes de salvar.';
  renderMessages();renderBalances();renderDocuments();renderActions();renderProjects();
}
function renderMessages(){
  const messages=data.messages.filter(m=>m.projectId===projectId).slice(-60);
  $('#messages').innerHTML=messages.map(m=>`<div class="message ${m.role==='user'?'user':''}"><span class="message-label">${m.role==='user'?'Você':m.ai?'Assistente IA':'Assistente · consulta calculada'}</span>${esc(m.text)}${m.draft?`<div><button class="secondary" data-draft="${esc(m.id)}">Revisar e registrar →</button></div>`:''}</div>`).join('');
}
function balanceText(p){const b=balances(p,data.entries);return `${p.name}\n\nRecebimentos registrados: ${money(b.received)}\nDespesas pagas registradas: ${money(b.paid)}\nReservas e contas a pagar: ${money(b.committed)}\n${b.complete?'Caixa livre':'Caixa calculado, histórico ainda não conferido'}: ${money(b.freeCash)}\n\nPor rubrica (orçamento menos despesas e reservas):\n${b.rubrics.map(r=>`${r.name}: ${money(r.remaining)}`).join('\n')}\n\n${b.complete?'Conferência do histórico registrada em '+new Date(p.reconciledAt).toLocaleString('pt-BR')+'.':'Esses totais não comprovam seu saldo bancário. É preciso registrar os recebimentos e os gastos anteriores e conferir o histórico.'}`;}
function assessmentText(p,a){return `${a.headline}\n\nProjeto: ${p.name}\nCompra: ${money(a.amount)}\nRestaria na rubrica: ${money(a.rubricAfter)}\nRestaria no caixa livre: ${money(a.cashAfter)}\n\n${[...a.blockers,...a.pending].join('\n')}\n\nEssa simulação não registra nem autoriza a despesa.`;}
function renderBalances(){
  const p=project(),el=$('#balanceContent');if(!p){el.innerHTML='<div class="empty">Importe ou crie um projeto para começar.</div>';return;}
  const b=balances(p,data.entries);
  el.innerHTML=`${!b.complete?'<div class="notice"><strong>O saldo real ainda precisa ser conferido.</strong><br>Cadastre os recursos recebidos, as despesas anteriores e os compromissos. O orçamento aprovado não significa dinheiro em conta. <button class="text-button" data-edit-project="'+esc(p.id)+'">Conferir projeto →</button></div>':''}
  <div class="metric-grid"><div class="metric"><small>Recebido · registrado</small><strong>${money(b.received)}</strong><small>Entradas de dinheiro</small></div><div class="metric"><small>Pago · registrado</small><strong>${money(b.paid)}</strong><small>Despesas já realizadas</small></div><div class="metric"><small>Reservado / a pagar</small><strong>${money(b.committed)}</strong><small>Compromissos assumidos</small></div><div class="metric highlight"><small>${b.complete?'Caixa livre calculado':'Caixa a conferir'}</small><strong>${b.complete?money(b.freeCash):'Pendente'}</strong><small>Recebido − pago − reservado</small></div></div>
  <h3>Orçamento por rubrica</h3><div class="table-wrap"><table><thead><tr><th>Rubrica</th><th class="num">Orçamento</th><th class="num">Pago</th><th class="num">Reservado</th><th class="num">Saldo orçamentário</th></tr></thead><tbody>${b.rubrics.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${money(r.budget)}</td><td class="num">${money(r.paid)}</td><td class="num">${money(r.committed)}</td><td class="num ${r.remaining<0?'negative':''}">${money(r.remaining)}</td></tr>`).join('')}</tbody></table></div><p class="muted">Saldo de uma rubrica não é autorização para transferir recursos entre rubricas ou entre projetos.</p>
  <div class="row-actions"><button class="secondary" id="simulateBalance">Simular uma compra</button><button class="secondary" id="exportCsv">Exportar lançamentos CSV</button></div><h3>Lançamentos</h3>${entryTable(p)}
  <details><summary>De onde vêm os dados e as regras?</summary><p>${esc(p.budgetSource||'Orçamento cadastrado pelo responsável.')}</p><p class="pre">${esc(p.rules||'Regras não cadastradas.')}</p></details>`;
}
function entryTable(p){
  const rows=data.entries.filter(e=>e.projectId===p.id).sort((a,b)=>b.date.localeCompare(a.date));
  if(!rows.length)return '<div class="empty">Nenhum lançamento financeiro registrado.<br>Comece por um recebimento ou uma despesa.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição / rubrica</th><th>Situação</th><th class="num">Valor</th><th>Ações</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${dateLabel(e.date)}</td><td><strong>${esc(e.title)}</strong><br><small>${esc(p.rubrics.find(r=>r.id===e.rubricId)?.name||'Recurso recebido pelo projeto')}</small>${e.invoice?`<br><small>NF ${esc(e.invoice)}</small>`:''}</td><td>${e.cancelledAt?'Cancelado':types[e.type]}${e.cancelledAt?`<br><small>${esc(e.cancelReason)}</small>`:''}</td><td class="num">${money(e.amount)}</td><td>${!e.cancelledAt?`<div class="row-actions">${e.type==='commitment'?`<button class="text-button" data-pay="${esc(e.id)}">Registrar pagamento</button>`:''}<button class="text-button" data-cancel-entry="${esc(e.id)}">Corrigir / cancelar</button></div>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderDocuments(){
  const p=project(),f=$('#documentRubric'),previous=f.value;f.innerHTML=rubricOptions(p,previous,'Todas as rubricas');
  const q=norm($('#documentSearch').value),rubric=f.value;
  const docs=data.documents.filter(d=>d.projectId===projectId && (!rubric||d.rubricId===rubric) && norm([d.name,d.title,d.supplier,d.invoice].join(' ')).includes(q));
  $('#documentContent').innerHTML=docs.length?`<p class="muted">${docs.length} documento(s) · originais preservados</p><div class="cards">${docs.map(d=>`<article class="card"><span class="pill">${esc(d.kind)}</span><span class="pill">${esc(p?.rubrics.find(r=>r.id===d.rubricId)?.name||'Documentos gerais')}</span><h3>${esc(d.title||d.name)}</h3><p>${esc(d.supplier||'')}${d.invoice?' · NF '+esc(d.invoice):''}</p><p class="muted">${esc(d.name)} · ${dateLabel(d.date)}<br>${d.amount==null?'Valor não informado':money(d.amount)}</p><div class="row-actions"><button class="secondary" data-file="${esc(d.id)}">Baixar original</button><button class="text-button" data-edit-doc="${esc(d.id)}">Editar vínculo</button></div></article>`).join('')}</div>`:'<div class="empty">Nenhum documento encontrado.<br>Envie notas, comprovantes, fotos ou arquivos do projeto.</div>';
}
function renderActions(){
  const rows=data.actions.filter(a=>a.projectId===projectId).sort((a,b)=>b.date.localeCompare(a.date));
  $('#actionContent').innerHTML=`<p class="muted">${rows.length} ação(ões) registrada(s). Planejamento e ações realizadas ficam separados.</p>`+(rows.map(a=>`<article class="list-item"><time>${dateLabel(a.date)}</time><h3>${esc(a.title)}</h3><span class="pill">${esc(a.kind)}</span><p>${esc(a.description)}</p><p class="muted">${esc(a.location||'Local não informado')} · ${a.people==null?'Público não informado':a.people+' participantes'} · ${data.documents.filter(d=>d.actionId===a.id).length} anexo(s)</p><button class="text-button" data-edit-action="${esc(a.id)}">Editar ação</button> <button class="text-button" data-action-doc="${esc(a.id)}">Anexar documento ou foto</button></article>`).join('')||'<div class="empty">Ainda não há ações registradas.<br>Conte sobre uma reunião, oficina, visita ou outra atividade.</div>')+`<details><summary>Consultar planejamento importado</summary><p class="pre">${esc(planText(project()?.plan))}</p></details>`;
}
function planText(plan){if(!plan)return 'Nenhum planejamento importado.';if(Array.isArray(plan))return plan.map(x=>(x.done?'✓ Concluído · ':'')+(x.titulo||x.texto)).join('\n');return Object.entries(plan).map(([k,v])=>k+'\n'+v.join('\n')).join('\n\n');}
function renderProjects(){
  $('#projectContent').innerHTML=`<div class="cards">${data.projects.map(p=>`<article class="card"><span class="pill">${esc(p.source||'Projeto próprio')}</span><h3>${esc(p.name)}</h3><p>${p.rubrics.length} rubricas · ${money(p.rubrics.reduce((s,r)=>s+(r.budget||0),0))} informados</p><p class="muted">${p.rubrics.some(r=>r.budget==null)?'Há rubrica sem orçamento informado. ':''}${p.reconciledAt?'Histórico financeiro conferido.':'Histórico financeiro ainda não conferido.'}</p><button class="secondary" data-edit-project="${esc(p.id)}">Editar projeto e rubricas</button></article>`).join('')}</div>`;
}
async function send(text){
  if(busy||!needProject())return;
  busy=true;$('#sendButton').disabled=true;const selectedId=projectId;
  try{
    await commit(d=>d.messages.push({id:uid(),projectId:selectedId,role:'user',text,at:now()}),'Mensagem enviada');$('#question').value='';
    const p=data.projects.find(x=>x.id===selectedId);let response;
    if(repo.user) response=await repo.ask({message:text,projectId:selectedId});
    else{
      const draft=localIntent(text,p);
      if(draft.intent==='balance')response={text:balanceText(p)};
      else if(draft.intent==='simulate' && draft.amount && draft.rubricId)response={text:assessmentText(p,assess(p,data.entries,draft.rubricId,draft.amount))};
      else if(draft.intent==='simulate')response={text:'Vamos conferir a compra. Selecione a rubrica e confirme o valor na simulação.',draft:{...draft,kind:'simulate'}};
      else if(['income','expense','commitment','action','documents'].includes(draft.intent))response={text:draft.intent==='documents'?'Você pode anexar o original e organizar por projeto e rubrica. A leitura automática de fotos e PDFs depende da IA conectada.':'Preparei um registro para você completar. Confira os campos; nada foi lançado ainda.',draft:{...draft,kind:draft.intent}};
      else response={text:'No modo local, consigo consultar saldos e preparar registros a partir de comandos simples, como “meu saldo”, “paguei R$ 200 em material de consumo” ou “posso gastar R$ 500 com diárias?”. Para conversar livremente e interpretar documentos, é preciso ativar a IA em Conta e conexão.'};
    }
    await commit(d=>d.messages.push({id:uid(),projectId:selectedId,role:'assistant',text:response.text,ai:!!repo.user,draft:response.draft||null,at:now()}),'Resposta da assistente');
    $('#composerNote').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(err){toast(err.message||'Não foi possível enviar.');}finally{busy=false;$('#sendButton').disabled=false;}
}
function entryModal(draft={},existing=null){
  if(!needProject())return;const p=project(),id=uid();
  if(draft.sourceMessageId&&data.entries.some(e=>e.sourceMessageId===draft.sourceMessageId&&!e.cancelledAt)){toast('Essa sugestão já foi registrada. Veja os lançamentos.');return;}
  modal(existing?'Registrar pagamento da reserva':'Revisar lançamento financeiro',`<p class="muted">${esc(p.name)}. O lançamento só será feito ao salvar.</p><form id="modalForm"><div class="form-grid"><div class="field"><label for="f-type">O que aconteceu?</label><select id="f-type" name="type">${Object.entries(types).map(([v,l])=>`<option value="${v}" ${v===(existing?'expense':draft.kind||'expense')?'selected':''}>${l}</option>`).join('')}</select></div>${field('amount','Valor (R$)',numberInput(existing?.amount??draft.amount),'text','required inputmode="decimal"')}${field('date','Data',existing?today():draft.date||today(),'date','required')}<div class="field"><label for="f-rubricId">Rubrica</label><select id="f-rubricId" name="rubricId">${rubricOptions(p,existing?.rubricId||draft.rubricId)}</select></div></div>${field('title','Descrição',existing?.title||draft.title||'','text','required maxlength="500"')}${field('supplier','Fornecedor / beneficiário',draft.supplier||'')}${field('invoice','Número da nota fiscal',draft.invoice||'')}<div class="field"><label for="f-documentId">Documento vinculado</label><select id="f-documentId" name="documentId"><option value="">Vincular depois</option>${data.documents.filter(d=>d.projectId===p.id).map(d=>`<option value="${esc(d.id)}">${esc(d.title||d.name)}</option>`).join('')}</select></div><p class="muted">Registrar uma despesa não significa que ela foi autorizada pelo financiador. Para corrigir um lançamento, use o cancelamento com motivo.</p>${formEnd(existing?'Confirmar pagamento':'Confirmar lançamento')}`);
  if(existing)$('#f-type').disabled=true;
  const toggle=()=>{$('#f-rubricId').required=$('#f-type').value!=='income';$('#f-rubricId').disabled=$('#f-type').value==='income';};$('#f-type').onchange=toggle;toggle();
  bindForm(async f=>{
    const e={id,projectId:p.id,type:existing?'expense':f.get('type'),amount:cents(f.get('amount')),date:f.get('date'),title:f.get('title').trim(),rubricId:f.get('rubricId')||null,supplier:f.get('supplier'),invoice:f.get('invoice'),documentId:f.get('documentId')||null,sourceMessageId:draft.sourceMessageId||null,createdAt:now()};validateEntry(e,p);
    if(existing && (e.amount!==existing.amount||e.rubricId!==existing.rubricId))throw Error('Para pagar a reserva, mantenha valor e rubrica. Para alteração ou pagamento parcial, cancele a reserva com motivo e registre os valores corretos.');
    const duplicate=data.entries.find(x=>!x.cancelledAt&&x.projectId===p.id&&x.type===e.type&&x.amount===e.amount&&x.date===e.date&&((e.invoice&&x.invoice===e.invoice&&x.supplier===e.supplier)||x.title===e.title));
    if(duplicate)throw Error('Há um lançamento igual nesta data. Confira o histórico antes de registrar novamente.');
    await commit(d=>{if(existing){const old=d.entries.find(x=>x.id===existing.id);if(old.cancelledAt)throw Error('Essa reserva já foi liquidada ou cancelada.');old.cancelledAt=now();old.cancelReason='Liquidada pelo pagamento '+id;e.settles=old.id;}d.entries.push(e);},'Lançamento financeiro: '+e.title);close();toast('Lançamento salvo. Saldos atualizados.');
  });
}
function simulateModal(draft={}){
  if(!needProject())return;const p=project();
  modal('Essa compra cabe no projeto?',`<form id="modalForm">${field('amount','Quanto pretende gastar? (R$)',numberInput(draft.amount),'text','required inputmode="decimal"')}<div class="field"><label for="f-rubricId">Em qual rubrica?</label><select id="f-rubricId" name="rubricId" required>${rubricOptions(p,draft.rubricId)}</select></div>${field('date','Data prevista',today(),'date','required')}<p class="muted">${esc(p.name)} · Esta simulação não altera seus registros.</p>${formEnd('Conferir a compra')}<div id="simulationResult"></div>`);
  bindForm(async f=>{const a=assess(p,data.entries,f.get('rubricId'),cents(f.get('amount')),f.get('date'));$('#simulationResult').innerHTML=`<div class="notice ${a.status==='blocked'?'bad':a.status==='fits'?'good':''}"><strong>${esc(a.headline)}</strong><p>Na rubrica restariam: ${money(a.rubricAfter)}<br>No caixa livre restariam: ${money(a.cashAfter)}</p>${[...a.blockers,...a.pending].map(x=>`<p>${esc(x)}</p>`).join('')}</div>`;});
}
function projectModal(existing=null){
  const p=existing?structuredClone(existing):{id:uid(),name:'',source:'',rules:'',startsOn:'',endsOn:'',rubrics:[],reconciledAt:null};
  modal(existing?'Projeto, rubricas e conferência':'Novo projeto',`<form id="modalForm">${field('name','Nome do projeto',p.name,'text','required maxlength="150"')}${field('source','Financiador / origem dos recursos',p.source)}<div class="form-grid">${field('startsOn','Início da vigência',p.startsOn,'date')}${field('endsOn','Fim da vigência',p.endsOn,'date')}</div><h3>Rubricas e valores aprovados</h3><p class="muted">Deixe o valor vazio quando não souber. Informe 0 somente se o valor aprovado for zero.</p><div id="rubricRows"></div><button type="button" class="secondary" id="addRubric">＋ Rubrica</button><div class="field" style="margin-top:20px"><label for="f-rules">Regras e referência do documento aprovado</label><textarea id="f-rules" name="rules" maxlength="12000">${esc(p.rules)}</textarea></div><label class="check"><input type="checkbox" name="reconciled" ${p.reconciledAt?'checked':''}>Conferi os recebimentos, as despesas anteriores e os compromissos com os documentos e extratos. O histórico cadastrado está completo.</label><p class="muted">Essa confirmação é sua conferência dos registros; não é uma conciliação bancária automática.</p>${formEnd('Salvar projeto')}`);
  const add=r=>{const el=document.createElement('div');el.className='rubric-row';el.dataset.id=r.id;el.innerHTML=`<div class="field"><label>Nome da rubrica</label><input aria-label="Nome da rubrica" class="rubric-name" value="${esc(r.name)}" required maxlength="200"></div><div class="field"><label>Valor aprovado (R$)</label><input aria-label="Valor aprovado da rubrica" class="rubric-budget" inputmode="decimal" value="${numberInput(r.budget)}" placeholder="Não informado"></div>`;$('#rubricRows').append(el);};
  p.rubrics.forEach(add);if(!p.rubrics.length)add({id:uid(),name:'',budget:null});$('#addRubric').onclick=()=>add({id:uid(),name:'',budget:null});
  bindForm(async f=>{
    p.name=f.get('name').trim();p.source=f.get('source').trim();p.startsOn=f.get('startsOn');p.endsOn=f.get('endsOn');p.rules=f.get('rules');
    if(p.startsOn&&p.endsOn&&p.startsOn>p.endsOn)throw Error('O fim da vigência deve ser posterior ao início.');
    p.rubrics=$$('#rubricRows .rubric-row').map(r=>({...(p.rubrics.find(x=>x.id===r.dataset.id)||{}),id:r.dataset.id,name:r.querySelector('.rubric-name').value.trim(),budget:r.querySelector('.rubric-budget').value.trim()===''?null:cents(r.querySelector('.rubric-budget').value)}));
    if(new Set(p.rubrics.map(r=>norm(r.name))).size!==p.rubrics.length)throw Error('Use nomes diferentes para cada rubrica.');
    p.reconciledAt=f.has('reconciled')?p.reconciledAt||now():null;
    await commit(d=>{const i=d.projects.findIndex(x=>x.id===p.id);if(i>=0)d.projects[i]=p;else d.projects.push(p);},'Projeto e rubricas atualizados: '+p.name);projectId=p.id;render();close();toast('Projeto salvo.');
  });
}
function actionModal(draft={},existing=null){
  if(!needProject())return;const p=project(),a=existing||{id:uid(),title:draft.title||'',date:draft.date||today(),kind:'Reunião',description:'',location:'',people:null};
  modal(existing?'Editar ação':'Registrar uma ação',`<form id="modalForm">${field('title','O que foi realizado?',a.title,'text','required maxlength="500"')}<div class="form-grid">${field('date','Data',a.date,'date','required')}${field('kind','Tipo de ação',a.kind,'text','required')}</div><div class="field"><label for="f-description">Conte um pouco sobre a atividade</label><textarea id="f-description" name="description" maxlength="12000">${esc(a.description)}</textarea></div><div class="form-grid">${field('location','Local / comunidade',a.location)}${field('people','Número de participantes (se conhecido)',a.people??'','number','min="0" step="1"')}</div><p class="muted">Depois de salvar, você pode anexar fotos e documentos a esta ação.</p>${formEnd('Salvar ação')}`);
  bindForm(async f=>{const entry={...a,projectId:p.id,title:f.get('title').trim(),date:f.get('date'),kind:f.get('kind'),description:f.get('description'),location:f.get('location'),people:f.get('people')===''?null:Number(f.get('people')),updatedAt:now()};if(!validDate(entry.date)||entry.date>today())throw Error('Para uma ação realizada, informe a data de hoje ou anterior.');await commit(d=>{const i=d.actions.findIndex(x=>x.id===a.id);if(i<0)d.actions.push(entry);else d.actions[i]=entry;},'Ação registrada: '+entry.title);close();toast('Ação salva.');});
}
const allowedTypes=['application/pdf','image/jpeg','image/png','image/webp','application/xml','text/xml','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const readDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
async function hash(file){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function documentModal(existing=null,actionId=''){
  if(!needProject())return;const p=project(),d=existing||{id:uid(),name:'',title:'',kind:'Nota fiscal',rubricId:'',actionId,date:today(),supplier:'',invoice:'',amount:null};
  modal(existing?'Organizar documento':'Guardar documento original',`<form id="modalForm">${!existing?'<div class="field"><label for="f-file">Arquivo · PDF, foto, XML, Word, Excel ou texto · até 10 MB</label><input id="f-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,.docx,.xlsx,.csv,.txt" required></div><button class="secondary" type="button" id="readInvoice">✦ Ler com IA e sugerir campos</button><p class="muted">A leitura envia o documento à IA conectada. Os campos extraídos são sugestões e precisam da sua conferência.</p>':''}${field('title','Nome para encontrar depois',d.title)}<div class="form-grid"><div class="field"><label for="f-kind">Tipo</label><select id="f-kind" name="kind">${['Nota fiscal','Comprovante','Orçamento','Termo / edital','Foto','Relatório','Outro'].map(k=>`<option ${d.kind===k?'selected':''}>${k}</option>`).join('')}</select></div>${field('date','Data do documento',d.date,'date','required')}<div class="field"><label for="f-rubricId">Rubrica</label><select id="f-rubricId" name="rubricId">${rubricOptions(p,d.rubricId,'Documento geral do projeto')}</select></div>${field('amount','Valor total (R$), se houver',numberInput(d.amount),'text','inputmode="decimal"')}</div>${field('supplier','Fornecedor / autor',d.supplier)}${field('invoice','Número da nota fiscal',d.invoice)}<div class="field"><label for="f-actionId">Ação vinculada</label><select id="f-actionId" name="actionId"><option value="">Sem vínculo com ação</option>${data.actions.filter(x=>x.projectId===p.id).map(a=>`<option value="${esc(a.id)}" ${d.actionId===a.id?'selected':''}>${esc(a.title)}</option>`).join('')}</select></div><p class="muted">Guardar a nota não registra o pagamento. Use “Lançamento” para informar a despesa efetivamente paga ou reservar uma conta a pagar.</p>${formEnd(existing?'Salvar organização':'Guardar original')}`);
  if(!existing)$('#readInvoice').onclick=async()=>{
    const b=$('#readInvoice');b.disabled=true;$('#formError').textContent='';try{
      if(!repo.user)throw Error('A leitura automática depende da ativação da IA e de uma conta conectada. Você já pode guardar o original e preencher os campos.');
      const file=$('#f-file').files[0];checkFile(file);if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw Error('A leitura automática aceita PDF e fotos JPG, PNG ou WebP.');
      const r=await repo.ask({mode:'invoice',projectId:p.id,file:{name:file.name,type:file.type,data:await readDataURL(file)}});
      for(const k of ['title','date','supplier','invoice','rubricId'])if(r.draft?.[k])$('#f-'+k).value=r.draft[k];if(r.draft?.amount!=null)$('#f-amount').value=numberInput(r.draft.amount);
      $('#formError').textContent=r.text||'Confira cada campo. Nenhum registro foi salvo.';
    }catch(e){$('#formError').textContent=e.message;}finally{b.disabled=false;}
  };
  bindForm(async f=>{
    const item={...d,projectId:p.id,title:f.get('title').trim(),kind:f.get('kind'),date:f.get('date'),rubricId:f.get('rubricId')||null,actionId:f.get('actionId')||null,supplier:f.get('supplier'),invoice:f.get('invoice'),amount:f.get('amount').trim()?cents(f.get('amount')):null,updatedAt:now()};
    if(!validDate(item.date))throw Error('Data inválida.');let uploaded=false;
    if(!existing){const file=f.get('file');checkFile(file);item.hash=await hash(file);if(data.documents.some(x=>x.hash===item.hash))throw Error('Esse arquivo já foi guardado. Procure-o em Documentos e edite seu vínculo, se necessário.');item.name=file.name;item.mime=file.type||'application/octet-stream';item.size=file.size;item.storagePath=await repo.upload(file,item.id);uploaded=true;}
    try{await commit(next=>{const i=next.documents.findIndex(x=>x.id===item.id);if(i<0)next.documents.push(item);else next.documents[i]=item;},'Documento organizado: '+(item.title||item.name));}catch(e){if(uploaded)await repo.removeFile(item.storagePath).catch(()=>{});throw e;}
    close();toast('Documento original guardado e vinculado.');
  });
}
function checkFile(file){if(!file?.size)throw Error('Selecione um arquivo.');if(file.size>10*1024*1024)throw Error('O arquivo deve ter até 10 MB.');if(!allowedTypes.includes(file.type)&&!(/\.(xml|csv|txt)$/i.test(file.name)&&!file.type))throw Error('Formato não aceito. Use PDF, foto, XML, Word, Excel ou texto.');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function backup(){
  toast('Preparando backup com os arquivos originais…');const snapshot=structuredClone(data),files={};
  if(snapshot.documents.reduce((s,d)=>s+(d.size||0),0)>100*1024*1024)throw Error('O backup excede 100 MB. Baixe os documentos individualmente antes de uma exportação assistida.');
  for(const d of snapshot.documents)files[d.id]=await readDataURL(await repo.file(d));
  download(new Blob([JSON.stringify({format:'transforma-backup-v1',exportedAt:now(),data:snapshot,files})],{type:'application/json'}),`transforma-backup-${today()}.json`);toast('Backup completo preparado, incluindo documentos.');
}
async function importBackup(file){
  if(!file)return;if(file.size>150*1024*1024)throw Error('Backup acima de 150 MB.');const backup=JSON.parse(await file.text());if(backup.format!=='transforma-backup-v1')throw Error('Formato de backup desconhecido.');validateData(backup.data);
  modal('Revisar restauração do backup',`<p>O backup contém <strong>${backup.data.projects.length} projetos, ${backup.data.entries.length} lançamentos e ${backup.data.documents.length} documentos</strong>.</p><div class="notice">Para preservar seus registros, a restauração completa é permitida apenas em um espaço vazio. Você pode usá-la para levar seu backup local a uma conta nova.</div><form id="modalForm">${formEnd('Restaurar backup completo')}`);
  bindForm(async()=>{
    if(data.projects.length||data.entries.length||data.documents.length)throw Error('Este espaço já contém registros. Use uma conta nova ou solicite uma importação assistida.');
    const incoming=structuredClone(backup.data),files=[];
    for(const d of incoming.documents){const encoded=backup.files?.[d.id];if(typeof encoded!=='string'||!/^data:[^,]*;base64,/.test(encoded))throw Error('Arquivo original ausente no backup: '+d.name);const b=await (await fetch(encoded)).blob();if(b.size>10*1024*1024 || await hash(b)!==d.hash)throw Error('Integridade do arquivo inválida: '+d.name);files.push([d,b]);}
    const uploaded=[];
    try{for(const [d,b]of files){d.storagePath=await repo.upload(b,d.id);uploaded.push(d.storagePath);}await repo.save(incoming);data=incoming;render();close();toast('Backup restaurado com os originais.');}catch(e){for(const path of uploaded)await repo.removeFile(path).catch(()=>{});throw e;}
  });
}
function accountModal(){
  if(!repo.configured){modal('Conta e conexão',`<div class="notice"><strong>A nuvem e a IA ainda não foram ativadas.</strong><br>Seus registros atuais ficam neste navegador, incluindo os arquivos originais. Eles não aparecem automaticamente em outro dispositivo.</div><p>O sistema já está preparado para contas individuais, armazenamento privado e conversa com IA. A ativação requer um projeto Supabase e uma chave de IA no servidor.</p><div class="row-actions"><button class="secondary" id="modalBackup">Baixar backup completo</button><button class="secondary" id="modalImport">Restaurar backup</button></div><p class="muted">Nunca envie uma chave secreta na conversa nem a coloque no código público.</p>`);$('#modalBackup').onclick=()=>backup().catch(e=>toast(e.message));$('#modalImport').onclick=()=>{close();$('#backupFile').click();};return;}
  if(repo.user){modal('Sua conta',`<p>Conectado como <strong>${esc(repo.user.email)}</strong>.</p><p>Registros salvos na nuvem. Os documentos são privados e vinculados à sua conta.</p><div class="row-actions"><button class="secondary" id="modalBackup">Baixar backup completo</button><button class="secondary" id="modalImport">Restaurar backup local</button><button class="danger" id="signOut">Sair da conta</button></div>`);$('#signOut').onclick=()=>repo.client.auth.signOut();$('#modalBackup').onclick=()=>backup().catch(e=>toast(e.message));$('#modalImport').onclick=()=>{close();$('#backupFile').click();};return;}
  modal('Entrar no seu espaço',`<form id="modalForm">${field('email','E-mail','','email','required autocomplete="email"')}${field('password','Senha','','password','required minlength="10" autocomplete="current-password"')}<div class="field"><label for="f-authMode">Acesso</label><select id="f-authMode" name="authMode"><option value="login">Já tenho conta</option><option value="signup">Criar minha conta</option><option value="reset">Esqueci a senha</option></select></div><p class="muted">Uma conta nova começa vazia. Para levar os registros deste navegador, baixe o backup antes de entrar e restaure-o na conta.</p>${formEnd('Continuar')}`);
  $('#f-authMode').onchange=()=>$('#f-password').required=$('#f-authMode').value!=='reset';
  bindForm(async f=>{const email=f.get('email'),password=f.get('password'),mode=f.get('authMode'),redirectTo=location.origin+location.pathname;let r;if(mode==='signup')r=await repo.client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});else if(mode==='reset')r=await repo.client.auth.resetPasswordForEmail(email,{redirectTo});else r=await repo.client.auth.signInWithPassword({email,password});if(r.error)throw r.error;if(r.data?.session)location.reload();else{$('#formError').className='success';$('#formError').textContent='Confira seu e-mail para continuar.';}});
}
async function importSeeds(){
  const missing=structuredClone(seedProjects.filter(p=>!data.projects.some(x=>x.id===p.id)));try{const legacy=JSON.parse(localStorage.getItem('plataforma_unemat_v5'));for(const p of missing){const key={capes:'capesObjetivos',fapemat:'fapematAtividades',cop:'copObjetivos'}[p.id];if(Array.isArray(legacy?.[key]))p.plan=legacy[key];}}catch{}if(!missing.length){toast('Os três projetos já estão cadastrados.');return;}
  modal('Importar os projetos do painel',`<p>Serão importados os orçamentos e o planejamento de <strong>${missing.map(p=>esc(p.name)).join(', ')}</strong>.</p><div class="notice">Não há um histórico de pagamentos no código do painel. Nenhuma despesa ou entrada de dinheiro será presumida.</div><form id="modalForm">${formEnd('Importar orçamentos e planejamento')}`);
  bindForm(async()=>{await commit(d=>d.projects.push(...structuredClone(missing)),'Orçamentos e planejamento importados do painel');close();toast('Projetos importados. Agora podemos organizar seus registros.');});
}
function cancelEntry(id){const entry=data.entries.find(e=>e.id===id&&!e.cancelledAt);if(!entry)return;modal('Corrigir ou cancelar lançamento',`<p>${esc(entry.title)} · ${money(entry.amount)}</p><div class="notice">O registro ficará no histórico como cancelado e deixará de compor os saldos. Para corrigir um valor, registre depois o lançamento correto.</div><form id="modalForm">${field('reason','Motivo','','text','required minlength="8"')}${formEnd('Confirmar cancelamento')}`);bindForm(async f=>{await commit(d=>{const e=d.entries.find(x=>x.id===id);e.cancelledAt=now();e.cancelReason=f.get('reason');},'Lançamento cancelado com justificativa');close();toast('Cancelamento salvo no histórico.');});}
function exportCsv(){const rows=[['data','tipo','descricao','rubrica','valor_reais','cancelado','motivo']];for(const e of data.entries.filter(e=>e.projectId===projectId))rows.push([e.date,types[e.type],e.title,project().rubrics.find(r=>r.id===e.rubricId)?.name||'',numberInput(e.amount),e.cancelledAt||'',e.cancelReason||'']);const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';download(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'lancamentos-'+today()+'.csv');}
function dictate(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){toast('Este navegador não oferece ditado. Use o microfone do teclado do celular.');return;}const r=new Speech();r.lang='pt-BR';r.interimResults=false;$('#micButton').disabled=true;$('#micButton').textContent='Ouvindo…';r.onresult=e=>{$('#question').value=e.results[0][0].transcript;$('#question').focus();};r.onerror=()=>toast('Não consegui ouvir. Confira a permissão do microfone ou use o teclado.');r.onend=()=>{$('#micButton').disabled=false;$('#micButton').textContent='◉ Falar';};try{r.start();}catch{r.onend();toast('Não foi possível iniciar o microfone.');}}
$('#closeModal').onclick=close;
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.hasAttribute('data-close'))close();
    if(b.dataset.view)showView(b.dataset.view);
    if(b.dataset.prompt)await send(b.dataset.prompt);
    if(b.dataset.editProject)projectModal(data.projects.find(p=>p.id===b.dataset.editProject));
    if(b.dataset.pay)entryModal({},data.entries.find(x=>x.id===b.dataset.pay));
    if(b.dataset.cancelEntry)cancelEntry(b.dataset.cancelEntry);
    if(b.dataset.file){const doc=data.documents.find(x=>x.id===b.dataset.file);download(await repo.file(doc),doc.name);}
    if(b.dataset.editDoc)documentModal(data.documents.find(x=>x.id===b.dataset.editDoc));
    if(b.dataset.editAction)actionModal({},data.actions.find(x=>x.id===b.dataset.editAction));
    if(b.dataset.actionDoc)documentModal(null,b.dataset.actionDoc);
    if(b.dataset.draft){const m=data.messages.find(m=>m.id===b.dataset.draft),d={...m.draft,sourceMessageId:m.id};if(d.kind==='simulate')simulateModal(d);else if(d.kind==='action')actionModal(d);else if(d.kind==='documents')documentModal();else entryModal(d);}
    if(b.id==='simulateBalance')simulateModal();if(b.id==='exportCsv')exportCsv();
  }catch(err){toast(err.message);}
});
$('#projectSelect').onchange=e=>{projectId=e.target.value;render();};
$('#chatForm').onsubmit=e=>{e.preventDefault();const text=$('#question').value.trim();if(text)send(text);};
$('#newEntry').onclick=()=>entryModal();$('#quickSimulate').onclick=()=>simulateModal();
for(const id of ['newDocument','quickUpload','attachButton'])$('#'+id).onclick=()=>documentModal();
$('#newAction').onclick=()=>actionModal();$('#newProject').onclick=()=>projectModal();$('#seedButton').onclick=()=>importSeeds();
$('#documentSearch').oninput=renderDocuments;$('#documentRubric').onchange=renderDocuments;
$('#accountButton').onclick=accountModal;$('#profileButton').onclick=accountModal;$('#micButton').onclick=dictate;
$('#exportButton').onclick=()=>backup().catch(e=>toast(e.message));$('#importButton').onclick=()=>$('#backupFile').click();$('#backupFile').onchange=e=>{importBackup(e.target.files[0]).catch(e=>toast(e.message));e.target.value='';};
addEventListener('password-recovery',()=>{modal('Escolha sua nova senha',`<form id="modalForm">${field('password','Nova senha','','password','required minlength="10" autocomplete="new-password"')}${formEnd('Salvar nova senha')}`);bindForm(async f=>{const {error}=await repo.client.auth.updateUser({password:f.get('password')});if(error)throw error;location.reload();});});
try{await repo.init();data=await repo.load();render();if(!data.projects.length)showView('projects');}catch(e){$('#mode').textContent='Falha ao carregar';$('#messages').textContent='Não foi possível abrir os registros: '+e.message+'. Nenhum dado foi substituído. Recarregue para tentar novamente.';$$('button,select,textarea').forEach(x=>x.disabled=true);}
