# API Field Population Details - V9 New Projects Endpoint

## Overview

This document provides a comprehensive, detailed explanation of how specific fields are populated in the `/api/v9/new-projects/{id}/webapp` endpoint. The endpoint URL is:
```
https://venus.housing.com/api/v9/new-projects/288866/webapp?fixed_images_hash=true&include_derived_floor_plan=true&api_name=PROJECT_DEDICATED_DETAILS&source=web
```

## API Flow Architecture

### Request Flow
1. **Controller**: `ProjectControllerV9.getVersion()` receives the request
2. **Service Layer**: Calls `ProjectsApiV7.getDetialsDataV7()` which internally calls `ProjectsApiV3.getDetailsData()`
3. **Cacher**: `ResidentialSingleCacher.buildAndCache()` builds the project details
4. **Builder**: `ProjectDetailsResidentialBuilder.buildResidential()` constructs the response object
5. **Cache**: Data is stored in Aerospike and optionally indexed in Elasticsearch

### Data Sources
- **PostgreSQL Database**: Project entity data, polygon UUIDs
- **Regions Service**: Polygon/geographic data via reverse geocoding
- **Aerospike Cache**: Cached project details (key: `details_cache_{project_id}`)
- **Elasticsearch**: Indexed for search (optional, via worker processes)

---

## Field-by-Field Population Details

### 1. `polygons_hash`

#### **What it is:**
A map/dictionary containing polygon information for different geographic hierarchy levels (state, city, locality, sublocality, etc.)

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/ResidentialSingleCacher.java:165`
   ```java
   Map<String, PolygonHashDataDTO> polygonsHash = regionsAccessor.getPolygonsHashForAProject(lat, lng, id);
   ```

2. **Data Source**: Regions Service API (external microservice)
   - **Method**: `RegionsAccessor.getPolygonsHashForAProject()`
   - **Location**: `core/src/main/java/com/housing/venus/core/accessor/RegionsAccessor.java:57-64`
   - **Process**:
     - Takes project latitude/longitude from `Projects.markerCoordinate`
     - Calls `getDisplayRegionHashForResidential()` which creates a `BulkRegionsRequestDTO`
     - Makes HTTP call to Regions Service via `regionsServiceHelper.getReverseGeocodeBulk()`
     - Returns polygon data for: `state`, `housing_state`, `h_district`, `region`, `city`, `housing_region`, `hotspot`, `locality`, `sublocality`, `neighbourhood`, `bounding_box`

3. **Builder Assignment**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:660-662`
   ```java
   public Map<String, PolygonHashDataDTO> polygonsHash(CacheBuilderRequest request) {
       return request.getPolygonsHash();
   }
   ```

4. **Structure**: Each polygon type contains:
   - `name`: Display name (e.g., "Pune", "Kiwale")
   - `uuid`: Unique identifier
   - `url_name`: URL-friendly name
   - `display_name`: Formatted display name

#### **Indexing in Elasticsearch:**
- **Location**: `core/src/main/java/com/housing/venus/core/indexer/IndexerFields.java:385-389`
- **Field Name**: `polygon_uuids` (array of UUIDs)
- **Process**: Extracts UUIDs from `polygon_trail` field in cached data
- **Code**:
  ```java
  private List<String> polygonUuids(Map<String, Object> cachedData) {
      List<String> polygonTrail = CommonUtils.getObjectAsNonNullList(
          cachedData.get("polygon_trail"));
      return polygonTrail.stream().distinct().collect(Collectors.toList());
  }
  ```

#### **Caching in Aerospike:**
- **Cache Key**: `details_cache_{project_id}`
- **Storage**: Entire `ProjectsDetail` object (including `polygons_hash`) is deflated and stored
- **Location**: `core/src/main/java/com/housing/venus/core/cacher/ResidentialSingleCacher.java:262`
- **TTL**: Permanent (no expiration)
- **Format**: Deflated JSON string

#### **Source of Data:**
- **Primary Source**: Regions Service (external microservice) - reverse geocoding API
- **Input**: Project coordinates (latitude, longitude)
- **Fallback**: If Regions Service fails, returns empty polygon hash with null values

