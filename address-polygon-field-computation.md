# Address & Polygon Field Computation (at Source + Khoj)

This document defines **how address and polygon-related fields will be computed** after the new logic is implemented. Computation happens **at source** (Casa and Venus); only Khoj-specific fields (`seo_address`, `display_neighbourhood`) have custom logic in Khoj.

**Constraints:**
- **No change to any data structure** in any API. Response shapes and field names remain unchanged.
- **Sources of data:**  
  - **(a)** `reverse_geocode` — already called.  
  - **(b)** `new_trail` — from a new API to get the new trail, or from a **modified get-ancestor API** in Regions if the structure is the same.  
  - **(c)** **DB** — already called.

**Related docs:** `casa.md`, `venus.md`, `khoj.md` (current behaviour and API shapes).

---

## 1. Data sources (summary)

| Source            | When used | Notes |
|-------------------|-----------|--------|
| **reverse_geocode** | Already called in Casa/Venus | Returns polygon hierarchy by lat/lng. Output used as **ph_v1**. |
| **new_trail**       | New/updated Regions API      | Ancestor trail for validated primary polygon. Empty for states where we are not yet live. |
| **DB**              | Already called               | Flat/project entity: e.g. `region_locality_uuid`, `region_entity`, `region_sub_locality_uuid` (Casa); `primary_polygon_uuid` / `locality`, `street_address`, `overidden_address`, `polygon_uuids` (Venus). |

---

## 2. polygons_hash: ph_v1 → ph_v2

The API continues to expose **`polygons_hash`** (same key and structure). Internally we distinguish:

- **ph_v1:** polygons_hash as received from **reverse_geocode** (unchanged).
- **ph_v2:** enhanced polygons_hash used for **all downstream field computation** (address, polygon_data, polygon_uuids, bounding_box, city_select_uuid, etc.). ph_v2 is **ph_v1 merged with new_trail** (new_trail entries take precedence and appear first).

### 2.1 Building ph_v2

1. **ph_v1**  
   - Received from reverse_geocode as today. No change to the reverse_geocode contract or response.

2. **Primary polygon**  
   - **Casa:** `primary_polygon` = DB’s **`region_locality_uuid`**.  
   - **Venus:** `primary_polygon` = DB’s **`primary_polygon_uuid`** OR DB’s **`locality`** (whichever is used today for “primary” locality).

3. **Validate primary polygon**  
   - Check: **feature_type === locality** AND **status === active** AND **property/project lat/lng lies within the polygon**.  
   - **Venus:** If invalid, optionally try DB’s **`locality`** as primary polygon and validate the same way (c1).

4. **If primary polygon is invalid**  
   - Use **locality[0]** from reverse_geocode (ph_v1) as the effective primary polygon for this request.  
   - **IDEALLY:** Run a **one-timer** to update the primary polygon in DB (e.g. whenever we go live in a state, for that state only).  
   - **Venus:** One-timer and DB updates must keep CMS in sync; run **analysis of how many projects/properties have invalid primary polygon** before changing DB/CMS.

5. **Fetch new_trail**  
   - Call Regions **get-ancestor** (or new_trail) API for the **effective primary polygon** (from step 2/3 or 4).  
   - For states where we are not yet live, **new_trail may be empty**.

6. **Build ph_v2**  
   - **ph_v2 = ph_v1 merged with new_trail.**  
   - Rule: **new_trail entries come first**; then append any from ph_v1 that are not already present for that polygon type.  
   - Per-type value remains a **list** (e.g. locality, city, bounding_box).  
   - Example:  
     - ph_v1 = `{ city: [c1], locality: [l1, l2], bb: [] }`  
     - new_trail = `{ locality: l2, city: c2, bb: b1 }`  
     - ph_v2 = `{ city: [c2, c1], locality: [l2, l1], bb: [b1] }`  
   - All downstream logic (address, polygon_data, polygon_uuids, bounding_box, city_select_uuid, etc.) uses **ph_v2** and **first element** where “primary” or “selected” is implied (e.g. locality[0], city[0], bb[0]).

**API:** Response still has **`polygons_hash`** with the same structure; internally it is populated from **ph_v2** (so ph_v2 is what gets cached and returned).

