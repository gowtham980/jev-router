# OpenClaw compatibility verification — 2026-11-24

## Versions and declarations

- Local Jev Router source/package: 0.4.7, including existing async readiness and selective-routing exclusions.
- Installed OpenClaw: 2026.10.5 (1b58cb9), unchanged.
- npm latest stable: 2026.11.7 (e31bbf0); build SDK and portable lockfile pinned exactly to this version.
- npm extended-stable: 2026.10.33 (not separately tested).
- npm beta: 2026.11.10-beta.3 (not tested or admitted by the stable semver range).
- Peer and plugin API ranges: >=2026.9.8 <2026.12.0. Existing September support retained; December and prereleases excluded. This is bounded line support, not a claim that every patch was tested.

## Verification

Tests used source copies under /tmp/jev-latest-ezw44J with separate OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH. No production credentials, live installation, gateway reload/restart, publication or push.

| Check | 2026.10.5 | 2026.11.7 |
| --- | --- | --- |
| TypeScript | Pass with --types node (see local dependency note) | Pass, default project settings |
| Source unit/integration tests | 53/53 pass | 53/53 pass |
| Independent synthetic routing/release audit | 14/14 pass | 14/14 pass |
| Host plugin/dashboard build | Not repeated for this older host | Pass |
| Mock-DOM dashboard audit | Not repeated for this older host | Pass |
| Plugin metadata validation | Not repeated for this older host | valid: true |
| Final archive extracted-package validation | Not repeated for this older host | Pass |
| Exact final archive isolated installation | Not repeated for this older host | Pass, linked peer 2026.11.7 |
| Packaged Doctor normalizer | Not repeated for this older host | Pass; representative config unchanged |
| Installed archive runtime inspection | Not repeated for this older host | loaded; eight typed hooks admitted in synthetic permission fixture |

Without conversation-access permission, inspection correctly blocks conversation hooks. A test-only config granted it for registration verification; no live hook permission was changed. The local archive retains a provenance-invalid trust label (no verified ClawHub provenance). Runtime registration is not a fresh model-routing success.

The dashboard audit fixture needed the existing exclusions field and updated global-mode labels; no UI behavior was changed. The pack wrapper now disables macOS copyfile metadata during tar operations: the first archive had AppleDouble scan-incomplete warnings, while the final verified archive installs without those warnings.

## Auth-loader compatibility

2026.11.7 publicly exports loadAuthProfileStoreForRuntimeAsync; 2026.10.5 does not. Keep feature detection and the read-only synchronous fallback for older supported hosts. Async preparation errors propagate to fail-closed readiness; there is no sync retry after an async failure. AuthProfileStore supplies the public type without using a deprecated function for type inference.

The 2026.11.7 SDK marks the sync runtime loader supported through 2026-12-31, with removal in the first January 2027 stable release. Our current upper host bound is earlier. Removing the fallback now would break retained October support.

A real-host regression test uses a synthetic legacy credential file. Both hosts require migration; the plugin leaves that file unchanged, creates no credential-store files, and returns no ready candidates. Host migrations remain host-owned. This is intentional, not a new SDK regression.

## Artifact

- File: jev-router-0.4.7-openclaw-2026.11.7-verified.tgz
- SHA-256: 6de1c93bd07ade8fcdc8cc3c8bc6be925eacbd779d2e865e9e4197b546dc6254
- Contains the declared root doctor-contract-api.js; no AppleDouble filename entries.
- This is a local verification artifact, not a published or activated release.

## Limits and local dependency note

The checkout node_modules/openclaw still points at the installed October host. It was deliberately not replaced. Its pre-existing incomplete ambient @types folders cause plain tsc to report missing jsesc, pg and retry definitions. Older-host compilation used explicit Node ambient types; the clean latest-SDK dependency installation compiled with the unchanged tsconfig. Use npm ci for the newly pinned SDK in an isolated checkout before rebuilding.

Actual browser onboarding, fresh selected-versus-observed live routing, beta behavior, clean-machine dependency installation and separately testing every admitted stable patch remain unverified. The isolated installer linked the tested latest SDK as its peer.
