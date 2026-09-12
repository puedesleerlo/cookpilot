# Running Kitchen Compiler

## What works today, honestly

| | State |
|---|---|
| Web app | **Works.** Compiles the example session and draws it. No account, no key. |
| Scheduler | **Works.** Task graph, critical path, resource-constrained scheduling, washes, the degradation ladder. |
| Plan builder | **Works.** Compiles each candidate rather than estimating it. |
| Timeline | **Works.** Gantt, run sheet, task detail, tomorrow's list, live recompilation. |
| API | Runs. Health, readiness, server clock, device tokens, OpenAPI. |
| Database | Runs. Schema, migrations, seed (5 packs, 22 recipes). |
| Gemini via Vertex | Works. Verified live against `gemini-3.5-flash-lite`. |
| Recipe extraction | Works. 100% JSON-LD hit rate measured on 27 real pages. |
| Your own fridge | **Works.** Search the lexicon, say what has to go today, correct the kitchen, compile. |
| Cooking mode | **Not built.** The run sheet is what you follow for now. |
| Voice intake | **Not built.** The structured form is the way in, by design — the free-text parser was deleted. |

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
pnpm check                 # secret scan, lint, typecheck, 436 tests
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
# One-time: service accounts, secret containers, IAM bindings, the Vertex role.
# Generated from apps/api/src/config/secrets.ts, so it cannot drift from the code.
PROJECT_ID=hackaton-508407 ./infra/iam.sh

# Put a value in. Repeat per secret; each add creates a NEW VERSION.
printf '%s' "$BRAVE_API_KEY"      | gcloud secrets versions add BRAVE_API_KEY      --data-file=- --project=hackaton-508407
printf '%s' "$ELEVENLABS_API_KEY" | gcloud secrets versions add ELEVENLABS_API_KEY --data-file=- --project=hackaton-508407
printf '%s' "$DATABASE_URL"       | gcloud secrets versions add DATABASE_URL       --data-file=- --project=hackaton-508407
printf '%s' "$REDIS_URL"          | gcloud secrets versions add REDIS_URL          --data-file=- --project=hackaton-508407
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add JWT_SECRET      --data-file=- --project=hackaton-508407

# Find the version number you just created.
gcloud secrets versions list JWT_SECRET --project=hackaton-508407 --limit=1

# Mount by PINNED VERSION, never :latest.
gcloud run deploy api \
  --project=hackaton-508407 --region=us-central1 \
  --service-account=kc-api@hackaton-508407.iam.gserviceaccount.com \
  --min-instances=1 --session-affinity --timeout=3600 \
  --set-env-vars=GOOGLE_CLOUD_PROJECT=hackaton-508407,VERTEX_LOCATION=global \
  --update-secrets=DATABASE_URL=DATABASE_URL:1,REDIS_URL=REDIS_URL:1,JWT_SECRET=JWT_SECRET:1,BRAVE_API_KEY=BRAVE_API_KEY:1,ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:1 \
  --source=.
```

**Why pinned versions and not `:latest`.** With `:latest`, adding a secret version silently
changes what a running service uses — rotation becomes something that happens *to* you at
2am rather than a deploy you can see, correlate and roll back. `loader.ts` refuses a
reference ending in `/versions/latest` and says why.

**Why the API is not deployed yet.** It would serve health checks and device tokens and
nothing else. Deploying it before the scheduler exists is infrastructure theatre.

## Secrets: the rules that are enforced, not just written down

- `.env` is gitignored. `scripts/scan-secrets.mjs` fails the build if one becomes tracked,
  and scans every file git could take. CI runs it on every push.
- `scripts/scan-bundle.mjs` fails the build if a secret name or key shape reaches the
  client bundle. `pnpm deploy:web` runs it and refuses to deploy on a finding.
- Logs redact by value **and** by shape, at the logger and at the log-method hook — so a
  key interpolated into a debug message is redacted too.
- Each service reads only what it declares. The worker cannot read `ELEVENLABS_API_KEY`,
  and `infra/iam.sh` enforces that in IAM, not just in code.
- One module per provider, so a leaked key has exactly one place to be rotated.

## Rotating a key

```bash
# 1. Regenerate in the provider's dashboard.
# 2. Add a new version:
printf '%s' "$NEW_KEY" | gcloud secrets versions add BRAVE_API_KEY --data-file=- --project=hackaton-508407
# 3. Redeploy pinned to it (this is the deliberate step):
gcloud run services update api --project=hackaton-508407 --region=us-central1 \
  --update-secrets=BRAVE_API_KEY=BRAVE_API_KEY:2
# 4. Disable the old version and confirm it is dead:
gcloud secrets versions disable 1 --secret=BRAVE_API_KEY --project=hackaton-508407
```

Locally, change the value in `.env` and restart. Nothing else needs to change.