---

## 3. Field-by-field computation

### 3.1 street_info

| Service | Behaviour |
|---------|-----------|
| **Casa** | Not relevant. Do not touch `street_info`. |
| **Venus** | Read from DB as today. **One-timer** (once for all India, then per state when we go live in that state): if **normalisedName(street_info)** ends with **normalisedName(locality[0] from ph_v2)**, then remove that locality[0] suffix from street_info (so street_info does not redundantly repeat locality). |

---

### 3.2 long_address

**Structure:** Unchanged (same list/array shape as today).

| Service | Computation |
|---------|-------------|
| **Casa** | **New field in Casa** (if not already present). Build list in order: (1) DB’s **getName(region_entity_uuid)**, (2) DB’s **region_sub_locality_uuid** (resolve how it is populated in DB and use that. this should ideally only be populated when seller has manually selected a sublocality on seller panel), (3) **locality[0]** from ph_v2, (4) **region[0]** from ph_v2, (5) **city[0]** from ph_v2, (6) **bb[0]** from ph_v2 — if bb name ≠ city name, use **proxy_city mapping** for display/SEO as needed. Filter nulls. |
| **Venus** | In order: (1) DB’s **street_info** (after one-timer cleanup above), (2) **locality[0]** from ph_v2, (3) **region[0]** from ph_v2, (4) **city[0]** from ph_v2, (5) **bb[0]** from ph_v2 — if bb name ≠ city name, apply proxy_city mapping. Filter nulls. |

---

### 3.3 address

**Structure:** Unchanged (same list/array shape as today). **This field is to be deprecated.**

Until deprecation, behaviour:

| Service | Computation |
|---------|-------------|
| **Casa** | Same as **long_address** for Casa (DB’s getName(region_entity_uuid), region_sub_locality_uuid, locality[0], region[0], city[0], bb[0] from ph_v2, proxy_city when needed). |
| **Venus** | Same as **short_address** for Venus (locality[0], city[0] from ph_v2; overridden_address logic TBD). |

---

### 3.4 short_address

**Structure:** Unchanged (same shape as today).

**Product decision:** short_address = **locality[0], city[0]** from ph_v2.

| Service | Computation |
|---------|-------------|
| **Casa** | **locality[0]** from ph_v2, **city[0]** from ph_v2. (Add short_address field in Casa if it does not exist.) |
| **Venus** | **locality[0]** from ph_v2, **city[0]** from ph_v2. **TBD:** Finalise logic for DB’s **overridden_address** (when set, precedence and formatting to be discussed). |

---

### 3.5 polygon_data.primary_polygon_uuid

**Structure:** Unchanged. Same field path and type.

| Service | Computation |
|---------|-------------|
| **Casa** | Same logic as today, but use **ph_v2** instead of ph_v1 (i.e. primary polygon selection from ph_v2 using existing POLYGON_TYPES / primary order). |
| **Venus** | Same logic as today, but use **ph_v2** instead of ph_v1. |

---

### 3.6 polygon_data.parent_polygon_uuid

**Structure:** Unchanged.

| Service | Computation |
|---------|-------------|
| **Casa** | Same logic as today, but use **ph_v2** instead of ph_v1. |
| **Venus** | Use **city from new_trail** if available; otherwise use existing logic (with ph_v2). |

---

### 3.7 polygon_uuid_array / polygon_uuids

**Structure:** Unchanged (same array/key in API).

| Service | Computation |
|---------|-------------|
| **Both** | Collect **all polygon UUIDs** present in **ph_v2** (all types, all entries in the lists). **Venus:** Also include DB’s **primary_polygon** (primary_polygon_uuid) and DB’s **polygon_uuids** (project.polygonUuids). **Casa:** Include DB’s polygon UUIDs if the current logic already does. If current logic in either service does not already merge these, update to: **union of (ph_v2 UUIDs + DB primary_polygon for Venus + DB polygon_uuid_array/project.polygonUuids)**. Deduplicate. |

---

### 3.8 seo_address (Khoj only)

**Structure:** Unchanged. Computed only in **Khoj** at response time.

