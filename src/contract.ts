import { Type } from "typebox";
import { defineFeatureContract } from "openclaw/plugin-sdk/feature-contract";
const text = Type.String({maxLength: 256});
export const recordSchema = Type.Object({
  id: text, at: text, status: text, reason: text,
  selectedProfile: Type.Optional(text), selectedModel: Type.Optional(text), selectedThinking: Type.Optional(text),
  observedModel: Type.Optional(text), observedThinking: Type.Optional(text),
  confidence: Type.Optional(Type.Number()), latencyMs: Type.Number(),
  tokens: Type.Optional(Type.Number()), failureCategory: Type.Optional(text),
  inputTokens:Type.Optional(Type.Number()), outputTokens:Type.Optional(Type.Number()),
  completed:Type.Optional(Type.Boolean()), promptTruncated:Type.Optional(Type.Boolean()),
  feedback:Type.Optional(Type.Union([Type.Literal("good"),Type.Literal("stronger"),Type.Literal("cheaper")])),
}, {additionalProperties:false});
const healthSchema = Type.Object({
  agentId: Type.Optional(text), credential: text, readyProfiles: Type.Number(),
  totalProfiles: Type.Number(), gatewayModels:Type.Number(), catalogWarning:Type.Optional(text),
  fallbacks: Type.Array(text,{maxItems:20}), history: text,
},{additionalProperties:false});
export const contract = defineFeatureContract({
  pluginId: "jev-router",
  operations: {
    snapshot: {
      kind: "query", description: "Read redacted routing decisions and runtime support.",
      input: Type.Object({agentId:Type.Optional(text)}, {additionalProperties:false}),
      output: Type.Object({
        mode: text, optimization: text, continuity:Type.Boolean(), minConfidence:Type.Number(), pinnedModel:Type.Optional(text),
        pricing:Type.Object({billing:Type.Optional(Type.Union([Type.Literal("api"),Type.Literal("subscription")])),baselineModel:Type.Optional(text),rates:Type.Record(Type.String(),Type.Object({input:Type.Number(),output:Type.Number()}))}),
        limitations: Type.Array(text), records: Type.Array(recordSchema,{maxItems:200}),
        health: healthSchema,
        profiles: Type.Array(Type.Object({
          id:text,model:text,description:Type.String({maxLength:500}),thinking:Type.Optional(text),
          cost:text,quality:text,
          input:Type.Array(text,{maxItems:6}),ready:Type.Boolean(),reason:text,
        },{additionalProperties:false}),{maxItems:40}),
        gatewayModels:Type.Array(Type.Object({
          model:text,provider:text,name:text,input:Type.Array(text,{maxItems:6}),
          ready:Type.Boolean(),configured:Type.Boolean(),
        }),{maxItems:500}),
      }),
    },
    preview: {
      kind: "action", description: "Send a bounded redacted prompt to Jev for a routing recommendation. Does not execute or change models.",
      input: Type.Object({prompt:Type.String({minLength:1,maxLength:16000}),agentId:Type.Optional(text)},{additionalProperties:false}),
      output: recordSchema,
      tool: {name:"jev_router_preview",label:"Preview model and thinking route",optional:true},
    },
    rate_run: {
      kind:"action",description:"Record private outcome feedback for a completed local run.",
      input:Type.Object({id:text,feedback:Type.Union([Type.Literal("good"),Type.Literal("stronger"),Type.Literal("cheaper")])},{additionalProperties:false}),
      output:Type.Object({saved:Type.Boolean()},{additionalProperties:false}),
    },
    clear_history: {
      kind: "action", description: "Permanently clear locally stored Jev Router decision history.",
      input: Type.Object({}, {additionalProperties:false}),
      output: Type.Object({cleared:Type.Boolean()},{additionalProperties:false}),
    },
  },
  events: { changed: Type.Object({},{additionalProperties:false}) },
});
