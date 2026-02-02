# Filter API: Address, Polygon, and Locality Fields — Detailed Field Population Guide

This document describes how the **buy** and **rent** filter APIs work and, in particular, how the following fields are populated in the API response, how they are indexed in Elasticsearch (ES), whether they are stored in Aerospike, and what the **source of data** is for each.

**APIs in scope:**
- **Buy:** `GET /api/v9/buy/index/filter` (and underlying v7 buy filter)
- **Rent:** `GET /api/v3/rent/index/filter` (combined cards / rent filter)

**Fields covered:**
- `polygons_hash`
- `long_address`
- `address`
- `bounding_box`
- `city_select_uuid`
- `landmark` / `nearby_landmarks`
- `locality_description` (and related display)
- `seo_address`
- `display_neighbourhood`
- `polygon_data.primary_polygon_uuid`
- `polygon_data.parent_polygon_uuid`
- `polygon_uuid_array` / `polygon_uuids`
- `short_address`

---

## 1. High-Level API and Data Flow

### 1.1 Buy Filter API (v9 → v7)

- **Entry:** `web/controller/api/v9/FilterController.java` → `GET /api/v9/buy/` → `index/filter`
- **Service:** `BuyServiceV9.filterV9Result()` delegates to `BuyService.filterApiResponse()` (v7).
- **Response path:**
  - For cacheable sources (e.g. android, ios, web): v7 may **read from Aerospike** (compressed full response). On cache miss, it **queries ES**, builds the response (including post-processors), then **writes the full response** to Aerospike.
  - For non-cacheable sources: v7 **queries ES** and builds the response every time.
- **ES:** Buy listings live in buy indices (e.g. `buy`, `buy_inactive`). Documents are indexed by the **cron/worker** pipeline that pulls inventory from **Casa** (resale) or **Venus** (new projects) and writes to ES. The payload from Casa/Venus **already contains** `polygons_hash`, `polygon_data`, `address`, `short_address`, `long_address`, `bounding_box`, `city_select_uuid`, `polygon_uuids`, etc. Khoj does **not** compute these; it **whitelists** allowed fields and stores the payload as-is into ES (see `core/helper/buy/ParameterHelper` and `core/services/buy/Indexer`).

### 1.2 Rent Filter API (v3)

- **Entry:** `web/controller/api/v3/FilterController.java` → `GET /api/v3/rent/` → `index/filter`
- **Service:** `CombinedCardsDataServiceRent.filter()` (combined cards flow for rent).
- **Response path:** Typically **queries ES** (rent indices), then applies post-processors. Rent v3 does not use the same Aerospike **response** cache as buy v7; cache usage is service-specific.
- **ES:** Rent listings live in rent indices. Documents are indexed by the **cron/worker** pipeline that pulls inventory from the **Flats/Data** service. Again, the payload from upstream **already contains** the address/polygon fields; Khoj whitelists and stores them.

### 1.3 Where the “source” data comes from (before Khoj)

- **Buy:** **Casa** (resale) and **Venus** (new projects) provide bulk buy inventory. They are called from `core/services/buy/Indexer` (e.g. `getPaginatedInventory` → `casaResponseHandler.getBulkBuyInventoryWithRetry` / `venusResponseHandler.getBulkBuyInventoryWithRetry`). Casa/Venus (and the broader Data/Flats ecosystem) are the **authoritative source** of listing-level fields such as `polygons_hash`, `polygon_data`, `address`, `short_address`, `long_address`, `bounding_box`, `city_select_uuid`, `polygon_uuids`. Those services typically get polygon/locality metadata from the **Regions** service (see `core/handler/RegionsResponseHandler.java` for polygon/details APIs).
- **Rent:** **Flats/Data** service provides rent inventory for bulk indexing. Same idea: polygon and address fields are part of the upstream payload.
- **Regions service** is used by Khoj for polygon/locality lookups (e.g. `getPolygonDetailsSafely`, `getBuildingsInfoSafely`, `getBulkLocalitiesMetaDetailsSafely`, `getIntersectingPolygonsSafely`) but is **not** the direct writer of ES documents; the indexed document is built from Flats/Casa/Venus/Data payloads.

