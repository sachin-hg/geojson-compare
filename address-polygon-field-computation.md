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
   - **Venus:** `selected_locality` = DB’s **`primary_polygon_uuid`** OR DB’s **`locality`** (whichever is used today for “primary” locality). Note that this might not be same as ```ph_v2.locality[0]```

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

## 2.2. Components
   - ```region_entity_name```: Venus: null, Casa: Db's ```region_entity_name```
   - ```region_entity_id```: Venus: null, Casa: Db's ```region_entity_id```
   - ```region_entity_type```: Venus: null, Casa:  if ```region_entity_id !== null``` then: Db's ```region_entity_type```, else: ```locality```
   - ```sub_locality```: Venus: null, Casa: Db's ```region_sublocality_uuid```
   - ```sub_locality_name```: ```sub_locality ? getNameFromRegionService(sub_locality) : null```
   - ```selected_locality```: as described in step **2.1.2** above
   - ```selected_locality_name```: ```getNameFromRegionService(selected_locality)```
   - ```region```: ```housing_region[0].uuid``` from ```ph_v2```
   - ```region_name```: ```housing_region[0].name``` from ```ph_v2```
   - ```city```: ```city[0].uuid```  from ```ph_v2```
   - ```city_name```: ```city[0].name```  from ```ph_v2```
   - ```non_proxy_city```: if ```isProxyCity(city[0].uuid) ``` ? ```city[0].uuid``` : ```null```.  from ```ph_v2```
   - ```non_proxy_city_name```: if ```isProxyCity(city[0].uuid) ``` ? ```city[0].name``` : ```null```.  from ```ph_v2```
   - ```bb```:  ```bb[0].uuid```  from ```ph_v2```
   - ```bb_name```:  ```bb[0].name !== city[0].name ? bb[0].name : null```  from ```ph_v2```
   - ```street_info```: Db's ```street_info```
   - ```overridden_address```: Casa: null, Venus: Db's ```overridden_address```

---

## 3. Field-by-field computation

### 3.1 street_info

| Service | Behaviour |
|---------|-----------|
| **Casa** | Not touched; not used currently for rent/resale. |
| **Venus** | Read from DB as today. |

---

### 3.2 long_address

**Structure:** Unchanged (same list/array shape as today). But new field ```region_entity_id``` added

```json
"long_address": [
      {
        "display_name": "Text text field filled by user",
        "polygon_uuid": null, // FE should handle null & undefined both,
        "region_entity_id": null
      },
      {
        "display_name": "Project Name", // applicable only for rent/resale listings tagged to a project
        "polygon_uuid": null,
        "region_entity_id": 1234 // might be null as well. applicable only for rent/resale listings tagged to a project
      },
      {
        "display_name": "Polygon Name",
        "polygon_uuid": "Polygon_Uuid",
        "region_entity_id": null
      },
      {
        "display_name": "Polygon Name 2",
        "polygon_uuid": "Polygon_Uuid_2",
        "region_entity_id": null
      }
    ]
```

| Service | Computation |
|---------|-------------|
| **Casa** | **New field in Casa** . Build list in order: ```{display_name: region_entity_name, region_entity_id}```, ```{display_name: sub_locality_name, polygon_uuid: sub_locality}```, ```{display_name: selected_locality_name, polygon_uuid: selected_locality}```, ```{display_name: region_name, polygon_uuid: region}```, ```{display_name: city_name, polygon_uuid: city}```, ```{display_name: bb_name, polygon_uuid: bb}```. **Filter nulls by display_name only**. |
| **Venus** | In order:  ```{display_name: street_info ? street_info : selected_locality_name, polygon_uuid: street_info ? null : selected_locality}```, ```{display_name: region_name, polygon_uuid: region}```, ```{display_name: city_name, polygon_uuid: city}```, ```{display_name: bb_name, polygon_uuid: bb}```. **Filter nulls by display_name only**. **Basically logic remains the same, only BB is added, and source data is changed to ph_v2** |

---

### 3.3 address **This field is to be deprecated.**

**Structure:** Unchanged (same list/array shape as today). 

```json
"address": [
      "Text 1", "Text 2"
    ]
```

Until deprecation, behaviour:

| Service | Computation |
|---------|-------------|
| **Casa** | ```long_address.map( x => x.display_name )``` for Casa. |
| **Venus** | ```short_address.map( x => x.display_name )``` for Venus. |