- **Formula:** **[region_entity_name for rent/resale when project is tagged to property]** + **short_address**.
- Logic must be **same for project / rent / resale** (project tagged → prepend region_entity_name; then short_address).
- **Presence of bounding_box (BB) in long_address must not break** SEO address (e.g. BB in long_address should be handled in link building / hierarchy).
- For **states where the new changes are not live** (e.g. ph_v2 not yet used upstream), **seo_address logic must not break** — i.e. Khoj should still derive SEO address from whatever polygons_hash/address/long_address/short_address/bounding_box it receives.

---

### 3.9 display_neighbourhood (Khoj only)

**Structure:** Unchanged. Computed only in **Khoj** at response time.

- Use the **same logic as short_address**: derive display_neighbourhood from **locality[0]** and **city[0]** from ph_v2. So display_neighbourhood mirrors the **short_address** hierarchy (from ph_v2 when upstream sends it).

---

### 3.10 bounding_box, city_select_uuid, and other address/polygon fields

**Structure:** Unchanged.

- **bounding_box**, **city_select_uuid**, and **any other address/polygon field** present in casa.md or venus.md (e.g. **nearby_landmarks**, **landmark**, **polygon_trail**, etc.) keep the **same logic** as today.
- Only change: use **ph_v2** instead of ph_v1 wherever polygon_hash/polygons_hash is currently used (e.g. for “first” bounding_box, city_select_uuid from bounding_box, etc.).

---

## 4. Summary table (source of computation)

| Field | Casa | Venus | Khoj |
|-------|------|--------|------|
| **polygons_hash** (API) | ph_v2 (ph_v1 + new_trail) | ph_v2 (ph_v1 + new_trail) | Pass-through from upstream |
| **street_info** | Not touched | DB + one-timer cleanup | — |
| **long_address** | New: DB entity + sub_locality + ph_v2[0]s + proxy_city | DB street_info + ph_v2[0]s + proxy_city | Pass-through |
| **address** (to be deprecated) | Same as long_address | Same as short_address | Pass-through |
| **short_address** | locality[0]+city[0] from ph_v2 | locality[0]+city[0] from ph_v2; overridden_address TBD | Pass-through |
| **polygon_data.primary_polygon_uuid** | Existing logic with ph_v2 | Existing logic with ph_v2 | Pass-through |
| **polygon_data.parent_polygon_uuid** | Existing logic with ph_v2 | city from new_trail else existing, with ph_v2 | Pass-through |
| **polygon_uuids / polygon_uuid_array** | ph_v2 UUIDs + DB (align with Venus if needed) | ph_v2 UUIDs + DB primary_polygon + project.polygonUuids | Pass-through |
| **seo_address** | — | — | region_entity_name (when project tagged) + short_address; same for project/rent/resale; non-live states must not break |
| **display_neighbourhood** | — | — | Same as short_address (locality[0], city[0] from ph_v2) |
| **bounding_box, city_select_uuid, others** | Same logic, ph_v2 | Same logic, ph_v2 | Pass-through |

---

## 5. One-timers and product confirmations

- **One-timer (Casa/Venus):** Update **primary_polygon** in DB when invalid (e.g. when going live in a state, for that state). **Venus:** Sync with CMS; run **analysis of invalid primary polygon count** before DB/CMS updates.
- **One-timer (Venus):** **street_info** cleanup: remove trailing locality from normalisedName(street_info) (once all-India, then per state on go-live).
- **Product decisions (done):** short_address = locality[0], city[0] from ph_v2 (Casa and Venus).
- **TBD:** **Venus** — finalise **overridden_address** logic (when overridden_address is set, precedence and formatting).
- **Deprecation:** **address** field is to be deprecated; until then Casa uses long_address, Venus uses short_address (see §3.3).

---

## 6. Regions API

- **reverse_geocode:** Already used; no contract change. Output is ph_v1.
- **new_trail:** New API or **modified get-ancestor API** that returns the same structure as needed for the merge (polygon type → list of polygon objects). If get-ancestor already returns a trail in that form, extend/reuse it; otherwise add a dedicated new_trail API.

---

*This doc defines the target computation only. Implementation details (classes, method names, cache keys) remain as in casa.md, venus.md, and khoj.md; only the **source of data** and **formulas** for each field change as above.*
