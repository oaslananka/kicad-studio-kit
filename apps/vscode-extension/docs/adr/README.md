# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for kicad-studio.

## Format

Each ADR is a numbered Markdown file: `NNNN-short-title.md`

```markdown
# NNNN - Title

**Status:** Proposed | Accepted | Deprecated | Superseded by [NNNN]
**Date:** YYYY-MM-DD

## Context

Why was this decision needed?

## Decision

What was decided?

## Consequences

What are the trade-offs?
```

## Index

| #    | Title                | Status |
| ---- | -------------------- | ------ |
| 0001 | (Add first ADR here) | -      |

## Creating a New ADR

```bash
# Copy the template
cp docs/adr/template.md docs/adr/$(printf '%04d' $(($(ls docs/adr/*.md | wc -l)))).md
```