---

## 2. Field-by-Field: Population, ES, Aerospike, Source

### 2.1 `polygons_hash`

| Aspect | Detail |
|--------|--------|
| **Meaning** | A map (hash) of polygon type → polygon info. Keys typically include `city`, `locality`, `sublocality`, `neighbourhood`, `housing_region`, `h_district`, `state`, `region`, `housing_state`, `hotspot`, `bounding_box`. Each value is an object with e.g. `name`, `url_name`, `uuid`, `display_name`. |
| **In API response** | Returned as-is from ES (or from cached response that was built from ES). Included in **source fields** for filter API in `FilterApiConstantHelper.COMMON_SOURCE_FIELDS` / `BuySourceFields` / `RentSourceFields` (e.g. `util/constants/FilterApiConstantHelper.java`, `BuySourceFields.java`, `RentSourceFields.java`). |
| **In ES** | **Indexed as provided** by the upstream payload. Mapping in `core/src/main/resources/mappings/rent_buy_mapping.json` under `"polygons_hash"`: nested object with `city`, `h_district`, `housing_region`, `hotspot`, `housing_state`, `locality`, `neighbourhood`, `region`, `state`, `sublocality`, each with `display_name`, `name`, `url_name`, `uuid` (keyword, most not indexed for search). |
| **In Aerospike** | **Not** stored as a separate structure. The **buy filter API (v7)** caches the **entire API response** (including hits that contain `polygons_hash`) in Aerospike (compressed). So when served from cache, `polygons_hash` is whatever was in that response at cache-write time. |
| **Source of data** | **Upstream listing services:** Casa (buy resale), Venus (buy new projects), Flats/Data (rent). They supply the listing document including `polygons_hash`. Polygon/locality metadata in those services typically originates from or is aligned with the **Regions** service. |

**Code references:**  
`core/model/elasticsearch/PolygonsHash.java`, `PolygonHashData.java`; `core/constants/Keys.java` (`POLYGONS_HASH`); `web/helper/SeoAddressOutputProcessor.java` (reads `doc.get("polygons_hash")`); `web/helper/RegionProcessorHelper.java` (`prepareDisplayNeighbourhood` uses `inventoryMap.get("polygons_hash")`).

---

### 2.2 `long_address`

| Aspect | Detail |
|--------|--------|
| **Meaning** | Array of address entries, each with e.g. `display_name` and `polygon_uuid`, representing a longer/hierarchical address. |
| **In API response** | Included in common/buy/rent source field lists (e.g. `FilterApiConstantHelper`, `BuySourceFields`). Returned as stored in ES (or from cached response). |
| **In ES** | **Indexed as provided** by upstream. Mapping in `rent_buy_mapping.json`: `"long_address"` is **nested** with `display_name` (keyword, not indexed) and `polygon_uuid` (keyword, not indexed). |
| **In Aerospike** | Only as part of the cached **full filter API response** for buy v7 (see above). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`util/constants/BuySourceFields.java` (`long_address` in allowed/source lists); `core/helper/buy/ParameterHelper.java` (BUY_NESTED_FIELDS, BUY_ALLOWED_FIELDS).

---

### 2.3 `address`

| Aspect | Detail |
|--------|--------|
| **Meaning** | Simple address representation (often list of strings, e.g. locality/city lines). |
| **In API response** | In source field lists. Used by `SeoAddressOutputProcessor` for `prepareAddressToShow` when building `seo_address`; may be removed from the response if `removeAddressField` is true (replaced by SEO address). |
| **In ES** | **Indexed as provided** by upstream. Mapping: `"address"` is `keyword` with `index: false`. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`FilterApiConstantHelper.COMMON_SOURCE_FIELDS`; `SeoAddressOutputProcessor.prepareAddressToShow()` (uses `esDoc.get("address")` when not paid project or when short_address has null polygon_uuid).

