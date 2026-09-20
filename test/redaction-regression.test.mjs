import test from "node:test";
import assert from "node:assert/strict";
import {redact,createRouter,parseConfig} from "../dist/router.js";

test("redacts JSON, nested credentials and escaped quoted values completely",()=>{
  for(const prompt of [
    JSON.stringify({api_key:"synthetic-private-value"}),
    JSON.stringify({nested:{access_token:'synthetic-private-value" trailing-secret'}}),
    JSON.stringify({PASSWORD:"synthetic-private-value\n trailing-secret"}),
    "{'secret':'synthetic-private-value\\' trailing-secret'}",
    "api-key = synthetic-private-value",
    'password="synthetic-private-value trailing-secret"',
  ]){
    const clean=redact(prompt);
    assert.ok(!clean.includes("synthetic-private-value"),clean);
    assert.ok(!clean.includes("trailing-secret"),clean);
    assert.ok(clean.includes("[redacted]"),clean);
  }
});

test("redaction happens before truncation and before transport",async()=>{
  const config=parseConfig({maxPromptChars:100,profiles:[
    {id:"routine",model:"ollama/example",description:"Routine work",input:["text"]},
  ]});
  let transmitted;
  const route=createRouter(config,{
    credential:async()=>({url:"https://example.invalid",model:"test",key:"synthetic"}),
    fetch:async(_url,request)=>{
      transmitted=JSON.parse(request.body).state;
      return new Response(JSON.stringify({answers:{route:{choice:"routine",confidence:.9}}}));
    },
  });
  await route(JSON.stringify({api_key:"synthetic-private-value ".repeat(100),task:"Sort a list"}),config.profiles);
  assert.ok(!transmitted.includes("synthetic-private-value"));
  assert.ok(transmitted.includes("Sort a list"));
  assert.ok(transmitted.length<=100);
});
