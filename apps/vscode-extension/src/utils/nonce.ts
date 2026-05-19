import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically-random nonce string for Content Security Policy
 * script and style attributes in webview HTML.
 *
 * The returned value is a base64url-encoded 24-byte random value (32 characters),
 * generated using Node.js crypto.randomBytes — suitable for use as a CSP
 * `nonce-<value>` source.
 */
export function createNonce(): string {
  return randomBytes(24).toString('base64url');
}
