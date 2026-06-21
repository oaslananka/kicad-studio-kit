# Assistant Tool Capability Modes

Every assistant-facing tool (the VS Code Language Model tools and the MCP tools
the assistant can call) is classified into exactly one capability mode so its
blast radius is explicit. Dangerous tools cannot run without the right mode,
trust, and confirmation. The authoritative mapping lives in
`src/lm/toolCapabilityModes.ts` and is enforced by `toolCapabilityModes.test.ts`,
which fails if any registered tool has no documented mode.

## Modes

| Mode | Meaning | Trust + preview |
| --- | --- | --- |
| `read-only` | Explorer. Returns information about the project; never changes files or project state. | not required |
| `review` | Advisory. Runs checks/validations and returns findings plus proposed next steps; does not modify design files. | not required |
| `release-preparation` | Changes release-relevant project state or produces artifacts. | requires workspace trust **and** a preview/confirmation before acting |

## Tool classification

| Tool | Mode |
| --- | --- |
| `kicadstudio_openFile` | read-only |
| `kicadstudio_getActiveContext` | read-only |
| `kicadstudio_searchComponent` | read-only |
| `kicadstudio_searchSymbol` | read-only |
| `kicadstudio_searchFootprint` | read-only |
| `kicadstudio_listVariants` | read-only |
| `kicadstudio_runDrc` | review |
| `kicadstudio_runErc` | review |
| `kicadstudio_exportGerbers` | release-preparation |
| `kicadstudio_switchVariant` | release-preparation |

## Guarantees

- **Read-only tools stay read-only.** They are tested to never appear in the
  state-changing or artifact-producing sets.
- **Review tools produce findings and next steps.** DRC/ERC tools return real
  diagnostics, not free-form claims.
- **Release-preparation tools preview first.** They surface what they will
  produce or change and require workspace trust before acting, consistent with
  the central guarded-operation layer.

Each tool's description documents its expected inputs and outputs alongside its
mode so the assistant chooses the least-privileged tool that fits the task.
