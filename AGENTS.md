# AGENTS.md — Dhruva Dashboard Backend

> **Read this file first, before every change.** It is the single source of truth for how this
> codebase is put together. **Keeping it up to date is part of every task** — see
> [§13 Maintenance protocol](#13-maintenance-protocol-mandatory) and log your change in
> [§14 Change log](#14-change-log).

---

## 1. What this project is

The Node.js/Express REST API behind the **Dhruva** event-management back-office dashboard.
It covers:

- **Client bookings** ("events"): weddings and other events, their sub-event types, venues,
  coordinators, agreed and payable amounts, and the advance payment schedule.
- **Requests/requirements**: department spend requests with a multi-role approval workflow
  (Accounts, Owner, Approver, CA).
- **Daybook**: daily cash/account inflow and outflow, profit/loss, and opening/closing balances.
- **Vendors, departments, users, checklists, bills/EMIs, budget reports, client leads,
  marketing targets, personal calendar, spreadsheet workbooks** (Univer Sheets snapshots).

The frontend is a separate React app, not in this repo. Contracts shared with the frontend
live in `Routes/**/*.md` (see §11).

## 2. Tech stack and runtime

| Item | Value |
|---|---|
| Language | JavaScript, **CommonJS** (`require` / `module.exports`). No TypeScript, no build step |
| Framework | **Express 5** (`express@^5.1.0`): route-order rules differ from v4, see §6 |
| DB | MongoDB via **Mongoose 8** |
| Auth | JWT (`jsonwebtoken`), passwords hashed with `bcrypt` (cost 12) |
| Validation | `express-validator` in route files, plus manual checks in controllers |
| Middleware | `cors()` (open), `helmet.crossOriginResourcePolicy`, `morgan('dev')` |
| Deploy | **Serverless Framework v3** → AWS Lambda (`nodejs18.x`, `ap-south-1`, 1024 MB, 29 s timeout) behind **HTTP API** |
| Local | `node app.js` (port `PORT` or **4010**) |
| Tests | **None.** `npm test` just exits 1. No linter or formatter config |

## 3. Commands

```bash
npm install
npm start                 # node app.js (connects to DB, then listens on :4010)
npm run dev               # nodemon app.js. nodemon is NOT in package.json, so it needs a global install
npm run sls:offline       # serverless offline (local Lambda emulation)
npm run sls:deploy        # deploy stage "dev"
npm run sls:deploy:prod   # deploy stage "prod"
```

**Deployed environment:**

| Stage | Stack | Region | API base URL (frontend uses this) |
|---|---|---|---|
| dev | `dashboard-dev` | ap-south-1 | `https://gbgmfpqxbi.execute-api.ap-south-1.amazonaws.com/api/` |

**How to deploy.** Serverless v3 here doesn't read `.env` on its own (`useDotenv` isn't set),
so export the variables first. Otherwise the hard-coded fallbacks in `serverless.yml` are used.
Pass AWS credentials through the environment or `~/.aws`, and never write them into the repo:

```bash
set -a; . ./.env; set +a
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... npx serverless deploy --stage dev --region ap-south-1
curl https://gbgmfpqxbi.execute-api.ap-south-1.amazonaws.com/api/health   # expect {"status":"ok"}
```

**Smoke check (no DB, no server):** this loads every route, controller and model, so it catches
broken `require`s and syntax errors:

```bash
AWS_LAMBDA_FUNCTION_NAME=check DB_URL= node -e "require('./app'); console.log('OK')"
```

Expected output today is `OK`, plus one known Mongoose warning about a duplicate `eventId`
index (see §12). Run this after **every** change.

## 4. Environment variables

Loaded with `dotenv` from `.env`, which is git-ignored. **Never commit secrets or paste them
into docs or this file.**

| Var | Used by | Notes |
|---|---|---|
| `DB_URL` | `lib/mongo.js` | Required. The process exits locally, or Lambda returns 503, if it is missing or unreachable |
| `JWT_SECRET` | `authentication/is-auth.js`, `Controlers/User`, `Controlers/counter`, `utils/functions.js` | Signs and verifies tokens. Also used as the "token" for the internal counter endpoint |
| `TOKEN_VALIDITY` | User login | Access-token TTL, default `1d` |
| `TOKEN_MAX_VALIDITY` | User login | Refresh-token TTL, default `7d` |
| `PORT` | `app.js` | Default 4010 |
| `API_ROOT` | `utils/functions.js` | Base URL the server uses to call **its own** `/api/counter` over HTTP. **Not in `.env` today**, so department creation fails (§12) |
| `AWS_LAMBDA_FUNCTION_NAME` | `app.js`, `lib/mongo.js` | Set automatically by Lambda and switches Lambda-specific behaviour |
| `NODE_ENV` | serverless.yml | Set to the stage name |
| `TNO_V1_SMTP_*`, `TNO_OWNER_SMS_*` | `utils/sendEmail.js`, `utils/functions.js` | Legacy. Unused, see §10 |

## 5. Directory layout

The folder names **`Controlers`** (one "l") and **`Modals`** (meaning models) are misspelled on
purpose. **Do not rename them**, because every `require` path depends on them.

```
app.js                      Express app: middleware, /api mounts, local cron, local listen
handler.js                  Lambda entry (serverless-http). Warm-up ping handling, DB connect per invoke
lib/mongo.js                ensureConnected(): cached global Mongoose connection (Lambda-safe)
authentication/is-auth.js   JWT middleware → sets req.userId
serverless.yml              AWS deploy config
Routes/<Module>/index.js    express.Router per module (+ frontend contract .md files)
Controlers/<Module>/index.js  Request handlers (business logic lives here)
Modals/<Module>/index.js    Mongoose schemas/models
Modals/Daybook/{DaybookInflow,DaybookOutflow,DaybookOpeningBalance}/index.js
utils/
  dataCutoff.js             GLOBAL data-visibility cutoff (see §8). Very important
  daybook.js                Daybook V2 money rules, account list, validation, balance walk (see §7 /daybook)
  statusCodes.js            STATUS constants (NOTE: NOT_FOUND = 204!)
  messages.js               MESSAGE constants
  validations.js            name/email/phone/password validators (async, return {status})
  functions.js              counter HTTP helpers (+ dead SMS/report code)
  constants.js              legacy constants from another project (unused)
  sendEmail.js              legacy, requires `nodemailer` which is NOT installed (unused)
functions/                  empty (app.js comment mentions functions/cleanupAssets.js, which doesn't exist)
.serverless/                Serverless build output. It IS tracked in git (api.zip etc.)
PAYLOAD_EXAMPLES.md         example booking payloads
Budget report ... .xlsx     sample spreadsheet (excluded from deploy)
```

Each module is one folder name in each of the three layers, e.g. `Routes/request` →
`Controlers/request` → `Modals/Request`. Casing is inconsistent between layers, so check it.

## 6. Request lifecycle and conventions

1. **Lambda only:** `handler.js` strips a bogus `content-encoding: gzip` header and
   defaults `content-type` to JSON. It also short-circuits EventBridge warm-up events
   (`source === 'aws.events'`), then awaits `ensureConnected()`. It returns **503
   `{code:'DB_CONNECTION'}`** if Mongo is down.
2. `app.js` uses a custom JSON body parser on Lambda and `express.json({limit:'2048mb'})`
   locally.
3. All APIs are mounted under **`/api/`**. `GET /api/health` is the health check, and
   `/api/assets` serves static files from `./assets`. That folder doesn't exist in the repo,
   and a local-only cron at 01:01 clears it.
4. Route → optional `isAuth` → optional `express-validator` chain → controller.

### Auth model (read carefully)
- The client sends the **raw JWT in the `Authorization` header with no `Bearer ` prefix**.
  `is-auth.js` verifies it with `jwt.verify(token, JWT_SECRET)`.
- The token payload is `{ uid, role }`. The middleware sets **`req.userId = uid || id`**. It
  does **not** set `req.role`.
- **Controllers read the role themselves** with `jwt.decode(req.get('Authorization'))`, which
  decodes without verifying. That is only safe on routes that also use `isAuth`. On public
  routes, `decodedToken` may be `null`, so guard it with `decodedToken?.role`.
- Role failures return **401** (`STATUS.UNAUTHORISED`) with `MESSAGE.unauthorized` in most
  modules. Bookings delete/edit return **403**.
- There is **no refresh endpoint**. Login returns a `refresh_token`, but nothing consumes it.

### Roles
`ADMIN, DEPARTMENT, OWNER, ACCOUNTS, MARKETING, APPROVER, CA` (enum in `Modals/User`).
The user schema default is `ADMIN`. Each controller keeps its own role arrays, so when you add
a role, grep for every `includes(decodedToken.role)` and every `*_ROLES` constant.

### Response and coding conventions (follow the local style of the module you edit)
- Use `STATUS.*` and `MESSAGE.*` from `utils/`. **`STATUS.NOT_FOUND` is 204** (No Content, so
  the body is dropped). Newer code uses a literal `404` on purpose. For a real not-found error
  in new code, use `404`.
- Errors look like `{ message, error?: error.message, field? }`. Validation failures use 422
  (`STATUS.VALIDATION_FAILED`) or 400.
- Duplicate key (`error.code === 11000`) → **409**. The same applies to optimistic-lock
  conflicts and "still referenced" deletes.
- Most models have a `toJSON` transform: `_id` → `id`, and `__v` is removed. `.lean()` queries
  skip the transform and return `_id`. Frontends often receive both shapes.
- Money totals in booking dashboards are **whole rupees** (`roundRupee`).
- Escape user input before building `$regex`. Use the existing `escapeRegex` and
  `replace(/[.*+?^${}()|[\]\\]/g,'\\$&')` helpers.
- Use `.maxTimeMS(...)` on heavy queries (20–30 s). Lambda's hard limit is 29 s.
- Express 5 matching: **register static paths (`/minimal`, `/excel`, `/group-by`, `/vendor/:id`
  …) before `/:id`**. Comments in the route files mark where this matters.
- Large commented-out blocks are old versions kept in place (e.g. the top ~1040 lines of
  `Controlers/Vendor`, the top of `Controlers/Bills`, `Routes/Bills`, `Routes/Vendor`,
  `Routes/ClientsBookings`). Ignore them, and don't edit them by mistake when using
  search-and-replace.

## 7. API surface (all prefixed `/api`)

Auth column: **JWT** = `isAuth`, **public** = no middleware. "Roles" means a role check inside
the controller.

### `/user` (Routes/User)
| Method & path | Auth | Roles / notes |
|---|---|---|
| POST `/register-token` | public | Self-registration. **Takes `role` from the body** (security risk, §12). Stores email in `email_data.temp_email_id` |
| POST `/login` | public | `{email_id,password}` → `{access_token, refresh_token, user_id, name, email_id, role, designation, is_active, departments[], dataCutoffDate}`. Looks up `email_data.email_id`, then `temp_email_id` |
| POST `/` | JWT | ADMIN. Body `first_name,last_name,email_data.email_id,password,phone_data.phone_number,role,designation?,department?` (DEPARTMENT role requires `department`) |
| GET `/` | JWT | ADMIN, OWNER. `?status,size,page,sort` |
| GET `/:id` | JWT | ADMIN, OWNER |
| PATCH `/:id` | JWT | ADMIN |
| PATCH `/status/:id` | JWT | ADMIN |
| PATCH `/archive/:id` | JWT | ADMIN, toggles `is_archived` |
| DELETE `/:id` | JWT | ADMIN |
| PATCH `/change/password` | JWT | Any role. Changes the caller's own password |

### `/department`
All routes use JWT. Only **POST `/` checks for ADMIN**. The other routes have no role check.
Routes: PATCH `/status/:id`, PATCH `/archive/:id`, DELETE `/:id`, PATCH `/:id`, POST `/`,
GET `/similar/:name`, GET `/all`, GET `/active`, GET `/:id`, GET `/`.
Create assigns `department_id` from `/counter` through an HTTP self-call (§12).

### `/counter`
Public. GET `/?entity=DEPARTMENT` returns the count. POST `/` with `{entity, token}` increments
it, and `token` must equal `JWT_SECRET`.

### `/request` (spend requests, the approval workflow)
All routes use JWT.
| Method & path | Roles |
|---|---|
| POST `/` | DEPARTMENT, ADMIN. Body: `purpose, amount, transation_in (CASH/ACCOUNT), priority (HIGH/MEDIUM/LOW), required_date?, vendor?, event_reference?, groupBy?, note?, remarks?`. The department comes from the user's first department |
| GET `/my-requests`, GET `/my-requests/:id` | any (own requests). `page,size,status,required_date*` |
| GET `/` | OWNER, ADMIN, DEPARTMENT, APPROVER, CA → `{items, departmentWiseItems, totalItems, pagination}` |
| GET `/all` | same roles → `{departments:{<name>:[...]}, pagination, totalItems}` |
| GET/POST `/group-by`, DELETE `/group-by/:id` | read: OWNER/ADMIN/DEPARTMENT/APPROVER/CA. write: OWNER/ADMIN/DEPARTMENT. delete: OWNER/ADMIN (409 if referenced) |
| GET `/:id` | OWNER, ADMIN, CA |
| PATCH `/:id` | OWNER, DEPARTMENT, APPROVER, CA (see the workflow below) |
| PATCH `/:id/archive` | OWNER, ADMIN (toggle) |
| DELETE `/:id` | any authenticated role (hard delete) |
| GET `/department/:id` | any. Returns `STATUS.NOT_FOUND` (204) when empty |

List filters for GET `/` and `/all`: `page`, `size|limit` (max 100), `status`, `priority`,
`department` (id **or** name), `accounts_check`, `ca_check`, `owner_check`, `approver_check`,
`event|eventId`, `vendor|vendorId`, `groupBy`, `startDate`/`endDate` (on createdAt),
`required_date_start`/`_end`, `search`. Note that `search` targets fields that don't exist
(`title`, `description`, populated user fields), so in practice only department-name matches
work.

**Approval workflow (`updateRequest`).** Setting `status` to APPROVED/COMPLETED or REJECTED
stamps a per-role check field:
- DEPARTMENT → `accounts_check` (the "accounts" step is done by DEPARTMENT users)
- OWNER → `owner_check`
- APPROVER → `approver_check`
- CA → `ca_check`, plus `ca_approved`, `ca_approved_by`, `ca_approved_at`

`ca_approved` (boolean) can only be set by CA, and it also sets `status` when status wasn't
sent. Only OWNER, APPROVER and CA can set `approver_amount`.

`amount_paid` stores the **latest payment** and adds to `total_amount_paid`. Every update sets
`handled_by`.

Daybook outflow reads `amount_paid > 0`, keyed on `updatedAt`.

### `/vendor`
All routes use JWT **except GET `/all`**. POST `/` allows all 7 roles. `vendor_code` is
auto-generated with prefix `A-SBE` / `C-SBE` / `AC-SBE` / `SBE` from `specify_cat`
(account / cash / cash_and_account / other), taking the max existing number + 1.
GET `/list` is paginated (limit ≤ 500). GET `/minimal` returns id, name, code (≤ 5000).
GET `/department/:id` and GET `/` return the user's department vendors. DELETE `/:id/safe`
returns 409 when the vendor is referenced by requests or budget reports. DELETE `/:id` is a
hard delete. Also GET/PUT `/:id`.

### `/events` (client bookings, `Modals/ClientsBookings`, model `Event`)
| Method & path | Auth | Notes |
|---|---|---|
| POST `/` | JWT | Body `eventId` (= EventName id), `clientName`, `contactNumber`, `eventTypes[]`, … A string `eventTypes[].eventType` **auto-creates** the EventType |
| GET `/my-events` | JWT | `createdBy = caller` |
| GET `/minimal` | **public** | id, eventName, client info, budgetReport meta |
| GET `/leaderboard` | **public** | `mode=mostBooked|mostAmount`, `month=YYYY-MM`, `page,limit` |
| GET `/balance-sheet` | JWT | Confirmed events only: payable − received |
| GET `/` | **public** | Main list + `summary` + `totalsByStatus` (all/confirmed/pending/inprogress/cancelled) + `totalEstimatedBudget` from leads |
| GET `/:eventId` | JWT | + `budgetReport` meta |
| PUT `/:eventId/edit` | JWT | ADMIN/OWNER or creator. **Keeps received fields** of existing advances (matched by eventType + advanceNumber) |
| PATCH `/:eventId/advances/:advanceNumber` | JWT | DEPARTMENT, OWNER, APPROVER, CA. Records received amount/date/remarks/mode |
| PATCH `/:eventId/event-types/:eventTypeId/advances/:advanceNumber` | JWT | same roles. `eventTypeId` = subdoc `_id` or EventType id |
| DELETE `/:eventId` | JWT | ADMIN/OWNER or creator. Also deletes BudgetReports + the `budget-report` workbook and nulls `request.event_reference` |

List query params: `status|eventConfirmation` (`confirmed|inprogress|cancelled|canceled`),
`eventName` (id or name regex), `startDate`, `endDate`, `venue|venueLocation`,
`subVenue|subVenueLocation`, `page`, `limit` (≤ 500, unpaginated when omitted), `search`
(balance-sheet only).

**Booking money rules (keep consistent across every rollup):**
- `advancePaymentType === 'complete'` → payable = `eventTypes[0].totalPayable` only.
  Otherwise, sum every `eventTypes[].totalPayable`.
- **Wedding + `complete`** (event name label === `"Wedding"`) → agreed =
  `eventTypes[0].agreedAmount`. Received/expected advances are **de-duplicated by
  advanceNumber** (max per key). Otherwise the values are summed flat.
- `eventConfirmation` enum: `'Confirmed Event' | 'InProgress' | 'Cancelled'`. Note the space and
  the casing. ClientLead uses `Inprogress` / `Confirmed` / `Cancelled` instead.
- Imported data can have **string `_id`s and string dates**. Use `findEventDocById`,
  `idQueryValues` and the `$convert`-based `applyEventTypesElemFilter`, not plain casts.

### `/event-names` (`Modals/events`, model `EventName`), `/event-types` (`Modals/eventTypes`), `/venue`, `/sub-venue-location`
Simple CRUD with **no auth** (the `isAuth` lines are commented out). express-validator requires
`name`. EventType also requires `event`, and SubVenue requires `venue`. Extra routes: GET
`/event-types/event/:eventId` and GET `/sub-venue-location/venue/:venueId`. Updates use PATCH.

### `/coordinators`
CRUD, public **except GET `/:id`**, which uses JWT. Updates use PATCH.

### `/checklist`
All routes use JWT, with no role checks (they're commented out). Routes: POST `/` (nested
`subHeadings[].checklists[]` validated), GET `/`, GET `/active/all`, GET/PATCH/DELETE `/:id`,
PATCH `/status/:id`, PATCH `/archive/:id`.

### `/bills` (EMIs)
**No auth at all.** CRUD on `/` and `/:id`, plus GET `/emi/status`, PUT `/emi/status/:id`,
PUT `/emi/bulk/:id`. `frequency` is MONTHLY/QUARTERLY/YEARLY. GET fills in missing periods
between `startDate||emiDate` and `emi_end_date`, using `defaultAmount` for them.

### `/budget-report` (legacy JSON budget reports, collection `budgetreports`)
All routes use JWT, with no role checks. Routes: POST `/`, POST `/:id/clone`, GET `/`,
GET `/vendor/:vendorId`, GET `/event/:eventId`, GET `/:id`, PUT `/:id`. `vendorIds` is derived
from `budgetData.groups.*[].vendorId`.
The **newer Excel budget report** lives in spreadsheet-workbooks (`module=budget-report`).

### `/client-leads`
**All public, no JWT**, so `createdBy` is always null. Routes: POST `/`, GET `/` (filters
`status`, `assignedTo`, `startDate`/`endDate` YYYY-MM-DD or `month=YYYY-MM`, and it returns a
budget `summary`), GET/PUT `/excel` (shared Leads Tracker workbook), GET/PUT/DELETE `/:id`.
`convertedByMarketing=true` moves `estimatedBudget` from the "estimated" total to the
"converted" total, and `convertedAt` is managed automatically.

### `/daybook` (Daybook V2: a pure manual ledger)
**Full contract: `Routes/daybook/DAYBOOK_V2_CONTRACT.md`**, including the backend
implementation notes at its end. All routes use JWT, with roles **OWNER, ADMIN, CA, ACCOUNTS,
APPROVER, DEPARTMENT** (not MARKETING).
The daybook is **not** linked to requests or booking advances any more. Every row is typed in
by Accounts.
- GET `/?startDate&endDate` (YYYY-MM-DD, inclusive; `date=` is shorthand), `limit` (default
  200, max 1000) → `{inflow{count,totals{gross,gst,tds,net},data}, outflow{count,totals{amountPaid,tds,gst,actual},data}, surplusDeficit{value,type SURPLUS|DEFICIT}, openingBalanceSet, balances{days[]}}`.
  Totals always cover all matching rows. The range is capped at 3660 days (400).
- POST `/inflows`, PUT/DELETE `/inflows/:id` (PUT is a full replace).
  `netAmountReceived = round2(amountReceived − gst − tds)`. CASH must have gst = tds = 0.
- POST `/outflows`, PUT/DELETE `/outflows/:id`. `vendorId` is required, and a snapshot of
  `vendorName` and `vendorCode` is stored.
  `actualAmountPaid = round2(amountPaid − tds + gst)`.
- GET/PUT `/opening-balance`: a single document `{asOfDate, balances[{source, amount}]}`.
  PUT needs every source exactly once (negative amounts allowed), and returns 409 if any
  entry is dated before `asOfDate`.
- **Balances are never stored.** `balances.days` is computed on read by walking from `asOfDate`
  (`utils/daybook.js` `computeBalanceDays`, which matches the contract's reference algorithm).
  There is one row per calendar day, carried forward, and closing balances can be negative.
- Sources are `Cash` + the fixed account list in `utils/daybook.js` `ACCOUNT_NAMES`, which must
  match the frontend `daybookConfig.js`. If the list changes, change both, and the
  opening-balance document must then be re-saved with every source.
- **Never trust client net/actual amounts.** All money math goes through `utils/daybook.js`.
- Dates are plain `YYYY-MM-DD` strings (no time zones). Entries must be dated on or after
  `asOfDate` once an opening balance exists.

### `/spreadsheet-workbooks` (Univer Sheets snapshots, collection `spreadsheetworkbooks`)
JWT plus roles (all 7), **except `module=client-leads`, which is public**.
Modules: `client-leads` (key `default`), `budget-report` (key = event `_id`; the event must be
Confirmed Event or InProgress), `daily-expenses`, `daybook-inflow`, `daybook-outflow` (key =
YYYY-MM-DD).
- GET `?module&key` returns one workbook. A missing workbook returns a 200 with
  `workbookData:null, version:0`. GET `?module&list=1[&date|from|to]` returns metadata only.
- PUT `/`: upsert. **Optimistic locking:** when updating, `version` must match, or the API
  returns 409. `workbookData` is replaced **wholesale** (no deep merge), max ~12 MB (413).
- POST `/clone` (budget-report only): `{module, sourceKey, targetKey}`. Returns 409 if the
  target already has one.
- DELETE `?module&key`.

### `/marketing-targets`
JWT. Write and delete: OWNER, ADMIN, DEPARTMENT. Read: any role. `{teamName, month: YYYY-MM,
targetAmount, note}` is unique per (teamName, month), with a 409 on duplicates.

### `/personal-calendar`
JWT, scoped to `req.userId`. `category` is one of TODO_LIST, PROBLEM_RESOLVES,
GENERAL_MEETING_NOTES. GET filters: `category`, `from`, `to` on `startAt`.

### `/settings`
GET `/data-cutoff` (JWT) → `{cutoffDate}`.

## 8. Global data-visibility cutoff (`utils/dataCutoff.js`). Know this before touching any list API

The `appsettings` collection holds the key `dataVisibilityCutoffDate` (YYYY-MM-DD, inclusive).
It defaults to **`2026-04-01`**. A legacy value of `2026-03-01` is auto-migrated to the default,
and the value is cached for 60 s per process. Clearing the value turns the filter off, and an
error falls back to the default. **Older data is hidden** by raising the `$gte` floor:

| Where | Field |
|---|---|
| Requests (my, all, `/all`, by department) | `required_date` (docs with no `required_date` are excluded too) |
| Events list, my-events, balance-sheet, minimal, leaderboard | at least one `eventTypes[].startDate ≥ cutoff` (string dates coerced) |
| Client leads list, leads estimated-budget card | `startDate` |
| Personal calendar | `startAt` |
| Bills list | `startDate ?? emiDate` |
| Daybook V2 | **exempt on purpose.** The ledger starts at the opening balance's `asOfDate`, and clamping would make totals disagree with balances |
| Spreadsheet date-key modules | keys and list ranges before the cutoff return empty |
| Login response | `dataCutoffDate` |

**When you add a new list or report endpoint, apply the cutoff the same way**, or explicitly
document why it's exempt. Use `applyDateFieldCutoff(query, field, await getDataCutoffDate())`
for simple date fields.

## 9. Data model quick reference (Mongoose model name → collection)

| Model file | `mongoose.model` name | Key fields / notes |
|---|---|---|
| User | `user` | `first_name,last_name,email_data{email_id,temp_email_id,…},phone_data{phone_number,…},role,designation,department{has_department,department:[ObjectId]},password,is_active,is_archived`. Text index on name, email, phone |
| Department | `department` | `department_id` (from counter), `name, is_active, is_archived` |
| Counter | `counter` | `entity` enum `['DEPARTMENT']`, `count` |
| Request | `request` | see §7. **`amount_paid` is declared twice** (Boolean, then Number), and the later Number wins. Field name `transation_in` is misspelled on purpose, so keep it. Refs: `requested_by/handled_by/ca_approved_by→user`, `department`, `vendor`, `event_reference→Event`, `groupBy→RequestGroupBy`. 8 compound indexes, each starting with `is_archived` |
| RequestGroupBy | `RequestGroupBy` (coll `request_group_bys`) | unique `name` |
| Vendor | `vendor` | unique `vendor_code`, required `name, person_category, company_name`. `specify_cat` cash/account/cash_and_account. `vendor_status` ACTIVE/INACTIVE. `department`, `vendor_belongs_to→department` |
| ClientsBookings | `Event` (coll `events`) | `eventName→EventName`, `eventTypes[]{eventType→EventType, startDate, endDate, venueLocation→venue, subVenueLocation→subVenueLocation, coordinator→coordinator, agreedAmount, accountAmount, accountGst, accountAmountWithGst, cashAmount, totalPayable, advances[]{advanceNumber, expectedAmount, advanceDate, status, receivedAmount, receivedDate, givenBy, collectedBy, modeOfPayment cash/account, remarks, updatedBy, updatedAt}}`, `clientName, brideName, groomName, lead1/lead2→coordinator, contactNumber, alt*, note, meetingDate, eventConfirmation, advancePaymentType complete/separate, createdBy→user` |
| events | `EventName` (coll `eventnames`) | unique `name` (e.g. "Wedding") |
| eventTypes | `EventType` | `name, event→EventName`, unique (name, event) |
| Venue / SubVenueLocation | `venue` / `subVenueLocation` | venue `name` unique. Sub venue has `venue` ref |
| Coordinators | `coordinator` | `name, contact_number, email, is_active, is_archived` |
| Checklist | `checklist` | `heading, eventReference (string), subHeadings[]{subHeadingName, checklists[]{checklistName, units, length, breadth, depth, quantity, rate}}` |
| Bills | `Bill` | `name, belongs_to, startDate, frequency, emi_end_date, emiType, emiDate, defaultAmount, emiStatus[]{month, year, emiAmount, paid, amountPaid, remarks, paymentMode Cash/Account, paymentDate}`. Virtuals `totalEmiAmount, totalPaid, remainingAmount` |
| BudgetReport | `budgetreport` | `eventId→Event, budgetData (Mixed), exteriorDetails, metadata, vendorIds[]` |
| ClientLead | `clientlead` | `status Inprogress/Confirmed/Cancelled, clientDetails, eventTypeDetails, assignedTo→coordinator, startDate, endDate, notes, estimatedBudget, convertedByMarketing, convertedAt, createdBy` |
| MarketingTarget | `MarketingTarget` (coll `marketing_targets`) | unique (teamName, month) |
| PersonalCalendar | `PersonalCalendar` (coll `personal_calendars`) | `userId, title, category, startAt, endAt, description` |
| Settings | `appsetting` | `key` unique, `value` Mixed |
| SpreadsheetWorkbook | `spreadsheetworkbook` | unique (module, key). `workbookData` Mixed (opaque), `meta`, `version`, `createdBy`, `updatedBy` |
| Daybook/DaybookInflow | `daybookinflows` | V2: `clientName, eventDate, eventReference→Event, receivedDate (STRING YYYY-MM-DD, indexed), receivedIn CASH/ACCOUNT, accountName, amountReceived, gstAmount, tdsAmount, netAmountReceived (server-computed), note, createdBy (string)`. Legacy rows (`name, receivedBy, event_reference`) remain until the owner-approved cleanup |
| Daybook/DaybookOutflow | `daybookoutflows` | `vendorId→vendor, vendorName, vendorCode (snapshot), paidDate (STRING, indexed), paidFrom CASH/ACCOUNT, accountName, amountPaid, tdsAmount, gstAmount, actualAmountPaid (server-computed), note, createdBy` |
| Daybook/DaybookOpeningBalance | `daybookopeningbalances` | single doc (unique `singleton: "default"`): `asOfDate, balances[{source, amount}], updatedBy` |

The old `daybookaccountopenclosebalances` collection has no model any more. It is dropped by
the contract's §5 cleanup.

`ref` strings must match the **model name** exactly, including case (`'user'`, `'Event'`,
`'EventName'`, `'EventType'`, `'vendor'`, `'department'`, `'coordinator'`, `'venue'`,
`'subVenueLocation'`, `'RequestGroupBy'`). Raw `$lookup`s use **collection** names
(`events`, `eventnames`, `vendors`, `departments`, or `Model.collection.name`).

## 10. Dead or legacy code (don't build on it)
- `utils/sendEmail.js` requires `nodemailer`, which isn't installed. Requiring this file
  **crashes**. Nothing requires it.
- `utils/functions.js`: `sendLoginValidationSMS` and `saveTestReport` refer to undefined
  constants and a non-existent `/report` API. These are leftovers from an older "TNO /
  Govt of Karnataka" project, as are `utils/constants.js` and the email template text.
- `/api/assets` static serving and the local cron that clears `assets/*` act on a folder that
  doesn't exist.
- The `updateAdvance` fallback to `event.advances` refers to a field that isn't in the schema.

## 11. Frontend contract docs
`Routes/API_DOCS_INDEX.md` is the index. Per-module docs are `Routes/request/*.md`,
`Routes/daybook/DAYBOOK_V2_CONTRACT.md` (canonical; `Routes/daybook/legacy/` is superseded),
`Routes/ClientsBookings/*.md`, `Routes/ClientLead/FRONTEND_ESTIMATED_BUDGET.md`,
`Routes/MarketingTarget/FRONTEND.md` and `Routes/PersonalCalendar/FRONTEND.md`. There are
also the consolidated files `Routes/FRONTEND_ALL_APIS_FINAL.md` and
`Routes/FRONTEND_HANDOFF_ALL_APIS.md`, plus `PAYLOAD_EXAMPLES.md`.
**If you change a request or response shape, update the matching .md file.** All `*.md` files
are excluded from the Lambda package.

## 12. Known issues and risks (verified by reading the code, 2026-11-17)
Fix these only when asked. Don't "fix" them silently as part of an unrelated task.
1. **Secrets in source control:** `serverless.yml` contains a hard-coded fallback for
   `DB_URL` (MongoDB Atlas credentials) and `JWT_SECRET`. `.env` contains commented-out AWS
   keys. Rotate them, and use only `${env:...}` or SSM.
2. `POST /api/user/register-token` is public and accepts any `role`, including `ADMIN`.
3. Many write endpoints have no auth: bills (all), event-names, event-types, venue,
   sub-venue-location, coordinators, client-leads, counter (secret-protected). `GET /events`,
   `/events/minimal`, `/events/leaderboard` and `/vendor/all` are public.
4. Role checks call `jwt.decode` without verifying the token. This is safe only behind `isAuth`.
5. `STATUS.NOT_FOUND` is 204, so "not found" responses using it have no body.
6. Department create calls `${API_ROOT}counter` over HTTP, and `API_ROOT` isn't set, so
   create returns 500 unless it's configured. The counter is also not atomic.
7. `validations.validateEmailID` returns an object, so the Vendor email check
   (`if (!isEmailValid)`) never fails.
8. Vendor create/get assigns the user's `department.department` **array** to the single
   `vendor_belongs_to` ObjectId.
9. Request `search` targets fields that don't exist on the model.
10. Duplicate index warning: `BudgetReport.eventId` declares both `index:true` and
    `schema.index`.
11. Body limit is `2048mb` locally. HTTP API caps payloads at about 10 MB anyway.
12. `.serverless/` build artifacts (including `api.zip`) are committed.
13. `nodemon` isn't a dependency (`npm run dev`).
14. **The live JWT secret is the public placeholder** `your-temporary-secret-change-this-in-production`
    (verified on the 2026-11-17 deploy by hash). Anyone can forge a token for any role. Fix:
    set a long random `JWT_SECRET` in `.env` and redeploy. This logs out every user.
15. Line 2 of `.env` has a value with an unquoted space or format problem, so `source .env`
    prints `command not found`. Quote the value.
16. **Daybook V2 legacy data cleanup is pending** (contract §5): old-shape `daybookinflows` rows,
    the `daybookaccountopenclosebalances` collection, and `spreadsheetworkbooks` `daybook-*`
    rows. Run it **only on the owner's say-so**, and **before** V2 inflows are entered, because
    `deleteMany({})` would also delete the new rows. Until it runs, legacy rows dated before
    the chosen `asOfDate` make `PUT /daybook/opening-balance` return 409.

## 13. Maintenance protocol (MANDATORY)

**Every agent or developer who changes this repo must, in the same change:**

1. **Before coding:** read the relevant §7 module entry, §8 (cutoff) and §12 (known issues).
   Open the actual route, controller and model files. Never trust memory or this file over
   the code. If they disagree, the code wins, and you fix this file.
2. **Adding a module:** create `Modals/<Name>/index.js`, `Controlers/<Name>/index.js` and
   `Routes/<Name>/index.js`. `require` and `app.use('/api/<kebab-path>', …)` it in `app.js`
   next to the others. Add `isAuth` unless the route is deliberately public. Add the role
   check in the controller. Apply the data cutoff to lists. Add a §7 entry and a §9 row.
3. **Changing routes, auth, roles, response shape, models, env vars, cutoff behaviour or
   deploy config:** update the matching section here **and** the frontend `.md` contract.
4. **Fixing a §12 item:** remove or strike it here and say so in the change log.
5. **Verify:** run the smoke check from §3. It must print `OK`. If you touched logic that
   can be exercised, run the server against a dev DB and hit the endpoint. There is no test
   suite, so say clearly what you did and didn't verify.
6. **Don't:** rename `Controlers`/`Modals`, rename the `transation_in` field, change enum
   string casing (`'Confirmed Event'`, `'InProgress'`, …), commit `.env` or secrets, or deploy
   (`sls deploy`) without explicit approval.
7. **Log it:** add a dated row at the **top** of §14. Include the date (YYYY-MM-DD), the
   author or agent, the files touched, and what changed and why. One row per logical change.
   Also update the "Last verified" line below.

_Last verified against code: **2026-11-18** (smoke check OK; Daybook V2 tested against a local throwaway MongoDB)._

## 14. Change log

Newest first. Use the format: `| date | who | files | summary |`

| Date | Who | Files | Summary |
|---|---|---|---|
| 2026-11-18 | Claude (agent) | `Controlers/daybook`, `Routes/daybook`, `utils/daybook.js` (new), `Modals/Daybook/DaybookInflow` (reshaped), `Modals/Daybook/DaybookOutflow` (new), `Modals/Daybook/DaybookOpeningBalance` (new), `Modals/Daybook/DaybookAccountsOpenCloseBalance` (deleted), `Routes/daybook/DAYBOOK_V2_CONTRACT.md` (new), `Routes/daybook/legacy/*` (moved + banner), `Routes/API_DOCS_INDEX.md`, `Routes/FRONTEND_*.md`, `AGENTS.md` | Implemented the Daybook V2 contract: a manual inflow/outflow ledger with server-computed net/actual amounts, a single opening balance, and day-wise balances computed on read. Removed the merging of requests and booking advances, `includeEventAdvances`, and the open-close-balance routes. The cutoff is not applied to the daybook. Tested on a local MongoDB with 366 checks (300 randomized cases match the contract reference algorithm, plus HTTP validation, auth, 409, carry-forward, edit, delete and legacy rows) — all pass. **Deployed 2026-11-18** to `dashboard-dev` (same URL; DB_URL/JWT_SECRET hash-checked unchanged). Live check: health 200, `/daybook` without a token 401, opening-balance GET 200 `{asOfDate:null}`, the V2 response shape is returned, and the old open-close route returns 404. **Legacy data cleanup (contract §5) not run.** |
| 2026-11-17 | Claude (agent) | deploy, `AGENTS.md`, `.serverless/*` | Deployed the current working tree to stage `dev` (stack `dashboard-dev`, ap-south-1). Base URL `https://gbgmfpqxbi.execute-api.ap-south-1.amazonaws.com/api/`. DB_URL and JWT_SECRET are unchanged from the previous deploy (hash-checked). Verified `/api/health` returns 200, `/api/events/minimal` returns 200 with 203 events (DB connected), and `/api/settings/data-cutoff` without a token returns 401. Added deploy docs and §12 items 14–15. |
| 2026-11-17 | Claude (agent) | `AGENTS.md`, `CLAUDE.md` | Created AGENTS.md from a full read of routes, controllers, models, utils, auth and deploy config. Added CLAUDE.md, which imports this file so Claude Code loads it automatically. At this point the working tree had uncommitted changes adding MarketingTarget, PersonalCalendar, Settings (data cutoff), SpreadsheetWorkbook and RequestGroupBy, plus `utils/dataCutoff.js`. No code changes. |
