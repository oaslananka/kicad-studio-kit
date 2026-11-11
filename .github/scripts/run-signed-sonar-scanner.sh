#!/usr/bin/env bash
set -euo pipefail

# GitHub-hosted Ubuntu only. Offline-trusted vendor public key avoids an
# unavailable third-party HKPS keyserver without weakening GPG verification.
: "${SONAR_TOKEN:?SONAR_TOKEN is required}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
keyfile="$repo_root/.github/keys/sonarsource-scanner-public.asc"
version=8.1.0.6389
expected_master_fingerprint=679F1EE92B19609DE816FDE81DB198F93525EC1A
expected_archive_sha256=bb8f709f9cb73352f8d1260a3b3c506c0f41146754bc630762c126d795499d0b
archive="sonar-scanner-cli-${version}-linux-x64.zip"
url="https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/${archive}"

# Verify the vendored primary key identity before trusting it. Signature
# verification also checks that the signing subkey belongs to this master key.
actual_master_fingerprint="$(
  gpg --batch --show-keys --with-colons --fingerprint "$keyfile" 2>/dev/null |
    awk -F: '$1 == "fpr" { print $10; exit }'
)"
if [[ "$actual_master_fingerprint" != "$expected_master_fingerprint" ]]; then
  echo "SonarScanner signing key fingerprint mismatch" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
install -d -m 700 "$tmp/gnupg"

# Both artifacts come directly from the official SonarSource HTTPS domain.
# The retries are bounded; the signature check fails closed.
curl --fail --silent --show-error --location --retry 2 \
  --connect-timeout 10 --max-time 150 "$url" -o "$tmp/$archive"
curl --fail --silent --show-error --location --retry 2 \
  --connect-timeout 10 --max-time 45 "$url.asc" -o "$tmp/$archive.asc"

printf '%s  %s\n' "$expected_archive_sha256" "$tmp/$archive" | sha256sum --check --status ||
  { echo "SonarScanner artifact digest mismatch" >&2; exit 1; }

GNUPGHOME="$tmp/gnupg" gpg --batch --import "$keyfile" >/dev/null 2>&1
GNUPGHOME="$tmp/gnupg" gpg --batch --status-fd 3 \
  --verify "$tmp/$archive.asc" "$tmp/$archive" 3>"$tmp/verify-status" 2>"$tmp/verify-message" ||
  { cat "$tmp/verify-message" >&2; exit 1; }

# A GOOD signature alone is insufficient: demand the pinned master key identity.
awk -v fingerprint="$expected_master_fingerprint" '
  $1 == "[GNUPG:]" && $2 == "VALIDSIG" && $NF == fingerprint { verified = 1 }
  END { exit !verified }
' "$tmp/verify-status" ||
  { echo "SonarScanner signature is not from the pinned master key" >&2; exit 1; }

unzip -q "$tmp/$archive" -d "$tmp"
scanner="$tmp/sonar-scanner-${version}-linux-x64/bin/sonar-scanner"
if [[ ! -x "$scanner" ]]; then
  echo "Signed SonarScanner archive has no executable at the expected path" >&2
  exit 1
fi
echo "SonarScanner ${version}: SHA-256 and pinned SonarSource GPG signature verified"
cd "$repo_root"
export SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
"$scanner"
