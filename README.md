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

## PostgreSQL migration and replication

The temporary migration stack copies users and pastes from PostgreSQL to D1 and R2.
It uses PostgreSQL triggers and a Node relay for changes that happen after the copy starts.

Set these variables in the shell that runs the migration commands:

```sh
export POSTGRES_URL="..."
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."
export D1_DATABASE_ID="..."
export R2_BUCKET_NAME="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
```

Install the PostgreSQL triggers before the first copy:

```sh
pnpm replication:install
```

Run the initial copy with the relay stopped:

```sh
MIGRATION_VALIDATE_TOTALS=false pnpm migrate
```

Each migration line reports the resource, processed rows, remaining rows, rate, and ETA.

Start the relay after the copy completes:

```sh
pnpm replicate
```

The relay stores its event position in D1. It resumes safely after a restart.
Each relay line reports processed events, pending events, rate, and ETA.

Before cutover, stop writes to the old application. Stop the continuous relay, then drain the remaining events:

```sh
pnpm replicate -- --drain
```

After the drain completes, verify the D1 data and switch traffic to the production Worker.
