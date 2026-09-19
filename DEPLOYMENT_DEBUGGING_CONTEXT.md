# SafeRoutePlanner — Deployment Debugging Context

## Purpose

This document records the deployment issues encountered while deploying SafeRoutePlanner to Vercel, the actual root causes, fixes applied, and the deployment constraints discovered.

The goal is to:
1. Preserve the debugging history for future development.
2. Help identify recurring architectural/deployment patterns.
3. Prevent fixing one deployment error only to immediately encounter another related error.
4. Provide accurate context for explaining the deployment process in technical interviews.

---

# Project Deployment Architecture

SafeRoutePlanner consists of:

- Frontend: React + Vite + Leaflet
- Backend: Python Flask
- Routing: NetworkX / OSMnx
- Bundled benchmark graph: `backend/data/mumbai_benchmark.pickle`
- Backend deployed through Vercel Flask service
- Frontend deployed through Vercel Vite service
- Both services are exposed through the same Vercel project/domain.

Vercel routing:

```text
/api/:path*  → backend (Flask)
/(.*)        → frontend (Vite)
```

The backend service runs with `backend/` effectively acting as the function root. Therefore, Python imports and filesystem assumptions must work both:

1. Locally from the repository root.
2. Inside the Vercel backend function environment.

---

# Deployment Issue 1 — Vercel initially failed to recognize the application architecture

## Symptom

The initial Vercel setup did not correctly handle the React frontend and Flask backend as the intended multi-service application.

## Resolution

Configured Vercel Services with:

* Frontend → Vite
* Backend → Flask
* Root `vercel.json` containing service definitions and rewrites.

Current routing concept:

```json
{
  "services": {
    "frontend": {
      "root": "frontend/",
      "framework": "vite"
    },
    "backend": {
      "root": "backend/",
      "entrypoint": "app:app"
    }
  }
}
```

with:

```text
/api/:path* → backend
/(.*)       → frontend
```

## Lesson

For a monorepo-style application containing frontend and backend services, deployment configuration must explicitly define how requests are routed between services.

---

# Deployment Issue 2 — Flask backend could not import `backend.engine`

## Symptom

Vercel returned:

```text
ModuleNotFoundError: No module named 'backend'
```

The original `backend/app.py` contained imports such as:

```python
from backend.engine.cache import ...
from backend.engine.routing import ...
```

## Root Cause

Locally, the application is commonly executed from the repository root:

```text
SafeRoutePlanner/
    backend/
        app.py
        engine/
```

so:

```python
from backend.engine...
```

works.

However, Vercel's Flask function environment effectively executes `app.py` with `backend/` as the function root:

```text
/var/task/
    app.py
    engine/
```

Therefore `backend` is no longer an importable top-level package.

## Fix

`backend/app.py` was changed to support both environments:

```python
try:
    from backend.engine.cache import (
        get_or_build_graph,
        get_bundled_benchmark_graph,
        _memory_cache,
    )
    from backend.engine.routing import compute_dual_routes
except ModuleNotFoundError as e:
    if e.name != "backend":
        raise

    from engine.cache import (
        get_or_build_graph,
        get_bundled_benchmark_graph,
        _memory_cache,
    )
    from engine.routing import compute_dual_routes
```

## Validation

The fix was tested locally with:

```bash
python -m backend.app
python -m pytest backend/tests/ -v
```

Both worked.

## Lesson

Backend imports must be compatible with the actual deployment execution root.

A deployment audit should search the entire backend for:

```text
backend.*
```

rather than fixing imports only when Vercel reports them.

---

# Deployment Issue 3 — Vercel filesystem is read-only

## Symptom

After fixing the initial imports, Vercel produced:

```text
OSError: [Errno 30] Read-only file system:
'/var/task/data/cache'
```

The failure occurred during:

```python
os.makedirs(CACHE_DIR, exist_ok=True)
```

inside:

```text
backend/engine/cache.py
```

## Root Cause

The application attempted to create/write runtime cache files inside the deployed application filesystem.

Vercel's deployed function filesystem is read-only.

Therefore paths such as:

```text
/var/task/data/cache
```

cannot be used for runtime writes.

## Fix