---

### 2.4 `bounding_box`

| Aspect | Detail |
|--------|--------|
| **Meaning** | Polygon object representing the bounding region (e.g. city-level), with `name`, `url_name`, `uuid`, `display_name`. |
| **In API response** | In source field lists. Used in `SeoAddressOutputProcessor` when building SEO cache key / data (e.g. `doc.get("bounding_box")` for `url_name`, `uuid`). |
| **In ES** | **Indexed as provided** by upstream. Mapping: `"bounding_box"` has `display_name`, `name`, `url_name`, `uuid` (keyword). |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload (often aligned with Regions). |

**Code references:**  
`FilterApiConstantHelper` (COMMON_SOURCE_FIELDS, etc.); `SeoAddressOutputProcessor` (getDataArray uses bounding_box).

---

### 2.5 `city_select_uuid`

| Aspect | Detail |
|--------|--------|
| **Meaning** | UUID of the “selected” city polygon for the listing. |
| **In API response** | In source field lists (e.g. WEB_SOURCE_FIELDS, buy/rent constants). Used in filters (e.g. `TermFilter` maps request param `city_select_uuid` to ES field `polygon_uuids` for querying). |
| **In ES** | **Indexed as provided** by upstream. Mapping: `"city_select_uuid"` is `keyword`. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`core/constants/Keys.java` (`CITY_SELECT_UUID`); `web/models/queries/filters/TermFilter.java` (city_select_uuid → polygon_uuids); `FilterApiConstantHelper`, `BuySourceFields`, `RentSourceFields`.

---

### 2.6 `landmark` / `nearby_landmarks`

| Aspect | Detail |
|--------|--------|
| **Meaning** | **Residential (buy/rent):** `nearby_landmarks` — array of objects with e.g. `name`, `distance`, `lat_lon`. **Commercial:** some DTOs have a single `landmark` string. |
| **In API response** | `nearby_landmarks` is in COMMON_SOURCE_FIELDS / BuySourceFields / RentSourceFields. Returned as stored in ES (or from cache). |
| **In ES** | **Indexed as provided** by upstream. In `rent_buy_mapping.json`: `"nearby_landmarks"` has `distance` (float), `lat_lon` (geo_point), `name` (keyword), etc. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** (or a service that enriches listings with landmarks). |

**Code references:**  
`core/model/elasticsearch/commercial/CommercialEsDTO.java` (`landmark`); `util/constants/BuySourceFields.java`, `FilterApiConstantHelper` (`nearby_landmarks`); `core/helper/buy/ParameterHelper.java` (allowed fields).

---

### 2.7 `locality_description` (and related display)

| Aspect | Detail |
|--------|--------|
| **Meaning** | There is **no dedicated field named `locality_description`** in the Khoj codebase. The closest behavioural equivalent is **`display_neighbourhood`**: a list of strings showing locality/region hierarchy for display (e.g. “Locality, City”). |
| **In API response** | **`display_neighbourhood`** is **computed at response time** by Khoj. It is derived from `polygons_hash` and optional request/context (e.g. `featureType`, `featureTypesHash`, `filteredParams`) in `RegionProcessorHelper.prepareDisplayNeighbourhood()` and then set on each hit in `OutputProcessingHelper.inventoryLevelProcessing()` as `display_neighbourhood` (and `featured_type`). |
| **In ES** | **Not stored** in ES. It is computed from ES field `polygons_hash` during response building. |
| **In Aerospike** | Only as part of the cached **response** for buy v7 (so the computed `display_neighbourhood` at cache-write time is what is served). |
| **Source of data** | **Computed in Khoj** from `polygons_hash` (which comes from Casa/Venus/Flats/Data). Priority order for display is determined by `RegionProcessorHelper.getPriorityList()` (e.g. locality, neighbourhood, sublocality, city, etc.). |

