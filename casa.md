# API: `/api/v2/flat/{flatId}/resale/details` — Field Population (Detailed)

**Endpoint:** `GET https://casa.housing.com/api/v2/flat/18151449/resale/details?api_name=RESALE_DEDICATED_DETAILS&source=web`

This document describes how the listed fields are populated in the API response, how they are stored in Aerospike and Elasticsearch, and what the source of each data point is.

---

## 1. API flow (high level)

1. **Controller:** `FlatControllerV2.getFlatDetails(flatId, "resale", "details", keys, source, forceFlag, httpRequest)`  
   - **Route:** `@GetMapping("{flatId}/{serviceType}/{formatType}")` → `flatId=18151449`, `serviceType=resale`, `formatType=details`.

2. **Service:** `FlatDetailsServiceImpl.getFlatDetailsSafely(...)`  
   - `serviceType` is mapped via `SERVICE_TYPE_MAPPING` (e.g. `resale` → `buy`).
   - Tries **Aerospike** first: `getFlatsDetailsFromCache(Collections.singletonList(flatId.toString()), serviceType)`.
   - **Cache key:** `{serviceType}_flat_{flatId}_details_json` (e.g. `buy_flat_18151449_details_json`). Value is **deflated** (compressed) JSON.
   - If cache **hit** and `service` matches and `forceFlag` is false → `processFlatDetailsData(flatDetails, ...)` and return.
   - If cache **miss** (or force): load flat from DB (`flatsDao.getAllFlatDetailById(flatId)`), then `buildCacheForFlatSafely(flat, ...)` which:
     - Builds full details map via `flatDataCacheMissUsingBulk(flat)` → `flatsCacherHelperService.fetchAndWriteFlatsCache(List.of(flat), "single", "all_keys", flatsHash)`.
     - Retains only keys in `FlatsConstants.FINAL_CACHE_KEYS` (db_keys, REGIONS, IMAGES, CLIENTS, ads, newprojects, dsl, media).
     - Writes retained map to **Aerospike** (deflated) at the same cache key.
     - Returns `processFlatDetailsData(retainedMap, ...)`.

3. **Post-processing:**  
   - `modifyFlatImagesHashData(apiResponse)` (image hash restructuring).  
   - If needed, `processAmenities(apiResponse)`.

4. **Response:** The map returned is the **same structure** as the one stored in Aerospike (possibly key-filtered by `keys` and `processFlatDetailsData`). There is **no separate “details” Elasticsearch index** for this API; the API response is **sourced from Aerospike** (or from the same map built on cache miss).

---

## 2. Field-by-field: population, storage, and source

### 2.1 `polygons_hash`

| Aspect | Detail |
|--------|--------|
| **In API** | Present as `polygons_hash` in the response (under REGIONS in `FINAL_CACHE_KEYS`). |
| **Type** | `Map<String, Map<String, Object>>`. Keys are polygon type names; each value has `name`, `uuid`, `url_name`, `display_name` (and possibly nulls). |
| **Where populated** | **RegionService.formatPolygonDetails()** → **populatePolygonsHash()**. |
| **When** | During cache build: `FlatsCacherHelperServiceImpl.fetchAndWriteFlatsCache()` → `regionService.getRegionsData(flatsHash, flatLocalityMap)` → `getPolygonDetails()` → `formatPolygonDetails()` → `populatePolygonsHash()`. |
| **Source of data** | **Regions service (external).** Flat’s `latitude` and `longitude` (from DB/cache) are sent in **RegionResponseHandler.getReverseGeocodeBulkResponseV2(bulkRegionsRequestDTO, flatIds)**. Response includes locality, city, country, housing_region, hotspot, **bounding_box**, region, state, sublocality, neighbourhood, h_district, housing_state. Each is converted to a list of `{ name, uuid, url_name, display_name }`. |
| **Polygon types (order for display)** | `FlatsConstants.POLYGON_TYPES_REVERSE`: state, housing_state, h_district, region, city, housing_region, hotspot, locality, sublocality, neighbourhood. |
| **Aerospike** | Stored as part of the flat-details blob at `{serviceType}_flat_{flatId}_details_json`. Key `polygons_hash` is in the REGIONS list of `FINAL_CACHE_KEYS`. |
| **Elasticsearch** | **Not** part of the seller-index document built in **EsIndexer.getIndexFlatDetails()**. That index uses DB/entity fields (e.g. `region_bounding_box_uuid`, `region_locality_uuid`), not the full `polygons_hash`. So **this API’s `polygons_hash` is not read from ES**; it is from Aerospike/Regions. |

---

### 2.2 `long_address`

