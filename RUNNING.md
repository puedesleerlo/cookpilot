# Running Kitchen Compiler

## What works today, honestly

| | State |
|---|---|
| Web app | **Works.** Compiles the example session and draws it. No account, no key. |
| Scheduler | **Works.** Task graph, critical path, resource-constrained scheduling, washes, the degradation ladder. |
| Plan builder | **Works.** Compiles each candidate rather than estimating it. |
| Timeline | **Works.** Gantt, run sheet, task detail, tomorrow's list, live recompilation. |
| API | **Deployed.** Cloud Run, on Postgres. Health, readiness, server clock, devices, shared sessions, the pipeline, OpenAPI. |
| Database | **Runs.** Postgres in Docker locally; the organisation's Azure Postgres (`kitchen_compiler`) behind the deployed API. Schema, migrations, seed (5 packs, 22 recipes). |
| Gemini via Vertex | Works. Verified live against `gemini-3.5-flash-lite`. |
| Recipe extraction | Works. 100% JSON-LD hit rate measured on 27 real pages. |
| The whole chain | **Works.** Two spoken answers → real recipes off the web → scheduled. See below. |
| Voice intake | **Works.** ElevenLabs Scribe, server-side. The key never reaches the browser. |
| Recipe search | **Works.** Gemini writes the queries, Brave answers, robots is honoured. |
| Step extraction | **Works.** Gemini reads each page into steps with timings and scales them. |
| Your own fridge | **Works.** Search the lexicon, say what has to go today, correct the kitchen, compile. |
| Cooking mode | **Works, on every phone.** Scan the host's code, pick your cook, follow your own steps with timers that count down together. On the deployed site and locally; needs the API, with or without a database. |


### The chain, end to end

```
  two spoken answers
        │  ElevenLabs Scribe (server-side; the key never reaches the browser)
        ▼
  transcripts
        │  L1  Gemini → structured intake, constrained to the domain schema
        ▼
  what they want · what they have · how many are cooking
        │  L2  Gemini → search queries worth running
        ▼
  queries ──► Brave ──► robots-respecting fetch ──► readable text
        │  L3  Gemini → steps with durations, equipment, dependencies,
        │              scaled to seven days of meals for the people cooking
        ▼
  RecipeIR × N ──► corrections screen ──► scheduler ──► timeline
```

Each query contributes one recipe, in parallel, and a dish already found is rejected by
name — five queries about chicken and bok choy otherwise return the same dinner five times.
A live run takes about a hundred seconds and costs six model calls.

Verify it against the real providers:

```bash
LIVE_PIPELINE=1 npx vitest run apps/api/src/pipeline/pipeline.live
cat /tmp/pipeline-live.txt        # every step it read, and everything it dropped
```

### The demo, in one link

<https://hackaton-508407.web.app/#demo> — or click **Try the example session** on the
landing page. It compiles on the device: the §10 pantry, a 60-minute budget, two cooks, two
burners and two pans, into three dishes, a sauce and two drinks in 59 minutes.

<https://hackaton-508407.web.app/#fridge> goes straight to your own fridge instead. Type an
ingredient, pick it from the list, tap a chip to say it has to go today. Six or seven things
is enough. The kitchen and the crew are filled in as assumptions and marked as such — the
blender is the one thing deliberately left off, because plenty of kitchens do not have one
and it is what stands between you and a blended drink.

The controls above the chart recompile live. Some things worth trying:

| Change | What happens |
|---|---|
| 60m → 30m | 6 dishes become 3, finished in 28 minutes |
| 60m → 90m | a seventh dish appears |
| 2 cooks → 1 | 6 dishes become 3 — the skilled cook is the bottleneck, not the clock |
| 2 cooks → 3 | the same 6 dishes, 5 minutes sooner |
| Drinks → no | the cold brew and the agua fresca go, and nothing else changes |

### Cooking together, on phones

```bash
docker compose up -d
pnpm --filter @kitchen/api migrate       # applies 0001_add-shared-session
pnpm --filter @kitchen/api dev           # API on :8080, on every interface
pnpm dev                                 # web on :5173, on every interface — note the Network URL
```

Open the **Network** URL the dev server prints (not `localhost`; a phone cannot follow that)
on the laptop, compile a session, and press **Cook this together**. Each phone scans the QR
code, or opens the same URL and types the six letters under it. Pick which cook you are,
say what to call you, and when everyone is in the host presses **Start cooking**.

