import { appendFile, mkdir, readFile, stat, truncate, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";

export type RecordRow = {
  id:string; at:string; status:string; reason:string; latencyMs:number;
  selectedProfile?:string; selectedModel?:string; selectedThinking?:string; confidence?:number;
  observedModel?:string; observedThinking?:string; tokens?:number;
};

type StateEntry<T> = {key:string;value:T;createdAt:number};
export type StateStore<T> = {
  register(key:string,value:T):Promise<void>;
  lookup(key:string):Promise<T|undefined>;
  entries():Promise<StateEntry<T>[]>;
  clear():Promise<void>;
};

export class HistoryStore {
  constructor(private readonly store:StateStore<RecordRow>,readonly backend="OpenClaw native") {}
  async put(row:RecordRow) { await this.store.register(row.id,row); }
  async get(id:string) { return this.store.lookup(id); }
  async list() { return (await this.store.entries()).slice(-200).reverse().map(entry=>entry.value); }
  async clear() { await this.store.clear(); }
}

export function fileHistoryStore(path=join(resolveStateDir(),"plugins","jev-router","history.jsonl")):StateStore<RecordRow> {
  let writes=Promise.resolve();
  const enqueue=(operation:()=>Promise<void>)=>{
    const next=writes.then(operation);writes=next.catch(()=>{});return next;
  };
  const read=async()=>{
    let text="";
    try{text=await readFile(path,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    const values=new Map<string,StateEntry<RecordRow>>();
    for(const line of text.split("\n")){if(!line)continue;try{const value=JSON.parse(line) as RecordRow;if(!value?.id||!value.at)continue;values.delete(value.id);values.set(value.id,{key:value.id,value,createdAt:Date.parse(value.at)||0});}catch{/* ignore interrupted append */}}
    return [...values.values()].slice(-200);
  };
  const compact=async()=>{
    const values=await read(),temporary=path+"."+randomUUID()+".tmp";
    try {
      await writeFile(temporary,values.map(entry=>JSON.stringify(entry.value)).join("\n")+(values.length?"\n":""),{encoding:"utf8",mode:0o600,flag:"wx"});
      await rename(temporary,path);
    } finally { await unlink(temporary).catch(()=>{}); }
  };
  return {
    register(_key,value){const line=JSON.stringify(value)+"\n";return enqueue(async()=>{await mkdir(dirname(path),{recursive:true});await appendFile(path,line,{encoding:"utf8",mode:0o600});try{if((await stat(path)).size>1024*1024)await compact();}catch{/* telemetry remains best effort */}});},
    async lookup(key){await writes;return (await read()).find(entry=>entry.key===key)?.value;},
    async entries(){await writes;return read();},
    clear(){return enqueue(async()=>{await mkdir(dirname(path),{recursive:true});try{await truncate(path,0);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")await writeFile(path,"",{encoding:"utf8",mode:0o600});else throw error;}});},
  };
}
