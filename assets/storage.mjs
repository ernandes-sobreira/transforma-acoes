import {config} from './config.mjs';
import {validateData} from './finance.mjs';
export const emptyData = () => ({version:1,projects:[],entries:[],documents:[],actions:[],messages:[],audit:[]});
const db = new Promise((resolve,reject)=>{
  const r=indexedDB.open('transforma-assistente-v1',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('files');};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
async function local(store,mode,fn) {
  const d=await db;
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(store,mode), request=fn(tx.objectStore(store));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error || Error('Não foi possível salvar.'));tx.onerror=()=>reject(tx.error);
  });
}
export class Repository {
  constructor(){this.user=null;this.client=null;this.revision=0;this.localRevision=0;this.configured=!!(config.supabaseUrl && config.supabasePublishableKey);}
  async init(){
    if (this.configured) {
      await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./assets/vendor/supabase.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
      this.client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
      const {data,error}=await this.client.auth.getSession();if(error)throw error;
      this.user=data.session?.user || null;
      this.client.auth.onAuthStateChange((event,session)=>{
        if (event==='PASSWORD_RECOVERY') dispatchEvent(new CustomEvent('password-recovery'));
        if (event==='SIGNED_OUT' && this.user) {this.user=null;location.reload();}
      });
    }
    return this;
  }
  async load(){
    if (!this.user){const d=await local('state','readonly',s=>s.get('main'));this.localRevision=d?.revision||0;return d?validateData(d.data):emptyData();}
    const {data,error}=await this.client.from('ta_workspaces').select('revision,data').eq('owner_id',this.user.id).maybeSingle();
    if(error)throw error;this.revision=data?.revision||0;return data?validateData(data.data):emptyData();
  }
  async save(data){
    validateData(data);
    if (!this.user) {
      // Compare-and-swap inside a single IndexedDB transaction, including across tabs.
      const d=await db;
      await new Promise((resolve,reject)=>{
        const tx=d.transaction('state','readwrite'),s=tx.objectStore('state'),r=s.get('main');let conflict=false;
        r.onsuccess=()=>{if ((r.result?.revision||0)!==this.localRevision){conflict=true;tx.abort();return;}s.put({revision:this.localRevision+1,data},'main');};
        tx.oncomplete=resolve;tx.onabort=()=>reject(Error(conflict?'Outra aba atualizou os dados. Recarregue antes de salvar.':'Não foi possível salvar.'));tx.onerror=()=>reject(tx.error);
      });this.localRevision++;return;
    }
    const row={owner_id:this.user.id,revision:this.revision+1,data};
    const q=this.revision?this.client.from('ta_workspaces').update(row).eq('owner_id',this.user.id).eq('revision',this.revision):this.client.from('ta_workspaces').insert(row);
    const {data:result,error}=await q.select('revision');
    if(error)throw error;if(!result?.length)throw Error('Os dados foram atualizados em outro dispositivo. Recarregue antes de salvar.');this.revision=result[0].revision;
  }
  async upload(file,id){
    if(!this.user){await local('files','readwrite',s=>s.put(file,id));return id;}
    const path=`${this.user.id}/${id}`;
    const {error}=await this.client.storage.from('transforma-documentos').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if(error)throw error;return path;
  }
  async file(doc){
    if(!this.user){const b=await local('files','readonly',s=>s.get(doc.storagePath));if(!b)throw Error('Arquivo original não encontrado neste dispositivo.');return b;}
    const {data,error}=await this.client.storage.from('transforma-documentos').download(doc.storagePath);if(error)throw error;return data;
  }
  async removeFile(path){
    if(!this.user)return local('files','readwrite',s=>s.delete(path));
    const {error}=await this.client.storage.from('transforma-documentos').remove([path]);if(error)throw error;
  }
  async ask(body){
    if(!this.user)throw Error('Entre na conta conectada para usar a IA.');
    const {data,error}=await this.client.functions.invoke(config.functionName,{body});
    if(error){let detail;try{detail=(await error.context.json()).error;}catch{}throw Error(detail||'Não consegui conectar à IA. Os registros continuam disponíveis.');}
    if(data?.error)throw Error(data.error);return data;
  }
}
