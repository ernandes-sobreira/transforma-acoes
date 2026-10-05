// This exact module runs in the browser and in the authenticated AI backend.
export const money = cents => cents == null ? 'Não informado' : (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'America/Campo_Grande'});
export function cents(value) {
  const s = String(value).trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(s)) throw Error('Use um valor como 1.250,50, sem sinais negativos.');
  const [whole, decimal = ''] = s.replaceAll('.', '').split(',');
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 1e12) throw Error('Valor acima do limite.');
  return result;
}
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s;
}
export function validateEntry(entry, project) {
  if (!project || entry.projectId !== project.id) throw Error('Selecione um projeto válido.');
  if (!['income','expense','commitment'].includes(entry.type)) throw Error('Tipo de lançamento inválido.');
  if (!Number.isSafeInteger(entry.amount) || entry.amount <= 0 || entry.amount > 1e12) throw Error('Informe um valor maior que zero.');
  if (!entry.title?.trim()) throw Error('Descreva o lançamento.');
  if (!validDate(entry.date)) throw Error('Informe uma data válida.');
  if (entry.type !== 'commitment' && entry.date > today()) throw Error('Recebimentos e pagamentos não podem ter data futura. Use uma reserva para compromissos futuros.');
  if (entry.type !== 'income' && !project.rubrics.some(r=>r.id === entry.rubricId)) throw Error('Selecione a rubrica desse projeto.');
}
export function balances(project, entries) {
  const rows = entries.filter(e=>e.projectId === project.id && !e.cancelledAt);
  const sum = type => rows.filter(e=>e.type === type).reduce((a,e)=>a+e.amount,0);
  const paid = sum('expense'), committed = sum('commitment'), received = sum('income');
  const rubrics = project.rubrics.map(r=>{
    const selected = rows.filter(e=>e.rubricId === r.id);
    const paid = selected.filter(e=>e.type==='expense').reduce((a,e)=>a+e.amount,0);
    const committed = selected.filter(e=>e.type==='commitment').reduce((a,e)=>a+e.amount,0);
    return {...r,paid,committed,remaining:r.budget == null ? null : r.budget-paid-committed};
  });
  return {received,paid,committed,cash:received-paid,freeCash:received-paid-committed,rubrics,complete:!!project.reconciledAt};
}
export function assess(project, entries, rubricId, amount, date = today()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Informe o valor da compra.');
  if (!validDate(date)) throw Error('Data inválida.');
  const b = balances(project, entries), r = b.rubrics.find(r=>r.id===rubricId);
  const blockers=[], pending=[];
  if (!r) pending.push('Escolha a rubrica da compra.');
  else if (r.budget == null) pending.push('O valor aprovado desta rubrica não foi informado.');
  else if (amount > r.remaining) blockers.push(`Faltam ${money(amount-r.remaining)} na rubrica ${r.name}.`);
  if (!project.reconciledAt) pending.push('Confira os recebimentos, os pagamentos anteriores e as reservas antes de usar o saldo como disponível.');
  else if (amount > b.freeCash) blockers.push(`Faltam ${money(amount-b.freeCash)} no caixa livre do projeto.`);
  if (project.endsOn && date > project.endsOn) blockers.push('A compra está fora da vigência cadastrada do projeto.');
  if (project.startsOn && date < project.startsOn) blockers.push('A compra é anterior à vigência cadastrada.');
  pending.push('A elegibilidade do item e as exigências do financiador precisam ser conferidas no instrumento vigente.');
  const status=blockers.length?'blocked':(!project.reconciledAt || !r || r.budget==null)?'pending':'fits';
  return {status,headline:status==='blocked'?'Não cabe nos saldos cadastrados':status==='pending'?'Ainda não posso confirmar':'Cabe financeiramente; confira as regras',blockers,pending,amount,rubricAfter:r?.remaining==null?null:r.remaining-amount,cashAfter:project.reconciledAt?b.freeCash-amount:null};
}
export function localIntent(text, project) {
  const q=norm(text);
  const match = text.match(/(?:R\$\s*|(?:gastar|gastei|paguei|recebi|reservar|reservei|comprar|compra de)\s+)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  const amount=match?cents(match[1]):null;
  const choices=project?.rubrics.filter(r=> q.includes(norm(r.name)) || (r.keywords||[]).some(k=>q.includes(norm(k)))) || [];
  const rubricId=choices.length===1?choices[0].id:null;
  let intent='help';
  if (/(posso|cabe|simul|comprar|gastar)/.test(q)) intent='simulate';
  else if (/(gastei|paguei|registrar despesa)/.test(q)) intent='expense';
  else if (/(recebi|recebimento|entrada de)/.test(q)) intent='income';
  else if (/(reservar|reservei|compromisso)/.test(q)) intent='commitment';
  else if (/(nota|documento|comprovante)/.test(q)) intent='documents';
  else if (/(acao|acoes|reuniao|oficina|palestra|atividade)/.test(q)) intent='action';
  else if (/(saldo|gasto|quanto|rubrica|orcamento)/.test(q)) intent='balance';
  return {intent,amount,rubricId,title:text,date:null,answer:''};
}
export function validateData(d) {
  if (d?.version!==1 || !['projects','entries','actions','documents','messages','audit'].every(k=>Array.isArray(d[k]))) throw Error('Backup incompatível.');
  const unique = rows => new Set(rows.map(r=>r.id)).size===rows.length && rows.every(r=>typeof r.id==='string');
  for (const k of ['projects','entries','actions','documents']) if (!unique(d[k])) throw Error('IDs inválidos ou repetidos no backup.');
  for (const p of d.projects) {
    if (!p.name || !Array.isArray(p.rubrics) || !unique(p.rubrics)) throw Error('Projeto inválido.');
    for (const r of p.rubrics) if (!r.name || (r.budget!==null && (!Number.isSafeInteger(r.budget)||r.budget<0))) throw Error('Rubrica inválida.');
  }
  for (const e of d.entries) validateEntry(e,d.projects.find(p=>p.id===e.projectId));
  for (const e of [...d.actions,...d.documents]) {
    const p=d.projects.find(p=>p.id===e.projectId);
    if (!p || (e.rubricId && !p.rubrics.some(r=>r.id===e.rubricId))) throw Error('Vínculo de projeto/rubrica inválido.');
  }
  return d;
}
