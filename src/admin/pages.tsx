/** @jsxImportSource hono/jsx */

import type { FC } from "hono/jsx";
import { VISITOR_LIMITATIONS } from "./metrics";

type Metadata = Record<string, any>;

export interface PasteMetadata {
  id?: string | number;
  url?: string;
  ownerEmail?: string;
  createdAt?: string;
  deletedAt?: string | null;
  status?: string;
}

export interface AccountMetadata {
  id?: string | number;
  email?: string;
  createdAt?: string;
  status?: string;
}

export interface AbuseMetadata {
  id?: string | number;
  type?: string;
  accountId?: string | number;
  pasteId?: string | number;
  ip?: string;
  reason?: string;
  createdAt?: string;
}

/** Queue metadata contains paste IDs only. It never contains paste content. */
export interface DeletionQueueMetadata {
  id?: string | number;
  pasteId?: string | number;
  paste_id?: string | number;
  reason?: string;
  status?: string;
  state?: string;
  admin?: string;
  adminEmail?: string;
  createdAt?: string;
  completedAt?: string;
}

/** A DMCA case refers to paste IDs. It does not carry paste bodies. */
export interface DmcaCaseMetadata {
  id?: string | number;
  caseId?: string | number;
  reference?: string;
  ref?: string;
  complainant?: string;
  receivedDate?: string;
  received_date?: string;
  pasteIds?: string | string[];
  paste_ids?: string | string[];
  status?: string;
  state?: string;
}

const field = (item: Metadata | null | undefined, ...names: string[]): any => {
  if (!item) return undefined;
  for (const name of names) {
    if (item[name] !== undefined && item[name] !== null && item[name] !== "") return item[name];
  }
  return undefined;
};

const text = (value: any, fallback = "—"): string =>
  value === undefined || value === null || value === "" ? fallback : String(value);

const time = (item: Metadata, ...names: string[]) => text(field(item, ...names));

const status = (item: Metadata) =>
  field(item, "liftedAt", "lifted_at") ? "Lifted" : text(field(item, "status", "state"), "Active");

const unknownIp = (value: any) => {
  const ip = text(value, "Unknown IP");
  return ip.toLowerCase() === "unknown" || ip === "—" ? "Unknown IP" : ip;
};

const csrfInput = (csrf: string) => <input type="hidden" name="_csrf" value={csrf} />;

const pageLink = (path: string, page: number) => `${path}?page=${Math.max(1, page)}`;

const Pager: FC<{ path: string; page: number }> = ({ path, page }) => (
  <nav aria-label="Pagination" class="mt-4 flex gap-4">
    {page > 1 ? <a href={pageLink(path, page - 1)}>Previous</a> : null}
    <span aria-current="page">Page {page}</span>
    <a href={pageLink(path, page + 1)}>Next</a>
  </nav>
);

const navItems = [
  ["Overview", "/admin"],
  ["Search", "/admin/search"],
  ["Bans", "/admin/bans"],
  ["Deletions", "/admin/deletions"],
  ["DMCA", "/admin/dmca"],
  ["Actions", "/admin/actions"],
] as const;

