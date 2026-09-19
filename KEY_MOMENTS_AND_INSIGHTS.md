# SafeRoutePlanner — Key Moments & Insights

Running doc of the "aha" moments, real bugs, and judgment calls worth
remembering — for interview stories, blog posts, and so we don't
relearn the same lesson twice. Updated continuously as we build.

Not chronological targets (see BUILD_LOG.md for that) — this is the
"what actually mattered" version.

---

## Mumbai Phase

### 1. The `unary_union` bug — silent signal collapse
**What happened:** Police proximity was computed by merging all police
station points into one combined geometry (`unary_union`) and measuring
distance to that blob. Looked correct, ran without error, but collapsed
the actual distance gradient — every road segment ended up roughly
equidistant from "the blob" instead of from its *nearest* station.
**Fix:** Per-segment nearest-neighbour query using a spatial index
(`police.sindex.nearest()`), not a merged union.
**Why it matters for interviews:** No error was thrown. The bug only
showed up as suspiciously low variance in the feature — a "quiet"
bug that only surfaces if you actually check `std()` on your features
instead of just assuming the pipeline worked because it ran.

### 2. Double normalization — routes became identical
**What happened:** Features were min-max normalized, then squared,
then renormalized again. This compressed variance so much that the
"safest" and "shortest" routes came out literally identical — the
safety scoring had no discriminating power left.
**Fix:** Single normalization pass. Activity density specifically
switched to `log1p` before min-max, instead of raw counts, to reduce
the influence of outlier high-density segments without over-compressing
everything else.
**Why it matters:** This is the difference between a pipeline that
*runs* and a pipeline that *works*. Both bugs (#1 and #2) produced no
errors — they just quietly made the whole safety-scoring exercise
pointless. The lesson: always sanity-check feature variance (std > 0.05
threshold) before trusting a score.

### 3. Framing decision — RTM instead of supervised ML
**Decision:** Used Risk Terrain Modelling (hand-picked weights from
criminology literature) instead of training a model, because no
street-level crime data existed for Indian cities.
**Why it matters:** This was later identified as the single biggest
weakness in the Mumbai project — defensible at the time, but an
obvious target for a sharp interviewer ("why didn't you learn the
weights?"). Directly motivated the entire Delhi rebuild.

### 4. Single-route evaluation — the "you just walked to college" problem
**What happened:** The whole safety-improvement claim (+8.8%) rested
on one route: VJTI → CST. Real, but anecdotal — not evidence of a
general pattern.
**Why it matters:** A single data point can't be statistically
validated and invites the obvious "so what, that's just one route"
pushback. Directly motivated Delhi's Step 4 (20-30 OD pairs, reported
as a distribution).

---

## Delhi Rebuild Phase

### 5. Delhi's district boundaries kept changing under us
**What happened:** Delhi's district scheme changed three times in
recent memory — 9 districts (pre-2012) → 11 (post-2012, when Shahdara
and South East were carved out) → 13 (Dec 2025 reorg). Our crime data
(NCRB) uses the 11-district scheme. OSM's admin-level district
directory only listed some of the 13 new districts. This created a
real risk of silently joining crime data to the wrong-generation
boundaries.
**Fix:** Didn't trust the admin directory listing. Tested direct
geocoding of each of the 11 district names individually
(`ox.geocode_to_gdf()`) — all 11 resolved successfully, meaning OSM
still has usable boundary polygons for the historical district names
even though they're not in the "current" official directory.
**Why it matters:** Administrative boundaries are not static ground
truth — always verify your data's vintage matches your boundary
source's vintage before joining them. This is a genuinely good
interview story about data engineering rigor.

### 6. The "New Delhi" name-stripping bug
**What happened:** A cleanup regex did `.replace(" Delhi", "")` to
shorten "East Delhi" → "East", etc. Worked fine for 10 of 11
districts. Silently broke "New Delhi" → "New", because the string
"Delhi" appears twice in "New Delhi, India" in an unexpected way,
and blind substring replacement doesn't know that "New Delhi" is
itself the district name, not "New" + "Delhi" as a suffix to strip.
**Fix:** Explicit post-hoc patch mapping "New" back to "New Delhi"
before the join, plus an automated sanity check comparing the set of
district names in both files before trusting any downstream numbers.
**Why it matters:** String-based cleanup logic that works for the
common case can silently mismangle the one input that doesn't follow
the pattern. Always verify categorical joins by diffing the actual
sets of keys on both sides — don't assume a name-cleanup regex is safe
just because most rows look right.

### 7. Length-weighted boundary blending (not just "pick one district")
**Decision:** For road segments straddling two districts, instead of
arbitrarily keeping whichever district matched first, we clip the
segment's geometry against each touching district polygon, measure
the real length (in UTM, metres) of each piece, and take a
length-weighted average of the two districts' risk scores.
**Why it matters:** More geometrically honest than a coin-flip
assignment, and a good example of choosing the more rigorous approach
when the "quick and dirty" one was sitting right there. Directly
suggested by revisiting an earlier assumption rather than accepting
the first working version.

### 8. bbox fetch vs. place-polygon fetch — speed tradeoff
**What happened:** `ox.graph_from_place("Delhi, India")` hung for
10+ minutes because it clips the fetched road network to Delhi's
exact (complex) multipolygon boundary — expensive computation.
**Fix:** Switched to `ox.graph_from_bbox()` using the bounding
rectangle of the 11 district polygons instead — much faster, at the
cost of pulling in some extra roads outside real Delhi (Haryana/UP
slivers near the rectangle's corners).
**Why it matters:** The "impure" fetch (bbox) plus a correct filter
downstream (the district join) is often better engineering than the
"pure" fetch (place-polygon) that's needlessly slow. Correctness
doesn't have to live in the fetch step if it's guaranteed later in
the pipeline.

### 9. Validating a hypothesis instead of assuming — the 193,826 unmatched segments
**What happened:** After the spatial join, 193,826 of 695,070
segments (28%) didn't match any district. Two possible explanations:
(a) genuinely outside Delhi (bbox corner spillover — harmless), or
(b) real Delhi roads falling into gaps between independently-geocoded
district polygons (a real bug, since each of the 11 polygons was
geocoded separately rather than cut from one master shape).
**What we did:** Built a specific diagnostic — checked whether the
unmatched segments intersect the *combined union* of all 11 districts
at all. Result: 0 out of 193,826 did. Clean negative — confirmed
explanation (a), not (b).
**Why it matters:** This is the best interview story in the project
so far. Instead of assuming the higher-than-expected drop rate was
"probably fine," we formed a specific, falsifiable hypothesis and
wrote code to test it before moving forward. The result was reassuring,
but the process would have caught a real bug if one existed. This is
literally what "data validation" means in a DA/DS role, not just a
buzzword on a resume.

## Registration-circle double-counting bug (Step 1 data pull)

**What happened:** After fixing the initial pipeline and computing district-level
crime rates, New Delhi district scored suspiciously low (rank 4 of 11) despite
being one of the most visibly high-crime, high-footfall districts in the city.

**Root cause:** NCRB reports crime-against-women data at (district, year,
registration_circle) granularity, not just (district, year). Districts like
New Delhi and North West have multiple police reporting units per year — some
genuine geographic sub-divisions (Outer, Rohini, North-West), others functional/
specialized units that overlap the whole district (Railway, Airport, Economic
Offences Wing, Crime Branch, Metro, Special Cell). My original groupby
aggregated straight to district_name, so n_years="count" was actually counting
(circle x year) rows, and avg_annual_caw="mean" was dividing each year's true
total across however many circles filed that year — silently deflating the
annual average specifically for high-circle-count districts.

**Fix:** Sum street-relevant crime counts across registration_circles within
each (district, year) first, THEN average across years. n_years now genuinely
means years for every district.

**Impact:** New Delhi's normalized risk score went from 0.41 (rank 4) to 1.00
(rank 1) — the single largest reordering in the dataset. North West also rose
substantially (rank 11 -> rank 6).

**Why this matters for the project:** This wasn't a code bug that crashed
anything — the original script ran fine and produced a plausible-looking
table. It only surfaced because I checked n_years for a sanity signal (why
would a district have 40 "years" of data?) before trusting the aggregation.
Good interview story about not treating a clean-looking output as a correct
one, and about NCRB/government data having non-obvious reporting structure
that doesn't match the surface schema.
---

## Open questions / things to revisit later

- South East Delhi's 2011 population figure in
  `delhi_population_reference.py` is a rough placeholder — should be
  tightened with an exact census figure before this goes in the final
  report.
- The `.sindex.nearest()` per-segment loop pattern (carried over from
  Mumbai) may need vectorizing for Delhi's ~500k segment scale if
  Step 3 feature computation gets too slow.
- Decision needed: should Step 3's model be trained on all 501,232
  segments, or should we sample down for faster iteration during
  development and use the full set only for the final run?