**Code references:**  
`web/models/queries/outputprocessors/helper/OutputProcessingHelper.java` (`prepareDisplayNeighbourhood` → `put("display_neighbourhood", displayContent)`); `web/helper/RegionProcessorHelper.java` (`prepareDisplayNeighbourhood`, `prepareDisplayNeighbourhoodSpecific`, `getPriorityList`).

---

### 2.8 `seo_address`

| Aspect | Detail |
|--------|--------|
| **Meaning** | List of objects (e.g. `{ "href": "...", "name": "..." }`) for SEO-friendly address links. |
| **In API response** | **Computed at response time** by `SeoAddressOutputProcessor.appendSeoAddress()`. It uses ES fields `polygons_hash`, `polygon_data`, `short_address`, `address`, `bounding_box`, and optionally `region_entities`, then calls the **SEO service** (via `SeoResponseHandler.getSeoUrlsOfPolygonsData`) and optionally **Aerospike cache** (for SEO results by key). The result is written onto each hit as `seo_address`. |
| **In ES** | **Not stored** in ES. It is computed during API response building. |
| **In Aerospike** | (1) **Filter API response cache (buy v7):** full response including computed `seo_address`. (2) **SEO cache:** `SeoAddressOutputProcessor` uses `ICache` (Aerospike) to cache SEO address results by a key (e.g. `SEO-V1-` + serviceType + polygon uuid + encodedHash); TTL 30 days. |
| **Source of data** | **Computed in Khoj** using: (a) ES document fields: `polygons_hash`, `bounding_box`, `short_address`, `address`, `region_entities`; (b) **SEO service** for href/name; (c) Aerospike for SEO cache. |

**Code references:**  
`web/helper/SeoAddressOutputProcessor.java` (`appendSeoAddress`, `fetchSeoAddress`, `prepareAddressToShow`, `getDataArray` using polygons_hash/bounding_box/short_address); `core/handler/SeoResponseHandler.java`.

---

### 2.9 `display_neighbourhood`

| Aspect | Detail |
|--------|--------|
| **Meaning** | List of strings for displaying locality/neighbourhood hierarchy (e.g. `["Locality Name", "City Name"]`). |
| **In API response** | **Computed at response time** from `polygons_hash` by `RegionProcessorHelper.prepareDisplayNeighbourhood()` and set on the hit by `OutputProcessingHelper.inventoryLevelProcessing()` (and reversed for display order). For projects/resale with `show_contextual_address`, `overidden_address_value` can override. |
| **In ES** | **Not stored** in ES. Derived from `polygons_hash` at response time. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Computed in Khoj** from `polygons_hash` (which comes from Casa/Venus/Flats/Data). |

**Code references:**  
`OutputProcessingHelper.inventoryLevelProcessing()`; `RegionProcessorHelper.prepareDisplayNeighbourhood()`, `prepareDisplayNeighbourhoodSpecific()`, `getPriorityList()`.

---

### 2.10 `polygon_data.primary_polygon_uuid`

| Aspect | Detail |
|--------|--------|
| **Meaning** | UUID of the “primary” polygon (e.g. main locality) for the listing. |
| **In API response** | Part of `polygon_data` in source field lists. Used in queries (e.g. `FilterApiConstantHelper` sort/query on `polygon_data.primary_polygon_uuid`, `polygon_data.primary_polygon_name`). |
| **In ES** | **Indexed as provided** by upstream. Mapping: under `"polygon_data"`: `"primary_polygon_uuid"` (keyword, index false), plus `primary_polygon_name`, `primary_polygon_url_name`, and parent_* equivalents. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`core/model/elasticsearch/PolygonData.java` (`primaryPolygonUuid`); `core/constants/Keys.java` (`PRIMARY_POLYGON_UUID`, `POLYGON_DATA`); `util/constants/FilterApiConstantHelper.java` (query/sort using `polygon_data.primary_polygon_uuid`).

---

