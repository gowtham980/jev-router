# Changelog

## 0.4.4

- Document and package the required Custom plugin UI activation step for new Gateways.
- Warn at startup when the backend is active but its native Control UI is disabled.
- Add public package description, repository, issue tracker and discovery keywords.

## 0.4.3

- Split the dashboard into Overview, Models and Logs tabs so large model catalogs no longer push history below the fold.
- Show live model and log counts in the tab navigation.
- Add keyboard navigation and responsive sticky tabs for quick section switching.

## 0.4.2

- Add an actionable routing-health banner and collapse credential setup after connection.
- Add catalog search and availability/selection filters with live visible and selected counts.
- Keep unselected model cards compact and expose configuration only after selection.
- Keep save/discard controls visible on long catalogs and clearly mark unsaved changes.
- Improve responsive layout, mobile decision history, empty states, focus treatment and reduced-motion support.

## 0.4.1

- Preserve exact profile identity in continuity, history and dashboard edits, including multiple profiles sharing one model.
- Require completed, observed model matches before reusing routes; invalidate stale, overlapping, reset, fallback and preference-change contexts.
- Escalate only after repeated distinct argument/structured-output failures in an unsuccessful run. Infrastructure failures and recovered errors do not escalate.
- Bound credential resolution and classifier requests with one deadline; timed-out credentials cannot start a late request.
- Serialize preference writes and archive history writes; use unique atomic replacement files.
- Preserve unavailable profiles, cap dashboard catalogs, warn about identical estimates, protect unsaved edits and reject stale-agent saves.
- Keep all Gateway provider/model configuration unchanged and preserve observe mode as the fresh-install default.

## 0.4.0

- Add provider-neutral Quality, Balanced and Economy optimization goals.
- Add operator-supplied relative cost and expected quality metadata for every routing profile.
- Make Balanced optimize expected total usage by accounting for likely retries and corrections.
- Keep unknown models neutral instead of guessing capability or pricing from provider/model names.
- Reuse the prior session route for explicit short follow-ups and raise the next follow-up by one configured quality tier after repeated execution failures.
- Keep continuity state memory-only and store no prompt history.
- Remove Gateway-specific models from the distributable example configuration.

## 0.3.1

- Persist dashboard preferences in isolated plugin state instead of rewriting Gateway configuration.
- Prevent routing-pool and credential saves from reloading model providers or blanking the session model catalog.
- Add regression coverage for restart persistence, unchanged Gateway configuration and atomic archive storage.

## 0.3.0

- Add secure Jev key setup through OpenClaw's write-only secret store.
- Discover models dynamically from the selected agent's Gateway catalog.
- Let administrators enable models and choose routine, balanced or deep routing preferences in the dashboard.
- Store only a SecretRef in plugin state; keys are never returned to or persisted by the plugin.
- Require administrator scope for credential and routing-pool changes.

## 0.2.1

- Show the complete configured model pool in the dashboard.
- Explain whether each model is eligible for the selected agent and why excluded models cannot be chosen.
- Display each profile's routing description, supported inputs and recommended thinking level.
- Replace retired example models with the verified OpenAI-only sample pool.

## 0.2.0

- Persist the latest 200 routing decisions across reloads and runtime processes.
- Use native plugin state when trusted, with a bounded local-file fallback for local archives.
- Add dashboard health cards, profile readiness, fallback visibility and clearer statuses.
- Add automatic dashboard refresh and a two-step clear-history action.
- Keep prompts, outputs, credentials and session keys out of stored history.

## 0.1.1 — 2026-09-20

- Apply MIT licensing, with author copyright and distribution notice.

- Redact quoted JSON credential keys and escaped quoted values before transmission.
- Reconcile routing status after every model observation; preserve terminal failures.
- Clear stale observed thinking/usage when the observed model changes.
- Respect the session-action agent policy during previews.
- Run release regression probes as part of npm test.
- Include browser source, example configuration and privacy documentation in npm packaging.
- Pin the tested plugin API version rather than implying untested forward compatibility.

Thinking remains advisory on OpenClaw 2026.9.5; locked native sessions remain unaffected. Observation mode remains the default. No public publication has been performed.

## 0.1.2

- Exclude models with no usable stored auth profile, provider/model cooldowns, or disabled credentials. Unknown readiness leaves host selection unchanged.
- Classify once per run so host retries/fallbacks cannot be redirected back to the failed model.
- Add auth readiness and retry-loop regression coverage.
- Fallback chains remain host-owned; native coordination errors and account-wide OAuth outages are not solved by same-provider model fallbacks.
