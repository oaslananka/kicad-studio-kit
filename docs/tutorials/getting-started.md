# Tutorial: Getting Started

This tutorial is the Diátaxis tutorial entrypoint for new contributors and users.

## Goal

Set up the repository, run the main checks, and build the VS Code extension without changing runtime behavior.

## Prerequisites

- Git
- Node version from `.node-version`
- Corepack
- pnpm from `package.json`
- VS Code when testing the extension locally

## Steps

1. Clone the repository.
2. Enable Corepack:

   ```bash
   corepack enable
   corepack prepare pnpm@11.6.0 --activate
   ```

3. Install dependencies:

   ```bash
   corepack pnpm install --frozen-lockfile
   ```

4. Run the developer doctor:

   ```bash
   corepack pnpm run dev:doctor
   ```

5. Run the main extension quality gate:

   ```bash
   corepack pnpm --filter kicadstudiokit run check
   ```

6. Build and package the extension:

   ```bash
   corepack pnpm --filter kicadstudiokit run build
   corepack pnpm --filter kicadstudiokit run package
   ```

## Next reading

- User install guide: `docs/install.md`
- Existing getting started page: `docs/getting-started.md`
- Testing policy: `docs/development/testing-policy.md`
- Contribution guide: `CONTRIBUTING.md`
