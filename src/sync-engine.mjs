// Optimistic concurrency: the server compares revisions in one transaction.
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function combine(local,cloud){
 const parts=p=>{const {primaryStoryId='original',otherStories=[],...world}=p;return [{id:primaryStoryId,world},...otherStories];};
 const items=parts(local),ids=new Set(items.map(x=>x.id));
 for(const item of parts(cloud)){
  if(items.some(x=>x.id===item.id&&canonical(x.world)===canonical(item.world)))continue;
  let id=item.id,world=item.world;
  if(ids.has(id)){do{id=crypto.randomUUID()}while(ids.has(id));world={...world,name:world.name+'（雲端副本）'};}
  ids.add(id);items.push({id,world});
 }
 const [first,...rest]=items;return {...first.world,...(first.id==='original'?{}:{primaryStoryId:first.id}),...(rest.length?{otherStories:rest}:{})};
}
export class SyncEngine {
  constructor({remote, snapshot, apply, backup, saveMeta, status, meta={}}) {
    Object.assign(this,{remote,snapshot,apply,backup,saveMeta,status});
    this.meta={owner:null,revision:0,dirty:false,edited:false,...meta};
    this.owner=null;this.epoch=0;this.sequence=0;this.running=null;this.conflict=null;
  }
  changed(){this.sequence++;this.meta.dirty=true;this.meta.edited=true;this.saveMeta({...this.meta});this.status(this.conflict?(this.conflict.first?'choose':'conflict'):this.owner?'pending':'signed-out');}
  async connect(owner){this.owner=owner;this.epoch++;if(this.running)await this.running;return this.sync();}
  stop(){this.owner=null;this.epoch++;this.conflict=null;this.status('signed-out');}
  async commitMeta(){await this.saveMeta({...this.meta});}
  async adopt(row){
    const epoch=this.epoch,sequence=this.sequence;
    await this.backup(this.snapshot(),'同步前的本機副本');
    if(epoch!==this.epoch)return;
    if(sequence!==this.sequence)return this.block(row);
    const next={owner:this.owner,revision:row.revision,dirty:false,edited:true};
    this.apply(row.payload,next);
    this.meta=next;
    this.conflict=null;await this.commitMeta();this.status('synced');
  }
  block(row,first=false){this.conflict={row,first};this.status(first?'choose':'conflict');}
  async sync(){
    if(!this.owner||this.conflict)return;
    if(this.running)return this.running;
    this.running=this.perform().finally(()=>{this.running=null;});return this.running;
  }
  async perform(){
    const epoch=this.epoch,owner=this.owner,sequence=this.sequence;
    try{
      this.status('syncing');const row=await this.remote.read(owner);
      if(epoch!==this.epoch)return;
      if(this.meta.owner!==owner){
        if(!this.meta.edited&&row&&sequence===this.sequence)return await this.adopt(row);
        if(this.meta.owner)return this.block(row,true);
        if(row){
          const local=this.snapshot();
          if(canonical(local)===canonical(row.payload))return await this.adopt(row);
          await this.backup(local,'首次連結前的本機副本');
          if(epoch!==this.epoch)return;
          const merged=combine(this.snapshot(),row.payload);
          this.apply(merged,{...this.meta,owner,revision:row.revision,dirty:true,edited:true});
        }
        this.meta={owner,revision:row?.revision||0,dirty:true,edited:true};await this.commitMeta();
        if(epoch!==this.epoch)return;
      }
      const revision=row?.revision||0;
      if(revision!==this.meta.revision){
        if(this.meta.dirty||sequence!==this.sequence){
          if(row&&canonical(row.payload)===canonical(this.snapshot())){this.meta.revision=revision;this.meta.dirty=false;await this.commitMeta();this.status('synced');return;}
          return this.block(row);
        }
        if(row)return await this.adopt(row);
        return this.block(null);
      }
      if(!this.meta.dirty){this.status('synced');return;}
      const sentSequence=this.sequence,payload=this.snapshot();
      const result=await this.remote.write(owner,this.meta.revision,payload);
      if(epoch!==this.epoch)return;
      if(!result.ok)return this.block(result.current);
      this.meta.revision=result.revision;this.meta.dirty=sentSequence!==this.sequence;
      await this.commitMeta();this.status(this.meta.dirty?'pending':'synced');
    }catch(error){if(epoch===this.epoch)this.status('error',error);}
  }
  async resolve(choice){
    if(!this.conflict||!this.owner)return;
    const {row}=this.conflict;
    if(choice==='remote'){
      if(!row)throw Error('雲端尚未建立世界，請選擇上傳目前世界。');
      return this.adopt(row);
    }
    if(row)await this.backup(row.payload,'選擇本機版本前的雲端副本');
    this.meta={owner:this.owner,revision:row?.revision||0,dirty:true,edited:true};
    this.conflict=null;await this.commitMeta();return this.sync();
  }
}
