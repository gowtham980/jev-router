import test from "node:test";
import assert from "node:assert/strict";
import {summarize,classifyFailure,analyzeUsage} from "../dist/insights.js";

test("failure categories never persist raw host errors",()=>{
  assert.equal(classifyFailure("OAuth credential invalid: secret detail"),"authentication");
  assert.equal(classifyFailure("quota_exceeded"),"quota");
  assert.equal(classifyFailure("something private and unknown"),undefined);
});

test("recent insights exclude previews and keep failed runs distinct from model matches",()=>{
  const at="2026-10-02T12:00:00.000Z";
  const rows=[
    {at,status:"model_verified",reason:"jev_choice",latencyMs:400,selectedProfile:"routine",selectedModel:"sol",observedModel:"sol"},
    {at,status:"run_failed",reason:"jev_choice",latencyMs:600,selectedProfile:"routine",selectedModel:"sol",observedModel:"sol"},
    {at,status:"kept_current",reason:"low_confidence",latencyMs:200},
    {at,status:"observed_only",reason:"routing_hook_not_observed",latencyMs:0,observedModel:"astra"},
    {at,status:"preview",reason:"jev_choice",latencyMs:100,selectedModel:"luna"},
  ];
  const profiles=[{id:"fast",model:"luna"},{id:"routine",model:"sol"},{id:"deep",model:"astra"},{id:"alternate",model:"sol"}];
  const report=summarize(rows,profiles,Date.parse(at)-1);
  assert.deepEqual([report.total,report.matched,report.kept,report.failed,report.observedOnly,report.lowConfidence,report.medianLatency],[4,1,1,1,1,1,400]);
  assert.deepEqual([...report.selected],[["fast",0],["routine",2],["deep",0],["alternate",0]]);
  assert.equal(summarize(rows,profiles,Date.parse(at)+1).total,0);
});


test("cost and quality use observed models, complete token splits and explicit feedback",()=>{
  const at=new Date().toISOString();
  const rows=[
    {at,status:"model_verified",reason:"jev_choice",latencyMs:4,observedModel:"p/cheap",inputTokens:1000,outputTokens:200,feedback:"good",completed:true},
    {at,status:"run_failed",reason:"jev_choice",latencyMs:4,selectedModel:"p/cheap",observedModel:"p/other",inputTokens:100,feedback:"stronger",completed:false},
    {at,status:"preview",reason:"jev_choice",latencyMs:4,observedModel:"p/cheap",inputTokens:999,outputTokens:999},
  ];
  const report=analyzeUsage(rows,{billing:"api",baselineModel:"p/premium",rates:{"p/cheap":{input:1,output:2},"p/premium":{input:10,output:20}}},Date.now()-1000);
  assert.equal(report.models.get("p/cheap").runs,1);
  assert.equal(report.models.get("p/other").stronger,1);
  assert.equal(report.compared,1);
  assert.equal(report.rated,2);
  assert.equal(report.models.get("p/cheap").estimatedCost,0.0014);
  assert.equal(report.models.get("p/cheap").completedRuns,1);
  assert.equal(report.models.get("p/other").failedRuns,1);
  assert.equal(report.savings,0.0126);
  const subscription=analyzeUsage(rows,{billing:"subscription",baselineModel:"p/premium",rates:{"p/cheap":{input:1,output:2},"p/premium":{input:10,output:20}}},Date.now()-1000);
  assert.equal(subscription.compared,0);
  assert.equal(subscription.models.get("p/cheap").pricedRuns,0);
});
