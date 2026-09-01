# Katbin

Katbin is a Vite+ application with one Hono Worker. It uses D1 for relational data, R2 for large pastes, and Email Service for account email.

## Local development

Install the dependencies:

```sh
pnpm install
```

Start the local Worker:

```sh
pnpm dev
```

The local Worker uses local D1 and R2 storage. Add local secrets to `.dev.vars` when a command needs them.

## Checks

```sh
pnpm test
pnpm check
pnpm types
pnpm build
```