Each phone then shows its owner one step, a countdown to when the compiler expected it done,
and the next step underneath. A screen that claimed no cook — the laptop on the counter —
shows everyone's slide at once. Whatever is looking after itself on the stove is listed with
its own timer on every device. Tapping **Done** writes to the session log and shows on the
other phones within two seconds.

What travels is the inputs and the log, never the schedule: every phone compiles the same
timeline for itself and checks its hash against the host's. Timers count from the server's
clock, so two phones agree to within a round trip. The API is required for this and for
nothing else — the single-device demo still runs with it blocked.

The same flow runs on the deployed site: <https://hackaton-508407.web.app/#demo>, **Cook
this together**, and the phones join through the Cloud Run API.

**With or without a database.** Sessions, devices and the log live in Postgres when
`DATABASE_URL` is set. Without it the API keeps them in memory on that instance: everything
works, the log has one order, and every session ends when the process does — so run one
instance in that mode. The boot log says which of the two it is. The deployed API has a
database: a dedicated `kitchen_compiler` on the organisation's Azure Postgres server,
migrated, mounted as `DATABASE_URL:1`, and reported by `/readyz`. Nothing of ours touches
the other databases on that server; `DROP DATABASE kitchen_compiler` is the whole clean-up.

## Run it locally

```bash
# 1. Infrastructure
docker compose up -d                     # Postgres (:55432) + Redis (:56379)

# 2. Install and set up
pnpm install
cp .env.example .env                     # then fill in; see "Secrets" below
pnpm --filter @kitchen/api migrate       # create the schema
pnpm --filter @kitchen/api seed          # load the 5 seed packs

# 3. Run
pnpm --filter @kitchen/api dev           # API on :8080
pnpm dev                                 # web on :5173
```

Check it:

```bash
curl localhost:8080/healthz              # liveness, no dependencies
curl localhost:8080/readyz               # readiness, checks Postgres
curl localhost:8080/v1/time              # the clock client timers anchor to
curl localhost:8080/openapi.json         # generated from the Zod contracts
curl localhost:8080/internal/metrics     # per-stage LLM spend

# issue a device token and use it
TOKEN=$(curl -s -XPOST localhost:8080/v1/devices -H 'content-type: application/json' \
  -d '{}' | jq -r .token)
curl localhost:8080/v1/devices/me -H "authorization: Bearer $TOKEN"
```

## Verify everything

```bash
pnpm check                 # secret scan, lint, typecheck, the whole suite
pnpm test                  # tests alone (needs Postgres for the integration ones)
LIVE_VERTEX=1 pnpm test apps/api/src/llm/vertex.live.test.ts   # real Gemini call, costs money
node scripts/scan-bundle.mjs apps/web/dist                     # no secrets in the client
```

## Deploy

### Web — works now

```bash
pnpm deploy:web            # builds, scans the bundle, deploys via the Hosting REST API
pnpm deploy:web:dry        # see what would ship, change nothing
```

Uses your Application Default Credentials. No Firebase CLI session needed, so it also works
in CI. Live at https://hackaton-508407.web.app.

### Secrets — for the API on Cloud Run

There is **no model API key**. Vertex authenticates through the service account, so the
whole inventory is two provider keys plus infrastructure.