Runtime cache storage was changed to the temporary writable filesystem using Python's temporary directory:

```python
import tempfile

CACHE_DIR = os.path.join(
    tempfile.gettempdir(),
    "saferoute_cache"
)

os.makedirs(CACHE_DIR, exist_ok=True)
```

On Vercel this resolves to a writable temporary location such as `/tmp`.

## Important distinction

The bundled benchmark graph:

```text
backend/data/mumbai_benchmark.pickle
```

is a static application asset and is read-only.

That is fine.

The problem was specifically runtime writes to the deployed filesystem.

## Lesson

All deployment-time filesystem operations must be audited:

### Safe

```text
Read static bundled files
Use /tmp for temporary runtime files
```

### Unsafe

```text
Write to /var/task
Create runtime cache inside deployed source tree
Persist application state directly into repository files
```

---

# Deployment Issue 4 — Secondary `backend` import remained in routing.py

## Symptom

After the cache filesystem issue was fixed and deployed, Vercel progressed further into the application and produced:

```text
File "/var/task/engine/routing.py", line 12, in <module>
from backend.engine.scoring import get_safety_rating

ModuleNotFoundError: No module named 'backend'
```

## Root Cause

The first import fix only handled imports in:

```text
backend/app.py
```

but another backend module still contained:

```python
from backend.engine.scoring import get_safety_rating
```

When Vercel imported:

```text
engine.routing
```

that module then attempted to import:

```text
backend.engine.scoring
```

which again failed because `backend` is not available as the top-level package in the Vercel function environment.

## Resolution

