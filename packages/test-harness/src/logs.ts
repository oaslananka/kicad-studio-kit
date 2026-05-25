const PRIVATE_KEY_START = "-----BEGIN " + "PRIVATE KEY-----";
const PRIVATE_KEY_END = "-----END " + "PRIVATE KEY-----";

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [
    /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/giu,
    "Authorization: Bearer [REDACTED]",
  ],
  [
    /\b(access_token|refresh_token|client_secret|token|password)=([^&\s]+)/giu,
    "$1=[REDACTED]",
  ],
  [
    new RegExp(
      `${escapeRegExp(PRIVATE_KEY_START)}[\\s\\S]*?${escapeRegExp(PRIVATE_KEY_END)}`,
      "gu",
    ),
    `${PRIVATE_KEY_START}[REDACTED]${PRIVATE_KEY_END}`,
  ],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu, "[REDACTED_GITHUB_TOKEN]"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED_API_KEY]"],
];

export function redactSecrets(
  value: string,
  extraSecrets: readonly string[] = [],
): string {
  let redacted = value;
  for (const secret of extraSecrets.filter(Boolean)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function redactCommandForLog(
  command: string,
  args: readonly string[] = [],
  extraSecrets: readonly string[] = [],
): string {
  return redactSecrets([command, ...args].join(" "), extraSecrets);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
