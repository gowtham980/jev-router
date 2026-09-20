# Jev Router v0.4.4

Onboarding patch for user-installed native Control UI.

## Changes

- Documents the required `gateway.controlUi.experimental.customPlugins` setting.
- Warns when Jev Router is loaded but its dashboard is hidden by that setting.
- Improves ClawHub package description and source metadata.
- Leaves routing behavior unchanged from v0.4.3.

## Install

```sh
openclaw plugins install clawhub:openclaw-plugin-jev-router --accept-capabilities
openclaw config set plugins.entries.jev-router.hooks.allowConversationAccess true
openclaw config set gateway.controlUi.experimental.customPlugins true
openclaw gateway restart
```

Open Control UI through HTTPS/Tailscale Serve or browser-trusted loopback such
as `http://127.0.0.1:18789/`. Native plugin UI does not load over plain HTTP on
a LAN address.

## Verification

- 40 automated tests passed.
- 14 release safety checks passed.
- Dashboard interaction audit passed.
- OpenClaw plugin validation passed.
- Production dependency audit reported zero known vulnerabilities.

## Artifact

SHA-256:

```text
8f67b030b10bc6ab0663ac2b94f8c0d1d059194d4e3c7e3f9247380a22da0a52
```