| Aspect | Detail |
|--------|--------|
| **In API** | Not found as a **key** in this repo. May be derived on the client (e.g. by joining `address` parts) or in another service (e.g. JavaDto). |
| **Related in Casa** | **address** (list of strings) is built by **CommonMethod.getAddress(region_entity, polygons_hash)** and stored in the cache. A “long” address could be `String.join(", ", address)`. |
| **Aerospike** | Only `address` (list) is in `FINAL_CACHE_KEYS` (db_keys). No `long_address` key in Casa. |
| **ES** | Not in seller index. |

---

### 2.3 `address`

| Aspect | Detail |
|--------|--------|
| **In API** | Exposed as `address` (array of strings). |
| **Where populated** | **FlatsCacherHelperServiceImpl.addAddressToFlats(flatsHash)**. For each flat: `flat.put("address", commonMethod.getAddress(flat.get("region_entity"), flat.get("polygons_hash")))`. |
| **How getAddress works** | **CommonMethod.getAddress(regionEntity, polygonsHash)** builds a **List<String>**: (1) region_entity name (if project and show_project_name, or non-project), (2) sublocality/locality/city string from **sublocalityLogic(polygonsHash)** (sublocality + locality or locality + city, joined by ", "), (3) city name from `polygons_hash.get("city").get("name")` if sublocality present. Nulls are filtered out. So **address** is derived from **region_entity** (from DB/region logic) and **polygons_hash** (from Regions reverse-geocode). |
| **Source** | **region_entity** (DB + Venus/region for project-type); **polygons_hash** from **Regions API** (reverse geocode by lat/lng). |
| **Aerospike** | Stored under key `address` in the flat-details blob (db_keys). |
| **ES** | Not in seller index. |

---

### 2.4 `bounding_box`

| Aspect | Detail |
|--------|--------|
| **In API** | Present as `bounding_box`. |
| **Type** | Single object with `name`, `uuid`, `url_name`, `display_name` (or nulls). |
| **Where populated** | **RegionService.formatPolygonDetails()** → **getCitySelectUuid()**. For each polygon type in the reverse-geocode response, UUIDs are collected into `polygonTrail`; for the type **"bounding_box"**, the first non-null feature is set as **bounding_box** and its UUID is added to **city_select_uuid**. |
| **Source** | **Regions API** — reverse-geocode bulk response: `reverseGeocodeBulkResponseDTO.getBoundingBox()` → converted via **populatePolygonHashDataDTOData()** to `{ name, uuid, url_name, display_name }`. |
| **Aerospike** | In REGIONS keys; stored in the same flat-details blob. |
| **ES** | Seller index has **region_bounding_box_uuid** (from Flat entity), not the full bounding_box object. Details API’s `bounding_box` is from Aerospike/Regions. |

---

### 2.5 `city_select_uuid`

| Aspect | Detail |
|--------|--------|
| **In API** | Present as `city_select_uuid`. |
| **Type** | List of strings (UUIDs). |
| **Where populated** | **RegionService.formatPolygonDetails()** → **getCitySelectUuid()**. Every non-null **bounding_box** UUID from the polygon-details response is added to **citySelectUuid**. So it’s the bounding_box UUID(s) for the flat’s location. |
| **Source** | **Regions API** (reverse geocode) → bounding_box feature(s). |
| **Aerospike** | In REGIONS keys; stored in flat-details blob. |
| **ES** | Not in seller index as `city_select_uuid`. |

---

### 2.6 `landmark`

| Aspect | Detail |
|--------|--------|
| **In API** | Likely exposed as **nearby_landmarks** (list of establishment objects), not a single `landmark` key in this repo. |
| **Where populated** | **RegionService.appendNearbyLandmarks(flatsHash, true)**. Called from **FlatsCacherHelperServiceImpl.fetchAndWriteFlatsCache()** after `getRegionEntityAdditionalInfo` and `addAddressToFlats`. For each flat: builds request with lat/lng (from flat or from region_entity if project), radius 3000, max_count 5, group_by `establishment_type`, type = **LANDMARKS** (school, hospital, train_station, airport, restaurant, etc.). Calls **regionServiceHandler.getEstablishmentFilterV2(requestParams)**. Up to 5 landmarks per flat are put under **nearby_landmarks**. |
| **Source** | **Regions API** — EstablishmentFilterV2 (landmarks by lat/lng and radius). |
| **Aerospike** | Key **nearby_landmarks** (REGIONS in FINAL_CACHE_KEYS). |
| **ES** | Not in seller index. |

---

### 2.7 `locality_description`

