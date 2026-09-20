import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../dist/index.js";
test("runtime schema accepts routing config and rejects unknown settings",()=>{
 assert.equal(plugin.configSchema.safeParse({mode:"route",profiles:[]}).success,true);
 assert.equal(plugin.configSchema.safeParse({optimization:"quality",profiles:[]}).success,true);
 assert.equal(plugin.configSchema.safeParse({optimization:"cheapest",profiles:[]}).success,false);
 assert.equal(plugin.configSchema.safeParse({continuity:false,profiles:[]}).success,true);
 assert.equal(plugin.configSchema.safeParse({continuity:"yes",profiles:[]}).success,false);
 assert.equal(plugin.configSchema.safeParse({profiles:[],jevKey:{source:"store",provider:"default",id:"JEV_ROUTER_API_KEY"}}).success,true);
 assert.equal(plugin.configSchema.safeParse({profiles:[],jevKey:{source:"store",provider:"default"}}).success,false);
 assert.equal(plugin.configSchema.safeParse({mode:"oops"}).success,false);
 assert.equal(plugin.configSchema.safeParse({apiKey:"do-not-store"}).success,false);
});
