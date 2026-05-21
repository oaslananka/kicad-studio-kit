# Branch Protection

The canonical branch protection policy is documented in
`docs/architecture/branch-protection.md`. Import the matching ruleset from
`.github/rulesets/main.json`.

To apply them via GitHub CLI:

```bash
# For canonical organization repo
gh api -X POST /repos/oaslananka/kicad-studio-kit/rulesets --input .github/rulesets/main.json
```

If the ruleset already exists, update it by id:

```bash
gh api /repos/oaslananka/kicad-studio-kit/rulesets
gh api -X PUT /repos/oaslananka/kicad-studio-kit/rulesets/<id> --input .github/rulesets/main.json
```