| Aspect | Detail |
|--------|--------|
| **In API** | Not at top level; it appears under **related_project_info** for **project** (new project) listings. |
| **Where populated** | **CommonMethod.addRelatedProjectInfo()** (used when building cache for project-type flats): `relatedProjectInfo.put("locality_description", projectData.get("locality_description"))`. **projectData** comes from **VenusResponseHandler.getBulkProjectRawDetailsSafely(projectIds)** (Venus service). So **locality_description** is only set when the flat’s **region_entity** is a project and Venus returns it. |
| **Source** | **Venus** (project/details API). |
| **Aerospike** | Under **related_project_info** (newprojects keys) in the flat-details blob. |
| **ES** | Not in seller index. |

---

### 2.8 `polygon_data.primary_polygon_uuid`

| Aspect | Detail |
|--------|--------|
| **In API** | Under **polygon_data**: `primary_polygon_uuid`, `primary_polygon_url_name`, `primary_polygon_name`. |
| **Where populated** | **RegionService.populatPolygonData()**. Iterates **FlatsConstants.POLYGON_TYPES** in order: locality, sublocality, neighbourhood, hotspot, housing_region, city, region, h_district, housing_state, state. The **first** polygon type that has a non-null UUID in the reverse-geocode response is chosen; its **uuid**, **url_name**, and **name** are set as **primary_polygon_uuid**, **primary_polygon_url_name**, **primary_polygon_name**. So primary is the “smallest” available region (typically locality or sublocality). |
| **Source** | **Regions API** — reverse-geocode bulk response, same polygon details used for **polygons_hash**. |
| **Aerospike** | Under **polygon_data** (REGIONS); stored in flat-details blob. |
| **ES** | Seller index has **region_locality_uuid** etc., not the full **polygon_data**. |

---

### 2.9 `polygon_data.parent_polygon_uuid`

| Aspect | Detail |
|--------|--------|
| **In API** | Under **polygon_data**: `parent_polygon_uuid`, `parent_polygon_url_name`, `parent_polygon_name`. |
| **Where populated** | **RegionService.populatPolygonData()** → **getPolygonData()**. If the primary polygon index is **after** city index (e.g. primary is region/state), parent is the next polygon type after primary with a non-null UUID. If primary is **at or before** city index, parent is taken from the **city** polygon (index 4 in POLYGON_TYPES). So parent is usually **city** when primary is locality/sublocality. |
| **Source** | Same **Regions API** reverse-geocode response. |
| **Aerospike** | Same **polygon_data** object in REGIONS. |
| **ES** | Not in seller index as polygon_data. |

---

### 2.10 `polygon_uuid_array` / `polygon_uuids`

| Aspect | Detail |
|--------|--------|
| **In API** | In this repo the key is **polygon_uuids** (list of strings). If the client/contract uses **polygon_uuid_array**, it may be the same list under a different name. |
| **Where populated** | **RegionService.formatPolygonDetails()** → **getCitySelectUuid()**. **polygonTrail** is built by appending every non-null **uuid** from every polygon type (locality, city, bounding_box, etc.) in the order they are iterated. This list is stored as **POLYGON_UUIDS** (`"polygon_uuids"`). |
| **Source** | **Regions API** — all polygon UUIDs from reverse-geocode response. |
| **Aerospike** | Key **polygon_uuids** (REGIONS); stored in flat-details blob. |
| **ES** | Not in seller index. |

---

### 2.11 `short_address`

| Aspect | Detail |
|--------|--------|
| **In API** | Not found as a key in this repo. May be derived on the client (e.g. first element of `address` or a shortened string) or in another service. |
| **Related in Casa** | Only **address** (list) is built; no explicit **short_address** in cache or FINAL_CACHE_KEYS. |
| **Aerospike** | No `short_address` key. |
| **ES** | Not in seller index. |

---

## 3. Aerospike (details cache)

| Item | Detail |
|------|--------|
| **Key** | `{serviceType}_flat_{flatId}_details_json` (e.g. `buy_flat_18151449_details_json`). |
| **Value** | Deflated (compressed) JSON of the flat-details map. |
| **Keys stored** | Only those in **FlatsConstants.FINAL_CACHE_KEYS** (db_keys, REGIONS, IMAGES, CLIENTS, ads, newprojects, dsl, media). REGIONS includes: city_select_uuid, polygon_data, polygon_uuids, polygons_hash, bounding_box, building_id, building_uuid, building_name, price_factor, poly_video_links, nearby_landmarks, prime_location_factor, family_friendly_property_factor, nearby_establishments. |
| **When written** | On details request cache miss: after `fetchAndWriteFlatsCache()` and retaining FINAL_CACHE_KEYS, **FlatDetailsServiceImpl** deflates the map and calls **cacheService.saveObjectInCachePermanently()** (active) or **saveObjectInCache()** with TTL (inactive). Also written/updated by **FlatAfterCommits** (e.g. on flat save) and by **FlatDetailsCacheBulkUpdateWroker** and **FlatDetailUpdateWorker**. |
| **When read** | **getFlatsDetailsFromCache()** → **singleCacheHelper.getFlatCacheKey(serviceType, id)** → cache get → **CommonUtil.inflateData()** → map returned to API. |

