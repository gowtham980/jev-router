# Jev Router v0.4.3

Provider-neutral, allowlisted model routing for OpenClaw 2026.9.5.

## Highlights

- Quality, Balanced and Economy routing objectives.
- Relative cost and expected-quality metadata supplied by the Gateway operator.
- Bounded task continuity for explicit short follow-ups, without storing prompts.
- Conservative next-turn escalation after repeated capability-related failures.
- Native Control UI with Overview, Models and Logs tabs.
- Gateway model discovery with readiness, policy and credential filtering.
- Persistent redacted decision history and isolated plugin preferences.

## Verification

- 40 automated tests passed.
- 13 release safety checks passed.
- Dashboard interaction audit passed.
- OpenClaw plugin validation passed.
- Production dependency audit reported zero known vulnerabilities.
- Live installation preserved the Gateway model catalog and model/agent configuration.

## Compatibility

- Tested with OpenClaw 2026.9.5.
- Thinking recommendations are advisory because this host API exposes model and
  provider overrides, not a thinking override.
- Locked native sessions remain host-owned and are not rerouted.
- OpenClaw 2026.9.5 native Codex conversations can occasionally reject a model
  change while waiting for native configuration unload confirmation. The host
  preserves the conversation and stops before inference; reconnect and retry.

## Install

```sh
openclaw plugins install ./jev-router-0.4.3-release.tgz --accept-capabilities
openclaw config set plugins.entries.jev-router.hooks.allowConversationAccess true
openclaw plugins reload jev-router --json
openclaw plugins inspect jev-router --runtime --json
```

After installation, open **Control UI → Jev Router**, connect a supported Jev
credential, configure a small evaluated routing pool, and begin in Observe mode.

## Artifact

SHA-256:

```text
ce1a8bae5a1f333900fea3f2b101d7b5d4733fae8ac91d894de50ed004416049
```