### 2.11 `polygon_data.parent_polygon_uuid`

| Aspect | Detail |
|--------|--------|
| **Meaning** | UUID of the parent polygon (e.g. city or region containing the primary locality). |
| **In API response** | Part of `polygon_data`. Same treatment as other polygon_data fields. |
| **In ES** | **Indexed as provided** by upstream. Mapping: under `"polygon_data"`: `"parent_polygon_uuid"` (keyword, index false), plus parent_polygon_name, parent_polygon_url_name. |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`core/model/elasticsearch/PolygonData.java` (`parentPolygonUuid`); `util/constants/BuySourceFields.java` (parent_polygon_* in list).

---

### 2.12 `polygon_uuid_array` / `polygon_uuids`

| Aspect | Detail |
|--------|--------|
| **Meaning** | Array of polygon UUIDs the listing belongs to (used for filtering and boosting). In the codebase the field is **always `polygon_uuids`** (ES and API). Some API contracts or clients may expose it as **`polygon_uuid_array`**; in Khoj it is `polygon_uuids`. |
| **In API response** | In source field lists. Used for polygon filter (e.g. request param `poly` → ES `polygon_uuids` in `TermsFilter`, `PolygonsFilter`). |
| **In ES** | **Indexed as provided** by upstream. Mapping: `"polygon_uuids"` is `keyword` (array). |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`core/constants/Keys.java` (`POLYGON_UUIDS`); `web/models/queries/filters/TermFilter.java` (city_select_uuid → polygon_uuids); `web/models/queries/filters/PolygonsFilter.java`; `core/model/elasticsearch/buy/BuyEsDTO.java`, `rent/RentEsDTO.java` (`polygon_uuids`).

---

### 2.13 `short_address`

| Aspect | Detail |
|--------|--------|
| **Meaning** | Nested array of objects with e.g. `display_name` and `polygon_uuid` — short/custom address (e.g. for paid projects). |
| **In API response** | In source field lists. Used by `SeoAddressOutputProcessor.prepareAddressToShow()`: for paid project/bhk-variant, address to show can come from `short_address[].display_name`; if short_address has null polygon_uuid, logic may fall back to `address`. |
| **In ES** | **Indexed as provided** by upstream. Mapping: `"short_address"` is **nested** with `display_name`, `polygon_uuid` (keyword, index false). |
| **In Aerospike** | Only inside cached full API response (buy v7). |
| **Source of data** | **Casa / Venus / Flats / Data** in the listing payload. |

**Code references:**  
`FilterApiConstantHelper`, `BuySourceFields`; `SeoAddressOutputProcessor.prepareAddressToShow()`, `isShortAddressContainNullPolygonUuid()`; `core/helper/buy/ParameterHelper.java` (BUY_NESTED_FIELDS).

---

## 3. Elasticsearch Indexing (How These Fields Get Into ES)

- **Indexing is not done inside the filter API.** It is done by:
  - **Cron batch jobs** (e.g. bulk reindex, listing index batch) in the `cron` module.
  - **Workers** (e.g. `PropertyIndexWorker`, `BulkIndexerWorker`, single-indexer workers) in the `worker` module.
- **Flow:** Worker/cron receives or fetches listing data from **Casa** (buy resale), **Venus** (buy new projects), or **Flats/Data** (rent). The payload is already a document with `polygons_hash`, `polygon_data`, `address`, `short_address`, `long_address`, `bounding_box`, `city_select_uuid`, `polygon_uuids`, etc.
- **Khoj’s role:** `core/services/buy/Indexer` (and rent path) uses `ParameterHelper.processPropertyIndexParams()` → `ParameterHelper.processIndexParams()`, which **validates** and **filters** the payload to only **allowed fields** (BUY_ALLOWED_FIELDS, RENT_ALLOWED_FIELDS, etc.). Fields like `polygons_hash`, `polygon_data`, `address`, `short_address`, `long_address`, `bounding_box`, `city_select_uuid`, `polygon_uuids`, `nearby_landmarks` are in those allowlists and are **written to ES as-is**; no transformation or enrichment of these fields is done at index time in Khoj.
- **ES mapping:** `core/src/main/resources/mappings/rent_buy_mapping.json` defines the schema for the buy/rent index. The mappings for the fields above are as described in Section 2; they are either nested objects or keyword arrays, and most subfields have `index: false` and are used for storage and retrieval only.