---

### 3.4 medium_address *New Field in casa/venus/khoj*

```json
"medium_address": [
      {
        "display_name": "Polygon Name",
        "polygon_uuid": "Polygon_Uuid" // can be null, undefined, empty
      },
      {
        "display_name": "Polygon Name 2",
        "polygon_uuid": "Polygon_Uuid_2"
      }
    ]
```

| Service | Computation |
|---------|-------------|
| **Casa** |  ```{display_name: sub_locality_name, polygon_uuid: sub_locality}```, ```{display_name: selected_locality_name, polygon_uuid: selected_locality}```, ```{display_name: non_proxy_city_name, polygon_uuid: non_proxy_city}```. **short_address does not exist in Casa today; it must be added.** |
| **Venus** | same as ```short_address``` for venus |

---
### 3.4 short_address

**Structure:** Unchanged (same shape as today).

```json
"short_address": [
      {
        "display_name": "Polygon Name",
        "polygon_uuid": "Polygon_Uuid"
      },
      {
        "display_name": "Polygon Name 2",
        "polygon_uuid": "Polygon_Uuid_2"
      }
    ]
```

| Service | Computation |
|---------|-------------|
| **Casa** | ```{display_name: selected_locality_name, polygon_uuid: selected_locality}```, ```{display_name: city_name, polygon_uuid: city}```. **short_address does not exist in Casa today; it must be added.** |
| **Venus** |  if Db's```overridden_address !== null``` ```{display_name: overridden_address, polygon_uuid: null}``` else  ```{display_name: selected_locality_name, polygon_uuid: selected_locality}```, ```{display_name: city_name, polygon_uuid: city}``` |

---

### 3.5 polygon_data.primary_polygon_uuid

**Structure:** Unchanged. Same field path and type.

| Service | Computation |
|---------|-------------|
| **Casa** | Same logic as today, but use **ph_v2** instead of ph_v1. |
| **Venus** | if present: ```selected_locality``` from step ```2.1.2``` above**, else: Same logic as today, but use ```ph_v2``` instead of ph_v1. |

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

```json
[
  {
    "name": "Project Name",
    "href": "/in/buy/projects/page/45599-shapoorji-pallonji-vicinia-by-shapoorji-pallonji-real-estate-in-powai",
    "type": "project"
  },
  {
    "name": "Street info, polygon name 1, polygon name 2",
    "href": "/in/buy/<BBName>/<polygon_name_1>", // href can be empty, null, undefined
    "type": "locality"
  }
]  
```

- **Formula:** ```{name: region_entity_name, href: getCanonical(region_entity_id) || "", type: region_entity_type}```, ```{name: short_address.map(x => x.display_name).join(', '), href: getCanonical(short_address.findFirstNotNull(x => x.polygon_uuid)), type: "locality"}```. Filter nulls by ```name``` only.
- For **states where the new changes are not live** (e.g. ph_v2 not yet used upstream), **seo_address logic must not break** — i.e. Khoj should still derive SEO address from whatever polygons_hash/address/long_address/short_address/bounding_box it receives.

---

### 3.9 display_neighbourhood (Khoj only) Deprecated field

**Structure:** Unchanged. Computed only in **Khoj** at response time.

```json
[
  "Text1", "Text 2"
]  
```

- Use the ```short_address.reversee().map(x => x.display_name)```.

---

### 3.10 bounding_box, city_select_uuid, and other address/polygon fields

**Structure:** Unchanged.

- **bounding_box**, **city_select_uuid**, and **any other address/polygon field** present in casa.md or venus.md (e.g. **nearby_landmarks**, **landmark**, **polygon_trail**, etc.) keep the **same logic** as today.
- Only change: use **ph_v2** instead of ph_v1 wherever polygon_hash/polygons_hash is currently used (e.g. for “first” bounding_box, city_select_uuid from bounding_box, etc.).

---

## 4. One-timers and product confirmations
- **Deprecation:** **address**, **seo_address** field is to be deprecated; until then Casa uses long_address, Venus uses short_address (see §3.3).

---

*This doc defines the target computation only. Implementation details (classes, method names, cache keys) remain as in casa.md, venus.md, and khoj.md; only the **source of data** and **formulas** for each field change as above.*