So for this API, **all of the fields above that appear in the response are read from this Aerospike details cache** (or from the same map built on cache miss and then stored there).

---

## 4. Elasticsearch (seller index)

| Item | Detail |
|------|--------|
| **Index** | Seller index (e.g. FLAT_INDEX_NAME), built by **EsIndexer.getIndexFlatDetails(Flat)**. |
| **Source** | **DB entity (Flat)** and related entities (UserFlat, etc.), **not** the details cache. |
| **Relevant fields** | **region_bounding_box_uuid**, **region_locality_uuid**, **region_sublocality_uuid**, **region_neighbourhood_uuid**, **region_entity_type**, **region_entity_id**, **region_entity_name**, **locality_id**, plus other FLAT_COLUMNS_TO_INDEX / FLAT_DETAILS_TO_INDEX. |
| **Not in ES** | **polygons_hash**, **polygon_data**, **bounding_box** (full object), **city_select_uuid**, **address**, **nearby_landmarks**, **polygon_uuids**, **locality_description** (related_project_info), **long_address**, **short_address**. |

So the **details API response is not built from Elasticsearch**. It is built from **Aerospike** (or the same cache-build path). ES is used for search/seller flows with a different document shape.

---

## 5. Data source summary

| Field | Primary source | Where set in Casa | In Aerospike | In ES (seller) |
|-------|----------------|-------------------|--------------|----------------|
| **polygons_hash** | Regions API (reverse geocode by lat/lng) | RegionService.populatePolygonsHash() | Yes (REGIONS) | No |
| **long_address** | Not in Casa; client or other service | — | No | No |
| **address** | region_entity + polygons_hash (Regions) | CommonMethod.getAddress(); addAddressToFlats() | Yes (db_keys) | No |
| **bounding_box** | Regions API (reverse geocode) | RegionService.getCitySelectUuid() | Yes (REGIONS) | No (only region_bounding_box_uuid) |
| **city_select_uuid** | Regions API (bounding_box UUIDs) | RegionService.getCitySelectUuid() | Yes (REGIONS) | No |
| **landmark** / **nearby_landmarks** | Regions API (EstablishmentFilterV2) | RegionService.appendNearbyLandmarks() | Yes (REGIONS) | No |
| **locality_description** | Venus (project details) | CommonMethod.addRelatedProjectInfo() (related_project_info) | Yes (newprojects) | No |
| **polygon_data.primary_polygon_uuid** | Regions API (reverse geocode) | RegionService.populatPolygonData() | Yes (REGIONS) | No |
| **polygon_data.parent_polygon_uuid** | Regions API (reverse geocode) | RegionService.getPolygonData() | Yes (REGIONS) | No |
| **polygon_uuids** / **polygon_uuid_array** | Regions API (reverse geocode) | RegionService.getCitySelectUuid() (polygonTrail) | Yes (REGIONS) | No |
| **short_address** | Not in Casa; client or other service | — | No | No |

---

## 6. Code references (file:method)

- **API entry:** `web/controller/api/v2/FlatControllerV2.java` — `getFlatDetails`
- **Details + cache:** `core/services/impl/FlatDetailsServiceImpl.java` — `getFlatDetailsSafely`, `getFlatDetails`, `buildCacheForFlatSafely`, `flatDataCacheMissUsingBulk`, `getFlatsDetailsFromCache`, `processFlatDetailsData`
- **Cache build:** `core/services/impl/FlatsCacherHelperServiceImpl.java` — `fetchAndWriteFlatsCache`, `addAddressToFlats`
- **Region/polygon:** `core/services/RegionService.java` — `getRegionsData`, `getPolygonDetails`, `formatPolygonDetails`, `populatePolygonsHash`, `populatPolygonData`, `getCitySelectUuid`, `appendNearbyLandmarks`
- **Address:** `core/common/CommonMethod.java` — `getAddress`, `sublocalityLogic`; `FlatsCacherHelperServiceImpl.addAddressToFlats`
- **Locality description:** `core/common/CommonMethod.java` — `addRelatedProjectInfo` (related_project_info.locality_description from Venus)
- **Cache key:** `core/helper/SingleCacheHelper.java` — `getFlatCacheKey`
- **Constants:** `util/constants/FlatsConstants.java` — `FINAL_CACHE_KEYS`, `POLYGON_TYPES`, `POLYGON_TYPES_REVERSE`
- **ES index:** `core/helper/EsIndexer.java` — `getIndexFlatDetails` (seller index; does not include these details fields)

---

*Document generated from the Casa codebase for `/api/v2/flat/{flatId}/resale/details` (RESALE_DEDICATED_DETAILS).*