---

## 4. Aerospike Usage Summary

- **Filter API response cache (buy v7):** The **entire** filter API response (including all hit fields) is compressed and stored in Aerospike under a key derived from request params and cookies. On cache hit, the response (including `polygons_hash`, `polygon_data`, `address`, `display_neighbourhood`, `seo_address`, etc.) is **returned as stored**; no fresh ES query or post-processing for those hits. So **all** the fields above that appear in the response are present in Aerospike only as part of this **response blob**, not as a separate document store.
- **SEO cache:** `SeoAddressOutputProcessor` uses Aerospike (via `ICache`) to cache **SEO address** results by a key (e.g. `SEO-V1-` + serviceType + polygon uuid + encoded hash). This caches the **SEO service output** used to build `seo_address`, not the raw ES fields.
- **Rent:** Rent v3 filter does not use the same full-response Aerospike cache as buy v7; responses are built from ES each time (unless a different rent-specific cache exists elsewhere).

---

## 5. Source-of-Data Summary Table

| Field | Stored in ES? | Computed in Khoj? | In Aerospike? | Ultimate source |
|-------|----------------|-------------------|----------------|------------------|
| `polygons_hash` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `long_address` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `address` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `bounding_box` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `city_select_uuid` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `nearby_landmarks` / `landmark` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `locality_description` | N/A | Mapped to display_neighbourhood | — | See display_neighbourhood |
| `seo_address` | No | Yes (from ES + SEO service + cache) | SEO cache + response cache | Khoj + SEO service |
| `display_neighbourhood` | No | Yes (from polygons_hash) | In full response cache (buy v7) | Khoj (from polygons_hash) |
| `polygon_data.primary_polygon_uuid` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `polygon_data.parent_polygon_uuid` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `polygon_uuids` (polygon_uuid_array) | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |
| `short_address` | Yes (from upstream) | No | In full response cache (buy v7) | Casa / Venus / Flats / Data |

---

## 6. Code Reference Quick Links

- **Controllers:** `web/controller/api/v9/FilterController.java`, `web/controller/api/v3/FilterController.java`
- **Services:** `web/service/api/v9/buy/BuyServiceV9.java`, `web/service/api/v7/buy/BuyService.java`, rent `CombinedCardsDataServiceRent` / `RentService`
- **Indexing:** `core/services/buy/Indexer.java`, `core/helper/buy/ParameterHelper.java`
- **Handlers (upstream):** `core/handler/CasaResponseHandler.java`, `core/handler/FlatsResponseHandler.java`, `core/handler/RegionsResponseHandler.java`, `core/handler/SeoResponseHandler.java`
- **Response-time computation:** `web/helper/SeoAddressOutputProcessor.java`, `web/helper/RegionProcessorHelper.java`, `web/models/queries/outputprocessors/helper/OutputProcessingHelper.java`
- **Constants / source fields:** `util/constants/FilterApiConstantHelper.java`, `util/constants/BuySourceFields.java`, `util/constants/RentSourceFields.java`; `core/constants/Keys.java`
- **ES mapping:** `core/src/main/resources/mappings/rent_buy_mapping.json`
- **Models:** `core/model/elasticsearch/PolygonData.java`, `core/model/elasticsearch/PolygonsHash.java`, `core/model/elasticsearch/PolygonHashData.java`, `core/model/elasticsearch/buy/BuyEsDTO.java`, `core/model/elasticsearch/rent/RentEsDTO.java`

---

*Document generated from codebase analysis. For authoritative behaviour, refer to the linked source files.*
