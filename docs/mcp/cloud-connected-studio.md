---
search: false
---

# Optional Cloud Projects in KiCad Studio

KiCad Studio works locally without a Cloud account, an internet connection, or
a second MCP server. Cloud Projects is an **optional**, account-based project
discovery flow. It does **not** upload or synchronize KiCad design files.

## Connect and select a project

1. In VS Code, open **KiCad Studio: Open Task Hub** and choose
   **Cloud Projects** directly. An empty Studio sidebar also offers
   **Local Projects** and **Cloud Projects**, without requiring a workspace.
   If you have not connected an account, choose **Sign in to Cloud**.
2. The **Connect to Cloud** action is also available under **Automate**. Studio checks the live Cloud OAuth metadata
   and its public client registration before opening your system browser.
3. Sign in with a supported Cloud identity and approve the read-only
   `projects:read` scope. Return to VS Code via the authorization callback.
4. Under **Cloud Projects**, choose from the projects the current account has
   explicitly granted to this OAuth client. Studio shows the device name,
   online/offline state and connector status without implying edit access. If no project is granted, use
   **Manage Cloud Access** to review the owner's grants.

A Cloud project is selected by an opaque remote ID, **not** by changing the
currently open local project. Connector online/offline status and availability
are displayed separately. A connected account or device does not establish
read/write consent or prove that native KiCad is running.

## Recovery and sign-out

If sign-in is cancelled, the account's authorization has expired or the
device is offline, use **Connect to Cloud** again, or check the Cloud owner's
Devices & projects page. When a token expires, Studio attempts a bounded
refresh; revoked credentials are cleared from Studio's VS Code SecretStorage.
**Sign Out of Cloud** removes Studio's local Cloud session and selected remote
project reference. It does not revoke other Cloud clients, unregister devices,
alter local KiCad files, or grant another client access.

## Security and compatibility

- OAuth 2.1 authorization-code flow with PKCE S256, random state, exact issuer
  and redirect registration; native VS Code URI callback.
- Read-only `projects:read` discovery through the current published Cloud MCP
  resource; no plaintext token settings, logs or webview tokens.
- The Cloud client metadata document lives at
  `https://oaslananka.github.io/kicad-studio-kit/cloud-oauth-client.json`.
  A missing or incompatible deployed metadata document blocks sign-in rather
  than falling back to an unverified client or endpoint.
- Remote schematic/PCB previews, native DRC/ERC, arbitrary tool execution,
  and write/save/readback are **not part of this release**. They require
  separately implemented, versioned capabilities and per-project grants.