export const AdminLayout: FC<{
  csrf: string;
  userEmail?: string;
  active: string;
  children: any;
}> = ({ csrf: _csrf, userEmail, active, children }) => (
  <div class="flex min-h-full w-full flex-col bg-light-grey">
    <header class="flex w-full items-center justify-between bg-header px-6 py-3">
      <a href="/" aria-label="Katbin home">
        <span class="text-xl font-semibold tracking-tight">
          <span class="text-amber">&lt;Kat</span>bin/&gt;
        </span>
      </a>
      <div class="flex items-center gap-6">
        {userEmail ? <span>{userEmail}</span> : null}
        <nav aria-label="Admin navigation">
          <ul class="flex flex-wrap gap-4">
            {navItems.map(([label, href]) => (
              <li>
                <a
                  href={href}
                  aria-current={
                    active === label ||
                    active === href ||
                    active.toLowerCase() === label.toLowerCase()
                      ? "page"
                      : undefined
                  }
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</main>
  </div>
);

type MetricName = Exclude<keyof OverviewPageProps["series"][number], "day" | "unavailable">;

const MetricValue: FC<{ row: OverviewPageProps["series"][number]; name: MetricName }> = ({
  row,
  name,
}) => <>{row.unavailable || row[name] === undefined ? "Unavailable" : String(row[name])}</>;

const Bar: FC<{ value: number | undefined; max: number }> = ({ value, max }) => (
  <div aria-label={value === undefined ? "Unavailable" : `${value}`} class="h-2 w-32 bg-gray-300">
    {value === undefined ? null : (
      <div class="h-2 bg-amber" style={`width: ${max ? Math.max(2, (value / max) * 100) : 0}%`} />
    )}
  </div>
);

export interface OverviewPageProps {
  totals: { accounts: number; activePastes: number };
  range: 7 | 30 | 90;
  series: {
    day: string;
    accounts_created: number;
    pastes_created: number;
    pastes_anon: number;
    pastes_authed: number;
    reads: number;
    redirects: number;
    visitors: number;
    ip_ban_rejects: number;
    rate_limit_rejects: number;
    server_errors: number;
    unavailable?: boolean;
  }[];
  lastUpdated: string | null;
  storage: { d1Bytes?: number; r2Objects?: number; r2Bytes?: number; stale?: boolean };
  notes: string[];
}

export const OverviewPage: FC<OverviewPageProps> = ({
  totals,
  range,
  series,
  lastUpdated,
  storage,
  notes,
}) => {
  const latest = lastUpdated ? new Date(lastUpdated).getTime() : Number.NaN;
  const stale = storage.stale || Number.isNaN(latest) || Date.now() - latest > 25 * 60 * 60 * 1000;
  const metricNames = [
    ["Accounts", "accounts_created"],
    ["Pastes", "pastes_created"],
    ["Anonymous pastes", "pastes_anon"],
    ["Authenticated pastes", "pastes_authed"],
    ["Reads", "reads"],
    ["Redirects", "redirects"],
    ["Visitors", "visitors"],
    ["IP ban rejects", "ip_ban_rejects"],
    ["Rate limit rejects", "rate_limit_rejects"],
    ["Server errors", "server_errors"],
  ] as const;
  const max = Math.max(
    0,
    ...series.flatMap((row) =>
      metricNames.map(([, name]) => (row.unavailable ? 0 : (row[name] ?? 0))),
    ),
  );
  return (
    <section>
      <div class="flex flex-wrap items-baseline justify-between gap-4">
        <h1 class="text-3xl font-bold text-amber">Admin overview</h1>
        <nav aria-label="Metric range" class="flex gap-3">
          {[7, 30, 90].map((days) => (
            <a href={`/admin?range=${days}`} aria-current={range === days ? "page" : undefined}>
              {days} days
            </a>
          ))}
        </nav>
      </div>
      {stale ? (
        <p class="alert alert-info" role="status">
          Stale metrics
        </p>
      ) : null}
      {!lastUpdated ? (
        <p class="alert alert-info" role="status">
          Metrics unavailable
        </p>
      ) : null}
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <article class="bg-header p-4">
          <h2 class="font-bold">Accounts</h2>
          <p class="text-2xl">{totals.accounts}</p>
        </article>
        <article class="bg-header p-4">
          <h2 class="font-bold">Active pastes</h2>
          <p class="text-2xl">{totals.activePastes}</p>
        </article>
      </div>
      <section class="mt-6">
        <h2 class="text-xl font-bold">Daily metrics</h2>
        <div class="overflow-x-auto">
          <table class="mt-2 w-full text-left">
            <caption class="sr-only">Daily metrics for the selected range</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {metricNames.map(([label]) => (
                  <th scope="col">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr class={row.unavailable ? "text-gray-500" : undefined}>
                  <th scope="row">{row.day}</th>
                  {metricNames.map(([, name]) => (
                    <td>
                      <MetricValue row={row} name={name} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-left">
            <caption class="sr-only">Daily metric bars</caption>
            <tbody>
              {series.map((row) => (
                <tr>
                  <th scope="row">{row.day}</th>
                  <td>
                    <div class="flex gap-2">
                      {metricNames.slice(0, 7).map(([, name]) => (
                        <Bar value={row.unavailable ? undefined : row[name]} max={max} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p class="mt-6">{VISITOR_LIMITATIONS}</p>
      <section class="mt-6">
        <h2 class="text-xl font-bold">Storage</h2>
        {storage.stale ? (
          <p class="alert alert-info" role="status">
            Storage data is stale
          </p>
        ) : null}
        <dl class="grid gap-2 sm:grid-cols-3">
          <div>
            <dt>D1 bytes</dt>
            <dd>{storage.d1Bytes === undefined ? "Unavailable" : storage.d1Bytes}</dd>
          </div>
          <div>
            <dt>R2 objects</dt>
            <dd>{storage.r2Objects === undefined ? "Unavailable" : storage.r2Objects}</dd>
          </div>
          <div>
            <dt>R2 bytes</dt>
            <dd>{storage.r2Bytes === undefined ? "Unavailable" : storage.r2Bytes}</dd>
          </div>
        </dl>
      </section>
      <section class="mt-6">
        <h2 class="text-xl font-bold">Execution duration and failure notes</h2>
        {notes.length ? (
          <ul class="list-disc pl-6">
            {notes.map((note) => (
              <li>{note}</li>
            ))}
          </ul>
        ) : (
          <p>No execution-duration or failure notes.</p>
        )}
        <p class="text-sm">Last updated: {lastUpdated ?? "Unavailable"}</p>
      </section>
    </section>
  );
};

export interface SearchPageProps {
  q?: string;
  type?: string;
  csrf?: string;
  results: {
    abuse: AbuseMetadata[];
    accounts?: AccountMetadata[];
    pastes?: PasteMetadata[];
  };
  page: number;
}

const SearchPasteRow: FC<{ paste: PasteMetadata }> = ({ paste }) => (
  <tr>
    <th scope="row">{text(paste.id)}</th>
    <td>{text(paste.url)}</td>
    <td>{text(field(paste, "ownerEmail", "owner_email"))}</td>
    <td>{time(paste, "createdAt", "created_at")}</td>
    <td>{text(paste.status, paste.deletedAt ? "deleted" : "active")}</td>
  </tr>
);

export const SearchPage: FC<SearchPageProps> = ({
  q = "",
  type = "",
  csrf = "",
  results,
  page,
}) => (
  <section>
    <h1 class="text-3xl font-bold text-amber">Search</h1>
    <form action="/admin/search" method="post" class="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="_csrf" value={csrf} />
      <label class="flex flex-col" htmlFor="admin-search-query">
        Search account, email, paste ID or URL, or IP
        <input id="admin-search-query" name="q" value={q} class="px-2 py-1 text-black" />
      </label>
      <label class="flex flex-col" htmlFor="admin-search-type">
        Search type
        <select id="admin-search-type" name="type" value={type} class="px-2 py-1 text-black">
          <option value="">All</option>
          <option value="account">Account</option>
          <option value="email">Email</option>
          <option value="paste">Paste</option>
          <option value="ip">IP</option>
        </select>
      </label>
      <button type="submit" class="rounded-sm bg-amber px-3 py-1">
        Search
      </button>
    </form>
    <p class="mt-4">
      A shared IP is not proof that accounts or activity belong to the same person.
    </p>
    <section class="mt-6">
      <h2 class="text-xl font-bold">Abuse and related activity</h2>
      <table class="mt-2 w-full text-left">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Account</th>
            <th scope="col">Paste</th>
            <th scope="col">IP</th>
            <th scope="col">Reason</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {results.abuse.map((item) => (
            <tr>
              <td>{text(field(item, "eventType", "event_type", "type", "kind"))}</td>
              <td>{text(field(item, "accountId", "account_id"))}</td>
              <td>{text(field(item, "pasteId", "paste_id"))}</td>
              <td>{unknownIp(field(item, "ip", "ipAddress", "ip_address"))}</td>
              <td>{text(item.reason)}</td>
              <td>{time(item, "createdAt", "created_at")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    {results.accounts?.length ? (
      <section class="mt-6">
        <h2 class="text-xl font-bold">Accounts</h2>
        <table class="mt-2 w-full text-left">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {results.accounts.map((account) => (
              <tr>
                <th scope="row">{text(account.id)}</th>
                <td>{text(account.email)}</td>
                <td>{text(account.status)}</td>
                <td>{time(account, "createdAt", "created_at")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ) : null}
    {results.pastes?.length ? (
      <section class="mt-6">
        <h2 class="text-xl font-bold">Pastes</h2>
        <table class="mt-2 w-full text-left">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">URL</th>
              <th scope="col">Owner</th>
              <th scope="col">Created</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.pastes.map((paste) => (
              <SearchPasteRow paste={paste} />
            ))}
          </tbody>
        </table>
      </section>
    ) : null}
    <Pager path="/admin/search" page={page} />
  </section>
);

const RecordDetails: FC<{ item: Metadata }> = ({ item }) => (
  <dl class="grid gap-1 sm:grid-cols-2">
    <div>
      <dt>Status</dt>
      <dd>{status(item)}</dd>
    </div>
    <div>
      <dt>Reason</dt>
      <dd>{text(field(item, "reason", "note"))}</dd>
    </div>
    <div>
      <dt>Admin</dt>
      <dd>{text(field(item, "admin", "adminEmail", "admin_email"))}</dd>
    </div>
    <div>
      <dt>Created</dt>
      <dd>{time(item, "createdAt", "created_at", "startedAt")}</dd>
    </div>
    <div>
      <dt>Lifted or completed</dt>
      <dd>{time(item, "liftedAt", "lifted_at", "completedAt", "completed_at")}</dd>
    </div>
  </dl>
);

export interface BansPageProps {
  accountBans: any[];
  ipBans: any[];
  csrf: string;
  preview?: string;
}

const BanForm: FC<{
  action: string;
  csrf: string;
  title: string;
  idLabel: string;
  idName: string;
  reasonName?: string;
  preview?: string;
}> = ({ action, csrf, title, idLabel, idName, reasonName = "reason", preview }) => (
  <form action={action} method="post" class="flex flex-col gap-2 bg-header p-4">
    {csrfInput(csrf)}
    <h2 class="font-bold">{title}</h2>
    <label htmlFor={idName}>
      {idLabel}
      <input id={idName} name={idName} required class="ml-2 px-2 py-1 text-black" />
    </label>
    <label htmlFor={`${idName}-reason`}>
      Reason
      <textarea
        id={`${idName}-reason`}
        name={reasonName}
        required
        class="ml-2 px-2 py-1 text-black"
      />
    </label>
    {preview ? <p>Effective range preview: {preview}</p> : null}
    <button type="submit" class="self-start rounded-sm bg-amber px-3 py-1">
      Submit
    </button>
  </form>
);

const LiftBanForm: FC<{
  action: string;
  csrf: string;
  title: string;
  idName: string;
  idLabel: string;
}> = ({ action, csrf, title, idName, idLabel }) => (
  <form
    action={action}
    method="post"
    data-method="DELETE"
    class="flex flex-col gap-2 bg-header p-4"
  >
    {csrfInput(csrf)}
    <h2 class="font-bold">{title}</h2>
    <label htmlFor={idName}>
      {idLabel}
      <input id={idName} name={idName} required class="ml-2 px-2 py-1 text-black" />
    </label>
    <button type="submit" class="self-start rounded-sm bg-amber px-3 py-1">
      Lift ban
    </button>
  </form>
);

export const BansPage: FC<BansPageProps> = ({ accountBans, ipBans, csrf, preview }) => (
  <section>
    <h1 class="text-3xl font-bold text-amber">Bans</h1>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <BanForm
        action="/admin/bans/account"
        csrf={csrf}
        title="Ban account"
        idLabel="User ID"
        idName="user_id"
      />
      <LiftBanForm
        action="/admin/bans/account/lift"
        csrf={csrf}
        title="Lift account ban"
        idLabel="Ban ID"
        idName="ban_id"
      />
      <BanForm
        action="/admin/bans/ip"
        csrf={csrf}
        title="Ban IP or CIDR"
        idLabel="IP or CIDR"
        idName="target"
        preview={preview}
      />
      <LiftBanForm
        action="/admin/bans/ip/lift"
        csrf={csrf}
        title="Lift IP ban"
        idLabel="Ban ID"
        idName="ban_id"
      />
    </div>
    <section class="mt-6">
      <h2 class="text-xl font-bold">Account bans</h2>
      <div class="grid gap-3">
        {accountBans.map((ban) => (
          <article class="bg-header p-4">
            <h3>Ban {text(field(ban, "id", "banId", "ban_id"))}</h3>
            <RecordDetails item={ban} />
          </article>
        ))}
      </div>
    </section>
    <section class="mt-6">
      <h2 class="text-xl font-bold">IP bans</h2>
      <div class="grid gap-3">
        {ipBans.map((ban) => (
          <article class="bg-header p-4">
            <h3>{unknownIp(field(ban, "target", "ip", "cidr"))}</h3>
            <RecordDetails item={ban} />
          </article>
        ))}
      </div>
    </section>
  </section>
);

export interface DeletionsPageProps {
  queue: DeletionQueueMetadata[];
  csrf: string;
}

export const DeletionsPage: FC<DeletionsPageProps> = ({ queue, csrf }) => (
  <section>
    <h1 class="text-3xl font-bold text-amber">Deletions</h1>
    <form action="/admin/deletions" method="post" class="mt-4 flex flex-col gap-2 bg-header p-4">
      {csrfInput(csrf)}
      <h2 class="font-bold">Delete a paste</h2>
      <label htmlFor="deletion-paste-id">
        Paste ID
        <input id="deletion-paste-id" name="paste_id" required class="ml-2 px-2 py-1 text-black" />
      </label>
      <label htmlFor="deletion-reason">
        Reason
        <textarea id="deletion-reason" name="reason" required class="ml-2 px-2 py-1 text-black" />
      </label>
      <button type="submit" class="self-start rounded-sm bg-amber px-3 py-1">
        Delete paste
      </button>
    </form>
    <section class="mt-6">
      <h2 class="text-xl font-bold">Deletion queue</h2>
      <table class="mt-2 w-full text-left">
        <thead>
          <tr>
            <th scope="col">Paste ID</th>
            <th scope="col">Reason</th>
            <th scope="col">Status</th>
            <th scope="col">Admin</th>
            <th scope="col">Time</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((item) => (
            <tr>
              <th scope="row">{text(field(item, "pasteId", "paste_id", "id"))}</th>
              <td>{text(item.reason)}</td>
              <td>{text(field(item, "status", "state"))}</td>
              <td>{text(field(item, "admin", "adminEmail"))}</td>
              <td>{time(item, "createdAt", "created_at", "completedAt")}</td>
              <td>
                {String(field(item, "status", "state")).toLowerCase() === "failed" ? (
                  <form action="/admin/deletions/retry" method="post">
                    {csrfInput(csrf)}
                    <input
                      type="hidden"
                      name="queue_id"
                      value={text(field(item, "id", "queueId", "queue_id"), "")}
                    />
                    <button type="submit">Retry</button>
                  </form>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </section>
);

export interface DmcaPageProps {
  cases: DmcaCaseMetadata[];
  csrf: string;
}

export const DmcaPage: FC<DmcaPageProps> = ({ cases, csrf }) => (
  <section>
    <h1 class="text-3xl font-bold text-amber">DMCA cases</h1>
    <form action="/admin/dmca" method="post" class="mt-4 flex flex-col gap-2 bg-header p-4">
      {csrfInput(csrf)}
      <h2 class="font-bold">Create case</h2>
      <label htmlFor="dmca-reference">
        Reference
        <input id="dmca-reference" name="reference" required class="ml-2 px-2 py-1 text-black" />
      </label>
      <label htmlFor="dmca-complainant">
        Complainant
        <input
          id="dmca-complainant"
          name="complainant"
          required
          class="ml-2 px-2 py-1 text-black"
        />
      </label>
      <label htmlFor="dmca-received">
        Received date
        <input
          id="dmca-received"
          name="received_date"
          type="date"
          required
          class="ml-2 px-2 py-1 text-black"
        />
      </label>
      <label htmlFor="dmca-paste-ids">
        Paste IDs, comma-separated
        <input id="dmca-paste-ids" name="paste_ids" required class="ml-2 px-2 py-1 text-black" />
      </label>
      <label htmlFor="dmca-notes">
        Notes
        <textarea id="dmca-notes" name="notes" class="ml-2 px-2 py-1 text-black" />
      </label>
      <button type="submit" class="self-start rounded-sm bg-amber px-3 py-1">
        Create case
      </button>
    </form>
    <p class="mt-4">Corrections preserve case history. They do not restore deleted pastes.</p>
    <section class="mt-6">
      <h2 class="text-xl font-bold">Case list</h2>
      <div class="grid gap-3">
        {cases.map((item) => {
          const caseId = text(field(item, "id", "caseId", "case_id"), "");
          const decision = String(field(item, "status", "state") ?? "open").toLowerCase();
          return (
            <article class="bg-header p-4">
              <h3>{text(field(item, "reference", "ref"))}</h3>
              <dl class="grid gap-1 sm:grid-cols-2">
                <div>
                  <dt>State</dt>
                  <dd>{decision}</dd>
                </div>
                <div>
                  <dt>Complainant</dt>
                  <dd>{text(item.complainant)}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{text(field(item, "receivedDate", "received_date"))}</dd>
                </div>
                <div>
                  <dt>Paste IDs</dt>
                  <dd>{text(field(item, "pasteIds", "paste_ids"))}</dd>
                </div>
                <div>
                  <dt>Decision reason</dt>
                  <dd>{text(field(item, "decisionReason", "decision_reason"))}</dd>
                </div>
                <div>
                  <dt>Decided by</dt>
                  <dd>{text(field(item, "decidedBy", "decided_by"))}</dd>
                </div>
                <div>
                  <dt>Decided at</dt>
                  <dd>{time(item, "decidedAt", "decided_at")}</dd>
                </div>
              </dl>
              {decision === "open" ? (
                <div class="mt-3 flex flex-wrap gap-3">
                  <form action="/admin/dmca/decision" method="post">
                    {csrfInput(csrf)}
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="decision" value="uphold" />
                    <label htmlFor={`uphold-${caseId}`}>
                      Reason
                      <textarea
                        id={`uphold-${caseId}`}
                        name="reason"
                        required
                        class="ml-2 text-black"
                      />
                    </label>
                    <button type="submit">Uphold</button>
                  </form>
                  <form action="/admin/dmca/decision" method="post">
                    {csrfInput(csrf)}
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="decision" value="reject" />
                    <label htmlFor={`reject-${caseId}`}>
                      Reason
                      <textarea
                        id={`reject-${caseId}`}
                        name="reason"
                        required
                        class="ml-2 text-black"
                      />
                    </label>
                    <button type="submit">Reject</button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  </section>
);

export interface ActionsPageProps {
  actions: any[];
  page: number;
}

export const ActionsPage: FC<ActionsPageProps> = ({ actions, page }) => (
  <section>
    <h1 class="text-3xl font-bold text-amber">Admin actions</h1>
    <table class="mt-4 w-full text-left">
      <thead>
        <tr>
          <th scope="col">Admin</th>
          <th scope="col">Action type</th>
          <th scope="col">Target</th>
          <th scope="col">Reason</th>
          <th scope="col">Time</th>
          <th scope="col">Outcome</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((action) => (
          <tr>
            <td>{text(field(action, "admin", "adminEmail", "admin_email"))}</td>
            <td>{text(field(action, "action", "actionType", "action_type", "type"))}</td>
            <td>{text(field(action, "target", "targetId", "target_id"))}</td>
            <td>{text(action.reason)}</td>
            <td>{time(action, "createdAt", "created_at", "time")}</td>
            <td>{text(field(action, "outcome", "result"))}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <Pager path="/admin/actions" page={page} />
  </section>
);