```bash
# One-time, per secret: a container, and read access for the account the service runs as.
# The deployed service runs as the project's DEFAULT COMPUTE account; that is what the four
# mounted secrets are bound to today. infra/iam.sh (generated from
# apps/api/src/config/secrets.ts) is the stricter setup — one account per service, each
# reading only what it declares — and has not been applied. Apply it and redeploy with
# --service-account=kc-api@... when that hardening is wanted.
gcloud secrets create DATABASE_URL --project=hackaton-508407 --replication-policy=automatic
gcloud secrets add-iam-policy-binding DATABASE_URL --project=hackaton-508407 \
  --member=serviceAccount:667576706709-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Put a value in. Repeat per secret; each add creates a NEW VERSION.
# DATABASE_URL is the Azure kitchen_compiler URL, and it must carry ?sslmode=require.
# REDIS_URL is not mounted: nothing deployed uses a queue, and the API says so at boot.
printf '%s' "$BRAVE_API_KEY"      | gcloud secrets versions add BRAVE_API_KEY      --data-file=- --project=hackaton-508407
printf '%s' "$ELEVENLABS_API_KEY" | gcloud secrets versions add ELEVENLABS_API_KEY --data-file=- --project=hackaton-508407
printf '%s' "$DATABASE_URL"       | gcloud secrets versions add DATABASE_URL       --data-file=- --project=hackaton-508407
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add JWT_SECRET      --data-file=- --project=hackaton-508407

# Find the version number you just created.
gcloud secrets versions list JWT_SECRET --project=hackaton-508407 --limit=1

# Mount by PINNED VERSION, never :latest. This is the command that is actually deployed;
# the service is `kitchen-api` and it runs as the project's default compute service account.
# `--env-vars-file` rather than `--set-env-vars` because CORS_ORIGINS contains a comma.
cat > /tmp/run-env.yaml <<'YAML'
NODE_ENV: production
GOOGLE_CLOUD_PROJECT: hackaton-508407
VERTEX_LOCATION: global
CORS_ORIGINS: https://hackaton-508407.web.app,https://hackaton-508407.firebaseapp.com
YAML

gcloud run deploy kitchen-api \
  --project=hackaton-508407 --region=us-central1 --source=. --clear-base-image \
  --allow-unauthenticated --port=8080 --memory=1Gi --cpu=1 --timeout=300 \
  --max-instances=4 --concurrency=8 \
  --env-vars-file=/tmp/run-env.yaml \
  --set-secrets=BRAVE_API_KEY=BRAVE_API_KEY:1,ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:1,JWT_SECRET=JWT_SECRET:1,DATABASE_URL=DATABASE_URL:1
```

Live at <https://kitchen-api-667576706709.us-central1.run.app>. Two things about the build
that cost four failed revisions and are worth not rediscovering:

- The `Dockerfile` is at the **repository root**, because the build context is the whole
  monorepo. Run `gcloud run deploy --source=.` from the root, not from `apps/api`, or
  Cloud Build finds no Dockerfile and silently falls back to Buildpacks.
- No BuildKit cache mounts. Cloud Build's docker builder does not enable BuildKit, and
  `--mount=type=cache` fails the build outright.
- The container runs `tsx`, not `node --experimental-strip-types`. Type stripping keeps
  Node's ESM resolver, which will not resolve this codebase's extensionless imports.

`/healthz` is answered by Google's frontend rather than the container on `*.run.app`; use
`/readyz`, which reports dependencies and the scheduler version.

**Why pinned versions and not `:latest`.** With `:latest`, adding a secret version silently
changes what a running service uses — rotation becomes something that happens *to* you at
2am rather than a deploy you can see, correlate and roll back. `loader.ts` refuses a
reference ending in `/versions/latest` and says why.

**Storage is degradable.** `requireSecrets` takes a map of secret → what-you-lose, so an
API serving only the cooking pipeline starts without Postgres and Redis and names what is
off. A database that is *configured and broken* still fails readiness, which is the
distinction that matters.

## Secrets: the rules that are enforced, not just written down

- `.env` is gitignored. `scripts/scan-secrets.mjs` fails the build if one becomes tracked,
  and scans every file git could take. CI runs it on every push.
- `scripts/scan-bundle.mjs` fails the build if a secret name or key shape reaches the
  client bundle. `pnpm deploy:web` runs it and refuses to deploy on a finding.
- Logs redact by value **and** by shape, at the logger and at the log-method hook — so a
  key interpolated into a debug message is redacted too.
- Each service reads only what it declares — in code, through the loader, today. In IAM it
  is enforced only once `infra/iam.sh` is applied; the deployed service runs as the default
  compute account, which can read all four mounted secrets.
- One module per provider, so a leaked key has exactly one place to be rotated.

## Rotating a key

```bash
# 1. Regenerate in the provider's dashboard.
# 2. Add a new version:
printf '%s' "$NEW_KEY" | gcloud secrets versions add BRAVE_API_KEY --data-file=- --project=hackaton-508407
# 3. Redeploy pinned to it (this is the deliberate step):
gcloud run services update kitchen-api --project=hackaton-508407 --region=us-central1 \
  --update-secrets=BRAVE_API_KEY=BRAVE_API_KEY:2
# 4. Disable the old version and confirm it is dead:
gcloud secrets versions disable 1 --secret=BRAVE_API_KEY --project=hackaton-508407
```

Locally, change the value in `.env` and restart. Nothing else needs to change.
