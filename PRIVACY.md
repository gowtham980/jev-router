# Privacy and data handling

Jev Router sends a bounded, redacted excerpt of your current task prompt to the configured TypeSafe/Jev service, or OpenRouter when its credential is used. When the prompt exceeds the configured limit, the excerpt retains its beginning and end and omits the middle. Observation mode also performs classification and sends this excerpt. Preview sends the text you enter. No files, attachments, session history, or system prompt are intentionally added by the plugin.

Common credentials in plain assignments and quoted JSON values are redacted before truncation and transmission. Redaction is best-effort, not a guarantee: arbitrary private information, identifiers, or unfamiliar secret formats may remain. Do not submit confidential information unless authorized to share it with that service. Retention by that service is governed by its own terms.

Keys entered in the dashboard are sent directly to OpenClaw's native secret-store RPC, saved as write-only secret values, and restricted to Jev endpoint hosts. Plugin configuration stores only a SecretRef. Existing local OpenClaw credential files remain supported for compatibility. Credentials are sent only in the Authorization header to a fixed service endpoint and are never placed in dashboard history or plugin logs. Redirects are refused.

The dashboard persists at most 200 records without prompt text. Records include selected/observed models, reasoning levels, usage when reported, timestamps, routing status, whether a long prompt was truncated, and host-reported run completion. Completion is not a claim that the answer was good. Existing Gateway operator scopes protect access. Trusted installs use native plugin state; local archives use a mode-0600 bounded journal.

OpenAI authentication is unchanged. This plugin does not create an OpenAI API key or API-key fallback.

Task continuity stores only the prior selected route, relative quality tier,
failure counters and an expiry timestamp in process memory. It stores no prompt
text or transcript and is cleared when the session ends or the plugin reloads.