1. Updated [`backend/engine/routing.py`](file:///d:/Projects/SafeRoutePlanner/backend/engine/routing.py) to use dual fallback:
   ```python
   try:
       from backend.engine.scoring import get_safety_rating
   except ModuleNotFoundError:
       from engine.scoring import get_safety_rating
   ```
2. Audited and updated [`backend/engine/cache.py`](file:///d:/Projects/SafeRoutePlanner/backend/engine/cache.py) line 111:
   ```python
   try:
       from backend.engine.scoring import score_road_network
   except ModuleNotFoundError:
       from engine.scoring import score_road_network
   ```
3. Configured OSMnx cache folder (`ox.settings.cache_folder`) to point to writable temporary storage (`tempfile.gettempdir() / "osmnx_cache"`), preventing runtime read-only filesystem errors during dynamic geocoding or Overpass fetches.
4. Added `backend_dir` to `sys.path` in [`backend/app.py`](file:///d:/Projects/SafeRoutePlanner/backend/app.py) and added `/` and `/health` route aliases.
5. Deployed in commit `c9afb03`.

---

# Deployment Issue 5 — Missing production dependencies for graph spatial search

## Symptom

After startup and import issues were resolved, `/api/health` returned `200 OK`. However, `/api/route` failed with:

```text
ValueError: scikit-learn must be installed as an optional dependency to search an unprojected graph
```

## Root Cause

`ox.distance.nearest_nodes(G, X, Y)` performs nearest node lookup for origin and destination coordinates:
- If graph `G` is unprojected (geographic coordinates in `EPSG:4326`, as is `mumbai_benchmark.pickle`), OSMnx uses `sklearn.neighbors.BallTree` with haversine distance metric.
- If graph `G` is projected, OSMnx uses `scipy.spatial.cKDTree` with euclidean distance metric.

In the local Anaconda environment, `scikit-learn` and `scipy` were already installed globally, masking this dependency during local execution. On Vercel, serverless containers install only dependencies explicitly listed in `backend/requirements.txt`.

## Resolution

Audited all backend runtime imports and OSMnx optional dependencies:
- Added `scikit-learn>=1.3.0` to `backend/requirements.txt`.
- Added `scipy>=1.11.0` to `backend/requirements.txt` to cover both projected and unprojected spatial indexing.
- Verified that visualization/raster optional dependencies (`matplotlib`, `folium`, `rasterio`, `gdal`) are not called by backend endpoints and do not need to be installed.

---

# Deployment History / Git Context

There was also a Git repository synchronization issue during deployment.

The project was originally associated with:

```text
pritam195/SafeRoutePlanner
```

and later deployed from the user's fork:

```text
Padmin-12/SafeRoutePlanner
```

The local Git remote initially still pointed to:

```text
https://github.com/pritam195/SafeRoutePlanner.git
```

while Vercel was connected to:

```text
Padmin-12/SafeRoutePlanner
```

This caused a situation where a deployment fix existed locally / on the original repository but was not appearing on the repository Vercel was actually monitoring.

The remote was corrected to:

```text
https://github.com/Padmin-12/SafeRoutePlanner.git
```

The fork also underwent a forced history update, requiring the local changes to be rebased onto the fork's current `main`.

The cache fix eventually appeared on the fork as:

```text
2e47a41 Use writable temp directory for Vercel cache
```

and was manually deployed to Vercel.

## Lesson

When debugging CI/CD:

Always verify:

```text
Local branch
      ↓
Git remote
      ↓
GitHub repository
      ↓
GitHub branch
      ↓
Vercel connected repository
      ↓
Vercel deployed commit
```

Do not assume these all point to the same repository/commit.

---

# Current Deployment State

The latest deployment is:

```text
Commit: c9afb03
Message: Fix backend imports and OSMnx runtime cache for Vercel deployment
Status: Pushed to main (triggering Vercel build)
Environment: Production
```

Vercel Services Graph confirms:

```text
/api/:path* → backend (Flask)
/(.*)       → frontend (Vite)
```

Therefore frontend/backend routing configuration is recognized by Vercel.

The backend import failures and latent read-only filesystem writes have been collectively resolved:
- `backend/engine/routing.py`: Dual-import fallback for `get_safety_rating`
- `backend/engine/cache.py`: Dual-import fallback for `score_road_network` and OSMnx cache directory redirection to temp storage
- `backend/app.py`: `sys.path` backend directory insertion and `/` / `/health` aliases

---

# Required Pre-Deployment Audit

Before making another deployment, perform a complete backend deployment audit.

## 1. Import audit

Search all Python files for:

```text
backend.
```

Identify every absolute import that assumes the repository root is the Python import root.

---

## 2. Filesystem audit

Search for:

```text
os.makedirs
mkdir
open(
write
dump
save
CACHE_DIR
cache
```

Determine whether each operation:

* reads a static file,
* writes persistent application data,
* writes temporary data,
* creates directories.

All runtime writes must use a writable location such as `/tmp` on Vercel.

---

## 3. Path audit

Search for:

```text
__file__
Path(
data/
data\
os.path
```

Verify that static assets are located using paths relative to the source/package location rather than depending on the current working directory.

---

## 4. Dependency audit

Verify that every Python package imported by production backend code exists in the Vercel dependency configuration.

Do not assume packages available in the local Anaconda environment are available in Vercel.

---

## 5. Environment-variable audit

Search for:

```text
os.getenv
os.environ
```

Identify any production-required environment variables.

Make sure no local-only configuration is required at runtime.

---

## 6. Startup audit

The following imports must succeed during cold start:

```text
app.py
    ↓
engine.cache
engine.routing
engine.scoring
all other imported production modules
```

A local test from the repository root alone is not sufficient.

---

# Interview-Relevant Debugging Pattern

The deployment failures followed a dependency-chain pattern:

```text
Vercel starts Flask
       ↓
app.py import fails
       ↓
Fix app.py import
       ↓
cache.py initializes
       ↓
filesystem write fails
       ↓
Fix runtime cache location
       ↓
routing.py imports
       ↓
secondary backend import fails
```

This demonstrates an important deployment debugging principle:

> Fixing the first startup error does not prove that the deployment is production-compatible. Each successful initialization stage can expose the next incompatible assumption.

The correct response is therefore to audit the complete dependency chain after identifying the first environment mismatch, rather than repeatedly deploying one error at a time.

---

# Current Action

Do not deploy again until the complete backend audit has been performed.

The next audit should cover:

1. Python imports
2. Filesystem writes
3. Static file paths
4. Dependencies
5. Environment variables
6. Startup/import chain
7. API routing

Then make all required changes together, run the full local test suite, build the frontend, commit once, push once, and deploy again.
