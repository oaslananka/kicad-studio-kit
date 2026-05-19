# Branch Protection

Branch protection rules are defined in `.github/rulesets/main.json`.

To apply them via GitHub CLI:

```bash
# For canonical organization repo
gh api -X POST /repos/oaslananka/kicad-studio/rulesets --input .github/rulesets/main.json
```

Note: If the ruleset already exists, use `PATCH` instead of `POST` and include the ruleset ID.
