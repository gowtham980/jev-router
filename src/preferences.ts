import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import type { Optimization, Profile } from "./router.js";

export type Preferences = {profiles?:Profile[];optimization?:Optimization;continuity?:boolean;jevKey?:unknown};
export type PreferenceStore = {
  load():Promise<Preferences|undefined>;
  save(value:Preferences):Promise<void>;
};

export function keyedPreferenceStore(store:{
  register(key:string,value:Preferences):Promise<void>;
  lookup(key:string):Promise<Preferences|undefined>;
}):PreferenceStore {
  return {load:()=>store.lookup("preferences"),save:value=>store.register("preferences",value)};
}

export function filePreferenceStore(path=join(resolveStateDir(),"plugins","jev-router","preferences.json")):PreferenceStore {
  return {
    async load(){
      try{return JSON.parse(await readFile(path,"utf8")) as Preferences;}
      catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
    },
    async save(value){
      await mkdir(dirname(path),{recursive:true});
      const temporary=path+"."+randomUUID()+".tmp";
      try {
        await writeFile(temporary,JSON.stringify(value)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
        await rename(temporary,path);
      } finally { await unlink(temporary).catch(()=>{}); }
    },
  };
}
