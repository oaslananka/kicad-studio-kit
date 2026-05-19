# Doppler Setup

To enable CI/CD with Doppler secrets:

1. Doppler dashboard → Integrations → GitHub → install app on `oaslananka` and `oaslananka`.
2. Create two GitHub Sync configs per repo (canonical and org).
3. Add `DOPPLER_TOKEN` (read-only service token, scoped to `all/main`) as the single GitHub secret on both repos.

The following secrets should be present in the `all/main` config:

- `CODECOV_TOKEN`
- `DOPPLER_GITHUB_SERVICE_TOKEN`
- `VSCE_PAT`
- `OVSX_PAT`
