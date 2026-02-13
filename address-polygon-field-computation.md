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

#### 2.1.1. **ph_v1**  
   - Received from reverse_geocode as today. No change to the reverse_geocode contract or response.

#### 2.1.2. **Selected locality**  
   - **Casa:** `selected_locality` = DB’s **`region_locality_uuid`**.  
   - **Venus:** `selected_locality` = DB’s **`primary_polygon_uuid`** OR DB’s **`locality`** (whichever is used today for “primary” locality).

#### 2.1.3. **Fetch new_trail**  
   - Call Regions **get-ancestor** (or new_trail) API for the **effective selected_locality** (from step 2).  
   - For states where we are not yet live, **new_trail may be empty**.

#### 2.1.4. **Build ph_v2**  
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
| **Casa** | Not touched; not used currently for rent/resale. |
| **Venus** | Read from DB as today. |

---

### 3.2 long_address

**Structure:** Unchanged (same list/array shape as today).

| Service | Computation |
|---------|-------------|
| **Casa** | **New field in Casa** (if not already present). Build list in order: (1) DB’s **region_entity_name**, (2) DB’s **region_sub_locality_uuid** , (3) **locality[0]** from ph_v2, (4) **region[0]** from ph_v2, (5) **city[0]** from ph_v2, (6) **bb[0]** from ph_v2 — if bb name ≠ city name, use **proxy_city mapping** for display/SEO as needed. Filter nulls. |
| **Venus** | In order: (1) DB’s **street_info** is not null, (2) **selected_locality from step 2.1.2 above** if DB's  **street_info** is null, (3) **region[0]** from ph_v2, (4) **city[0]** from ph_v2, (5) **bb[0]** from ph_v2 — if bb name ≠ city name, apply proxy_city mapping. Filter nulls. **Basically logic remains the same, only BB is added, and source data is changed to ph_v2** |

---

### 3.3 address **This field is to be deprecated.**

**Structure:** Unchanged (same list/array shape as today). 

Until deprecation, behaviour:

| Service | Computation |
|---------|-------------|
| **Casa** | Same as **long_address** for Casa. |
| **Venus** | Same as **short_address** for Venus. |

---

### 3.4 medium_address *New Field in casa/venus/khoj*

| Service | Computation |
|---------|-------------|
| **Casa** | DB's **region_sublocality_uuid** , **locality[0]** from ph_v2, **city[0] (if it's not a proxy city, else empty)** from ph_v2. **short_address does not exist in Casa today; it must be added.** |
| **Venus** | **selected_locality from step 2.1.2 above**, **city[0]** from ph_v2. **TBD:** Finalise logic for DB’s **overridden_address** (when set, precedence and formatting to be discussed). |

---
### 3.4 short_address

**Structure:** Unchanged (same shape as today).

| Service | Computation |
|---------|-------------|
| **Casa** | **locality[0]** from ph_v2, **city[0] (if it's not a proxy city, else empty)** from ph_v2. **short_address does not exist in Casa today; it must be added.** |
| **Venus** | **selected_locality from step 2.1.2 above**, **city[0]** from ph_v2. **TBD:** Finalise logic for DB’s **overridden_address** (when set, precedence and formatting to be discussed). |

---

### 3.5 polygon_data.primary_polygon_uuid

**Structure:** Unchanged. Same field path and type.

| Service | Computation |
|---------|-------------|
| **Casa** | Same logic as today, but use **ph_v2** instead of ph_v1. |
| **Venus** | if present: **selected_locality from step 2.1.2 above**, else: Same logic as today, but use **ph_v2** instead of ph_v1. |

---

### 3.6 polygon_data.parent_polygon_uuid

**Structure:** Unchanged.

| Service | Computation |
|---------|-------------|
| **Casa** | Same logic as today, but use **ph_v2** instead of ph_v1. |
| **Venus** | Same logic as today, but use **ph_v2** instead of ph_v1. |

---

### 3.7 polygon_uuid_array / polygon_uuids

**Structure:** Unchanged (same array/key in API).

| Service | Computation |
|---------|-------------|
| **Both** | Collect **all polygon UUIDs** present in **ph_v2** (all types, all entries in the lists). **Venus:** Also include DB’s **primary_polygon** (primary_polygon_uuid) and DB’s **polygon_uuids** (project.polygonUuids). **Casa:** Include DB’s polygon UUIDs if the current logic already does. If current logic in either service does not already merge these, update to: **union of (ph_v2 UUIDs + DB primary_polygon for Venus + DB polygon_uuid_array/project.polygonUuids)**. Deduplicate. |

---

### 3.8 seo_address (Khoj only) **This field is to be deprecated.**

**Structure:** Unchanged. Computed only in **Khoj** at response time.

- **Formula:** **[region_entity_name for rent/resale when project is tagged to property]** + **short_address**.
- For **states where the new changes are not live** (e.g. ph_v2 not yet used upstream), **seo_address logic must not break** — i.e. Khoj should still derive SEO address from whatever polygons_hash/address/long_address/short_address/bounding_box it receives.

---

### 3.9 display_neighbourhood (Khoj only)

**Structure:** Unchanged. Computed only in **Khoj** at response time.

- Use the **same logic as short_address**.

---

### 3.10 bounding_box, city_select_uuid, and other address/polygon fields

**Structure:** Unchanged.

- **bounding_box**, **city_select_uuid**, and **any other address/polygon field** present in casa.md or venus.md (e.g. **nearby_landmarks**, **landmark**, **polygon_trail**, etc.) keep the **same logic** as today.
- Only change: use **ph_v2** instead of ph_v1 wherever polygon_hash/polygons_hash is currently used (e.g. for “first” bounding_box, city_select_uuid from bounding_box, etc.).

---

## 4. One-timers and product confirmations

- **TBD:** **Venus** — finalise **overridden_address** logic (when overridden_address is set, precedence and formatting).
- **Deprecation:** **address**, **seo_address** field is to be deprecated; until then Casa uses long_address, Venus uses short_address (see §3.3).

---

*This doc defines the target computation only. Implementation details (classes, method names, cache keys) remain as in casa.md, venus.md, and khoj.md; only the **source of data** and **formulas** for each field change as above.*