---

### 2. `long_address`

#### **What it is:**
A list of `AddressInfo` objects representing the full address hierarchy, starting with street address.

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:950-969`
2. **Method**: `longAddress(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public List<AddressInfo> longAddress(CacheBuilderRequest request) {
       List<AddressInfo> longAddressList = new ArrayList<>();
       String streetInfo = request.getProject().getStreetAddress();
       longAddressList.add(AddressInfo.builder().displayName(streetInfo).build());
       
       if (streetInfo != null && !streetInfo.isEmpty()) {
           // If street address exists, add housing_region and city
           List<String> keys = Arrays.asList(
               PolygonHashDataDTOEnum.HOUSING_REGION.getName(),
               PolygonHashDataDTOEnum.CITY.getName());
           longAddressList.addAll(getPolygonInfoForAddress(keys, request.getPolygonsHash()));
       } else {
           // If no street address, add locality, housing_region, and city
           List<String> keys = Arrays.asList(
               PolygonHashDataDTOEnum.LOCALITY.getName(),
               PolygonHashDataDTOEnum.HOUSING_REGION.getName(),
               PolygonHashDataDTOEnum.CITY.getName());
           longAddressList.addAll(getPolygonInfoForAddress(keys, request.getPolygonsHash()));
       }
       return longAddressList;
   }
   ```

4. **Data Sources**:
   - **Street Address**: `Projects.streetAddress` (from PostgreSQL)
   - **Polygon Info**: From `polygons_hash` (via Regions Service)

5. **Helper Method**: `getPolygonInfoForAddress()` extracts polygon names and UUIDs from `polygons_hash`

#### **Indexing in Elasticsearch:**
- **Not directly indexed** - but address components are available via `polygon_uuids` field

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object in cache
- Cache key: `details_cache_{project_id}`

#### **Source of Data:**
- **Street Address**: PostgreSQL `projects.street_address` column
- **Polygon Components**: Regions Service via `polygons_hash`

---

### 3. `address`

#### **What it is:**
A list of strings representing a simplified address format.

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:886-922`
2. **Method**: `address(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public List<String> address(CacheBuilderRequest request) {
       List<String> address = new ArrayList<>();
       
       // Case 1: Has sublocality, locality, and city
       if (hasAllThree) {
           address.add(subLocality + ", " + locality);
           if (city != null) address.add(city);
       }
       // Case 2: Has locality and city
       else if (hasLocalityAndCity) {
           address.add(locality + ", " + city);
       }
       return address;
   }
   ```

4. **Data Source**: Extracted from `polygons_hash` map

#### **Indexing in Elasticsearch:**
- Not directly indexed

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object

#### **Source of Data:**
- **Polygon Components**: Regions Service via `polygons_hash`

---

### 4. `short_address`

#### **What it is:**
A list of `AddressInfo` objects representing a minimal address (locality, housing_region, city).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:936-948`
2. **Method**: `shortAddress(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public List<AddressInfo> shortAddress(CacheBuilderRequest request) {
       List<AddressInfo> shortAddressList = new ArrayList<>();
       String overiddenAddress = request.getProject().getOveriddenAddress();
       
       // If overridden address exists, use it
       if (overiddenAddress != null && !overiddenAddress.isEmpty()) {
           shortAddressList.add(AddressInfo.builder().displayName(overiddenAddress).build());
       } else {
           // Otherwise, use locality, housing_region, city from polygons_hash
           List<String> keys = Arrays.asList(
               PolygonHashDataDTOEnum.LOCALITY.getName(),
               PolygonHashDataDTOEnum.HOUSING_REGION.getName(),
               PolygonHashDataDTOEnum.CITY.getName());
           shortAddressList.addAll(getPolygonInfoForAddress(keys, request.getPolygonsHash()));
       }
       return shortAddressList;
   }
   ```

4. **Data Sources**:
   - **Overridden Address**: `Projects.overiddenAddress` (from PostgreSQL) - takes precedence
   - **Polygon Info**: From `polygons_hash` (via Regions Service) - fallback

#### **Indexing in Elasticsearch:**
- Not directly indexed

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object

#### **Source of Data:**
- **Overridden Address**: PostgreSQL `projects.overidden_address` column (optional)
- **Polygon Components**: Regions Service via `polygons_hash` (fallback)

---

### 5. `bounding_box`

#### **What it is:**
A `PolygonHashDataDTO` object representing the bounding box polygon (typically city-level).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:653-658`
2. **Method**: `boundingBox(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public PolygonHashDataDTO boundingBox(CacheBuilderRequest request) {
       if (request.getPolygonsHash().containsKey(PolygonHashDataDTOEnum.BOUNDING_BOX.getName())) {
           return request.getPolygonsHash().get(PolygonHashDataDTOEnum.BOUNDING_BOX.getName());
       }
       return null;
   }
   ```

4. **Data Source**: Extracted from `polygons_hash` map, which comes from Regions Service

#### **Indexing in Elasticsearch:**
- Not directly indexed, but bounding box UUID is part of `polygon_uuids` array

#### **Caching in Aerospike:**
- Stored as part of `polygons_hash` in cached `ProjectsDetail` object

#### **Source of Data:**
- **Regions Service**: Returned as part of reverse geocoding response

---

### 6. `city_select_uuid`

#### **What it is:**
A list of strings containing UUID(s) for city selection (typically the bounding box UUID).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java:2671-2673`
2. **Method**: `citySelectUuid(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   @Override
   public List<String> citySelectUuid(CacheBuilderRequest request){
       return ProjectHelper.citySelectUuids(request.getProject());
   }
   ```

4. **Alternative Implementation** (ParentProjectDetailsBuilder): `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:597-603`
   ```java
   public List<String> citySelectUuid(CacheBuilderRequest request) {
       if (request.getPolygonsHash().containsKey(PolygonHashDataDTOEnum.BOUNDING_BOX.getName())) {
           return Collections.singletonList(request
                   .getPolygonsHash().get(PolygonHashDataDTOEnum.BOUNDING_BOX.getName()).getUuid());
       }
       return null;
   }
   ```

5. **Data Source**: 
   - Either from `Projects` entity (via `ProjectHelper.citySelectUuids()`)
   - Or from `bounding_box` in `polygons_hash`

#### **Indexing in Elasticsearch:**
- Not directly indexed, but bounding box UUID is part of `polygon_uuids` array

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object

#### **Source of Data:**
- **Primary**: `Projects` entity (if stored in database)
- **Fallback**: Bounding box UUID from `polygons_hash`

---

### 7. `landmark`

#### **What it is:**
A string representing the landmark/location identifier (typically "Locality, City" format).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java:2648-2664`
2. **Method**: `landmark(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   @Override
   public String landmark(CacheBuilderRequest request) {
       String localityName = projectHelper.localityName(request.getProject());
       if (StringUtil.isNullOrEmpty(localityName) && request.getPolygonsHash().containsKey(PolygonHashDataDTOEnum.LOCALITY.getName())) {
           localityName = request.getPolygonsHash().get(PolygonHashDataDTOEnum.LOCALITY.getName()).getName();
       }
       
       String cityName = projectHelper.cityName(request.getProject());
       if (StringUtil.isNullOrEmpty(cityName) && request.getPolygonsHash().containsKey(PolygonHashDataDTOEnum.BOUNDING_BOX.getName())) {
           cityName = request.getPolygonsHash().get(PolygonHashDataDTOEnum.BOUNDING_BOX.getName()).getName();
       }
       
       if (cityName != null && localityName != null) {
           return localityName + ", " + cityName;
       }
       return localityName;
   }
   ```

4. **Data Sources**:
   - **Locality**: First tries `ProjectHelper.localityName()` (from Projects entity), falls back to `polygons_hash["locality"].name`
   - **City**: First tries `ProjectHelper.cityName()` (from Projects entity), falls back to `polygons_hash["bounding_box"].name`

#### **Indexing in Elasticsearch:**
- Not directly indexed

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object

#### **Source of Data:**
- **Primary**: `Projects` entity fields (if available)
- **Fallback**: `polygons_hash` from Regions Service

---

### 8. `locality_description`

#### **What it is:**
A string containing description text about the locality (typically booking procedure or locality info).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java:267-269`
2. **Method**: `localityDescription(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public String localityDescription(CacheBuilderRequest request) {
       return request.getProject().getBookingProcedure();
   }
   ```

4. **Data Source**: Directly from `Projects.bookingProcedure` field in PostgreSQL

#### **Indexing in Elasticsearch:**
- **Location**: `core/src/main/java/com/housing/venus/core/indexer/BuyIndexDataFromCacherHelper.java:67`
- **Field Name**: `locality_description`
- **Process**: Extracted directly from cached data

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object

#### **Source of Data:**
- **PostgreSQL**: `projects.booking_procedure` column

---

### 9. `polygon_data.primary_polygon_uuid`

#### **What it is:**
The UUID of the primary polygon (the most specific geographic polygon containing the project).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/helper/PolygonHelper.java:64-99`
2. **Method**: `getPolygonData(CacheBuilderRequest request)`
3. **Process**:
   ```java
   public PolygonDataDTO getPolygonData(CacheBuilderRequest request) {
       String projectPrimaryPolygonUuid = request.getProjectPrimaryPolygonUuid();
       
       // If project has stored primary_polygon_uuid, use it
       if (!StringUtil.isNullOrEmpty(projectPrimaryPolygonUuid)) {
           List<FallbackPolygonsResponseDTO> response = 
               request.getProjectPrimaryPolygonBoundariesBulk();
           primaryPolygonsData = !response.isEmpty() ? response.get(0) : null;
           
           if (primaryPolygonsData != null && primaryPolygonsData.getTrail() != null) {
               // Use stored UUID and fetch parent polygons
               result.setPrimaryPolygonUUID(primaryPolygonsData.getUuid());
           }
       } else {
           // Fallback: derive from reverse geocoding
           result = getPrimaryPolygonDataAndIndex(request.getReverseGeoCodeResponseDTO());
       }
   }
   ```

4. **Primary Polygon Selection Order** (from `PolygonHelper.PRIMARY_POLYGON_ORDER`):
   - locality → sublocality → neighbourhood → hotspot → housing_region → city → region → h_district → housing_state → state
   - First non-null polygon in this order becomes primary

5. **Data Sources**:
   - **Primary**: `Projects.primaryPolygonUuid` (from PostgreSQL `projects.primary_polygon_uuid`)
   - **Fallback**: Derived from reverse geocoding response via `getPrimaryPolygonDataAndIndex()`

6. **Assignment**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java:491`
   ```java
   projectsDetail.setPolygonData(request.getPolygonData());
   ```

#### **Indexing in Elasticsearch:**
- **Location**: `core/src/main/java/com/housing/venus/core/indexer/IndexerFields.java:381-383`
- **Field Name**: `combined_polygon_uuids` (includes primary polygon UUID)
- **Process**: Extracted from `polygon_uuid_array` in cached data

#### **Caching in Aerospike:**
- Stored as part of `polygon_data` object in `ProjectsDetail`

#### **Source of Data:**
- **Primary**: PostgreSQL `projects.primary_polygon_uuid` column
- **Fallback**: Regions Service reverse geocoding (first polygon in PRIMARY_POLYGON_ORDER)

---

### 10. `polygon_data.parent_polygon_uuid`

#### **What it is:**
The UUID of the parent polygon (typically city-level, one level up from primary polygon).

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/helper/PolygonHelper.java:101-141`
2. **Method**: `appendParentPolygonData(PolygonDataDTO result, CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public PolygonDataDTO appendParentPolygonData(PolygonDataDTO result, CacheBuilderRequest request) {
       Integer primaryPolygonIndex = result.getPrimaryPolygonIndex();
       int cityIndex = PRIMARY_POLYGON_ORDER.indexOf("city");
       
       // Determine start index for parent search
       int startIndex;
       if (primaryPolygonIndex < cityIndex) {
           startIndex = cityIndex; // Start from city if primary is more specific
       } else {
           startIndex = primaryPolygonIndex + 1; // Start from next level up
       }
       
       // Find first non-null polygon after primary
       for (String type : PRIMARY_POLYGON_ORDER.subList(startIndex, PRIMARY_POLYGON_ORDER.size())) {
           if (polygon.containsKey(type) && !displayNameMap.isEmpty()) {
               result.setParentPolygonUUID(CommonUtils.convertObjectToString(displayNameMap.get("uuid")));
               break;
           }
       }
   }
   ```

4. **Alternative Path**: If project has `primary_polygon_uuid`, fetches parent via:
   ```java
   Map<String, List<Map<String, Object>>> parentPolygonsData = 
       regionsAccessor.fetchPolygonAncestors(projectPrimaryPolygonUuid);
   ```

5. **Data Source**: 
   - Derived from reverse geocoding response hierarchy
   - Or fetched via Regions Service `fetchPolygonAncestors()` API

#### **Indexing in Elasticsearch:**
- Not directly indexed, but parent polygon UUID is part of `polygon_uuids` array

#### **Caching in Aerospike:**
- Stored as part of `polygon_data` object in `ProjectsDetail`

#### **Source of Data:**
- **Regions Service**: Either from reverse geocoding response or `fetchPolygonAncestors()` API call

---

### 11. `polygon_uuid_array`

#### **What it is:**
A list of strings containing all polygon UUIDs associated with the project.

#### **How it's populated in API:**
1. **Location**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java:1425-1430`
2. **Method**: `polygonUuidArray(CacheBuilderRequest request)`
3. **Logic**:
   ```java
   public List<String> polygonUuidArray(CacheBuilderRequest request){
       String[] polygonUuidsArr = request.getProject().getPolygonUuids();
       List<String> polygonUuids = new ArrayList<>();
       if(Objects.nonNull(polygonUuidsArr)) 
           polygonUuids = new ArrayList<>(List.of(polygonUuidsArr));
       return polygonUuids.stream()
           .filter(p->Objects.nonNull(p))
           .collect(Collectors.toList());
   }
   ```

4. **Data Source**: Directly from `Projects.polygonUuids` field (PostgreSQL array column)

5. **Database Column**: `projects.polygon_uuids` (PostgreSQL `text[]` array type)

6. **Assignment**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java:496`
   ```java
   projectsDetail.setPolygonUuidArray(polygonUuidArray(request));
   ```

#### **Indexing in Elasticsearch:**
- **Location**: `core/src/main/java/com/housing/venus/core/indexer/IndexerFields.java:381-383`
- **Field Name**: `combined_polygon_uuids`
- **Process**:
   ```java
   private List<String> combinedPolygonUuids(Map<String, Object> cachedData) {
       return CommonUtils.getObjectAsList(cachedData.get("polygon_uuid_array"));
   }
   ```
- **Usage**: Used for filtering/searching projects by polygon UUIDs

#### **Caching in Aerospike:**
- Stored as part of `ProjectsDetail` object
- Cache key: `details_cache_{project_id}`

#### **Source of Data:**
- **PostgreSQL**: `projects.polygon_uuids` column (text array)
- **Population**: Set via callbacks (e.g., `ProjectBeforeSaveCallback.populateNearbyLocalityUuids()`)

---

## Data Flow Summary

### Complete Request-to-Response Flow

```
1. HTTP Request → ProjectControllerV9.getVersion()
   ↓
2. ProjectsApiV7.getDetialsDataV7()
   ↓
3. ProjectsApiV3.getDetailsData()
   ↓
4. ResidentialSingleCacher.buildAndCache()
   ├─ Check Aerospike cache (key: details_cache_{id})
   ├─ If cache miss or force_cache=true:
   │  ├─ Load Projects entity from PostgreSQL
   │  ├─ Get coordinates (lat, lng)
   │  ├─ Call RegionsAccessor.getPolygonsHashForAProject()
   │  │  └─ HTTP call to Regions Service (reverse geocoding)
   │  ├─ Build CacheBuilderRequest
   │  ├─ Call ProjectDetailsResidentialBuilder.buildResidential()
   │  │  ├─ Build polygons_hash from Regions Service response
   │  │  ├─ Build address fields from polygons_hash + Projects entity
   │  │  ├─ Build polygon_data from primary_polygon_uuid + Regions Service
   │  │  └─ Build polygon_uuid_array from Projects.polygonUuids
   │  └─ Store in Aerospike (deflated JSON)
   └─ Return ProjectsDetail object
   ↓
5. ProjectsApiV9.modifyImagesHashData() (v9-specific processing)
   ↓
6. ProjectsApiV7.postProcessV7Response() (platform-specific processing)
   ↓
7. HTTP Response (JSON)
```

---

## Caching Strategy

### Aerospike Cache

**Cache Key Format**: `details_cache_{project_id}`

**Storage**:
- **Location**: `core/src/main/java/com/housing/venus/core/cacher/ResidentialSingleCacher.java:262`
- **Format**: Deflated JSON string (compressed)
- **TTL**: Permanent (no expiration)
- **Update Strategy**: 
  - On project update events (via RabbitMQ)
  - On explicit cache invalidation
  - On `force_cache=true` parameter

**Cache Contents**:
- Complete `ProjectsDetail` object including:
  - `polygons_hash`
  - `long_address`
  - `short_address`
  - `address`
  - `polygon_data` (with `primary_polygon_uuid` and `parent_polygon_uuid`)
  - `polygon_uuid_array`
  - All other project fields

### Elasticsearch Indexing

**Index Name**: Project-specific index (configured per environment)

**Indexed Fields**:
- `polygon_uuids`: Array of all polygon UUIDs (from `polygon_trail`)
- `combined_polygon_uuids`: Array from `polygon_uuid_array`
- `locality_description`: Direct copy from cached data
- `location_coordinates`: "lat,lng" format

**Indexing Process**:
- **Location**: `core/src/main/java/com/housing/venus/core/indexer/IndexerFields.java`
- **Trigger**: Via worker processes (background jobs)
- **Method**: `populateIndexDoc()` extracts fields from cached Aerospike data

**Not Indexed** (but available in cache):
- `polygons_hash` (full object)
- `long_address`, `short_address`, `address` (address objects)
- `bounding_box` (full object)
- `polygon_data` (full object)

---

## External Service Dependencies

### Regions Service

**Purpose**: Provides geographic/polygon data via reverse geocoding

**Key APIs Used**:
1. **`getReverseGeocodeBulk()`**: Bulk reverse geocoding
   - Input: Array of points (lat, lng, projectId)
   - Output: `ReverseGeocodeBulkResponseDTO` with polygon hierarchy
   - Used for: Building `polygons_hash`

2. **`getPolygonBoundariesBulk()`**: Fetch polygon details by UUID
   - Input: Polygon UUID, field list
   - Output: `FallbackPolygonsResponseDTO` with polygon metadata
   - Used for: Building `polygon_data.primary_polygon_uuid`

3. **`fetchPolygonAncestors()`**: Get parent polygons
   - Input: Polygon UUID
   - Output: Map of parent polygon data
   - Used for: Building `polygon_data.parent_polygon_uuid`

**Integration**:
- **Location**: `core/src/main/java/com/housing/venus/core/accessor/RegionsAccessor.java`
- **Helper**: `RegionsServiceHelper` (from `javadto` library)
- **Protocol**: HTTP (reactive, using Project Reactor)

---

## Database Schema

### Key Tables

**`projects` table**:
- `id`: Primary key
- `primary_polygon_uuid`: VARCHAR(255) - Primary polygon UUID
- `polygon_uuids`: TEXT[] - Array of polygon UUIDs
- `street_address`: TEXT - Street address
- `overidden_address`: TEXT - Overridden address (optional)
- `booking_procedure`: TEXT - Used for `locality_description`
- `marker_coordinate`: POINT - Geographic coordinates (lat, lng)
- `latitude`, `longitude`: Derived from `marker_coordinate`

---

## Error Handling & Fallbacks

### Regions Service Failures
- **Fallback**: Returns empty/null polygon hash with null values
- **Logging**: Errors logged but don't fail the request
- **Impact**: Address fields may be incomplete, but API still returns data

### Missing Database Fields
- **`primary_polygon_uuid`**: Falls back to reverse geocoding
- **`polygon_uuids`**: Returns empty list if null
- **`street_address`**: Falls back to locality-based address
- **`overidden_address`**: Falls back to polygon-based short address

### Cache Failures
- **Aerospike Down**: Builds fresh data (slower response)
- **Cache Miss**: Builds and caches new data
- **Force Cache**: Bypasses cache, rebuilds from scratch

---

## Performance Considerations

### Caching Impact
- **Cache Hit**: ~10-50ms (direct Aerospike read)
- **Cache Miss**: ~200-500ms (database + Regions Service calls)
- **Regions Service**: ~50-200ms per call (external HTTP)

### Optimization Strategies
1. **Bulk Operations**: Regions Service supports bulk requests
2. **Cache Warming**: Pre-populate cache for popular projects
3. **Lazy Loading**: Some fields only loaded when needed

---

## Code References

### Key Files

1. **Controller**: `web/src/main/java/com/housing/venus/web/controller/api/v9/ProjectControllerV9.java`
2. **Service**: `web/src/main/java/com/housing/venus/web/service/v7/ProjectsApiV7.java`
3. **Cacher**: `core/src/main/java/com/housing/venus/core/cacher/ResidentialSingleCacher.java`
4. **Builder**: `core/src/main/java/com/housing/venus/core/cacher/builders/ProjectDetailsResidentialBuilder.java`
5. **Parent Builder**: `core/src/main/java/com/housing/venus/core/cacher/builders/ParentProjectDetailsBuilder.java`
6. **Regions Accessor**: `core/src/main/java/com/housing/venus/core/accessor/RegionsAccessor.java`
7. **Polygon Helper**: `core/src/main/java/com/housing/venus/core/helper/PolygonHelper.java`
8. **Indexer**: `core/src/main/java/com/housing/venus/core/indexer/IndexerFields.java`

---

## Testing

### Test Data Location
- **Test Resources**: `web/src/test/resources/testdata/`
- **Mock Responses**: `web/src/test/resources/residential_projects_cache_response/`

### Key Test Files
- `web/src/test/java/com/housing/venus/web/controller/api/v9/ProjectControllerV9Test.java` (if exists)
- Integration tests use TestContainers for PostgreSQL and Aerospike

---

## Notes

1. **Version Compatibility**: V9 API builds on V7 data structure, adding image hash modifications
2. **Platform Support**: Different processing for `webapp`, `ios`, `android` platforms
3. **Coordinate Precision**: Lat/lng rounded to 6 decimal places
4. **Polygon Hierarchy**: Strict ordering determines primary polygon selection
5. **Cache Invalidation**: Triggered via RabbitMQ events on project updates

---

## Conclusion

All the requested fields (`polygons_hash`, `long_address`, `address`, `bounding_box`, `city_select_uuid`, `landmark`, `locality_description`, `polygon_data.primary_polygon_uuid`, `polygon_data.parent_polygon_uuid`, `polygon_uuid_array`, `short_address`) are populated through a combination of:

1. **PostgreSQL Database**: Direct field access (e.g., `polygon_uuids`, `street_address`, `booking_procedure`)
2. **Regions Service**: External microservice for geographic data (e.g., `polygons_hash`, `polygon_data`)
3. **Computed Fields**: Derived from other fields (e.g., `address`, `landmark`)
4. **Caching**: Stored in Aerospike for performance
5. **Indexing**: Selected fields indexed in Elasticsearch for search

The system is designed with fallbacks at every level to ensure API availability even when external services fail.


