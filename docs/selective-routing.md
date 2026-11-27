# Selective automatic routing

In Control UI, open **Jev Router → Overview → Automatic routing exclusions**.
Select an agent in the host agent picker, then click **Disable routing for selected agent**.
To exclude only a chat, select that chat in the host session picker and click **Disable routing for selected session**. The panel shows the exact target before you click. If no session is selected, the session control is disabled.

Use **Allow routing for selected agent/session** or **Remove exclusion** to undo. Removing a session exclusion does not override an agent exclusion or global observe mode. **Pause routing globally** remains a separate control.

Exclusions persist in Jev's preference store and take effect without a Gateway restart once this plugin version is loaded. Agent exclusions cover all runs with that agent ID. Session exclusions match the exact host session key, not its display title; they do not propagate to child sessions or other agents. A new session key needs its own exclusion. An existing key remains excluded after conversation reset. Entries are retained until removed (maximum 1,000 per scope).

Excluded runs bypass automatic Jev classification, continuity routing and the global model pin. They return no model override and log agent_routing_disabled or session_routing_disabled. OpenClaw's selected/default model and fallbacks remain authoritative; this is not a host model lock. Explicit manual previews still work. Changes cannot undo a model selection already applied to a running response. A preference change during a routing decision prevents that stale override from being applied.

Writes require operator.admin and are serialized with other preferences. Saving model profiles, pricing, or global mode preserves exclusions. No Gateway config, credentials or host session model fields are rewritten.
