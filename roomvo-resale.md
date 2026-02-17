# Vendor field mapping: Rent & Resale property APIs (Roomvo)

This document describes how to map the **Rent** and **Resale** property detail API responses to **Roomvo**’s required output fields. Use it together with the list of listing IDs provided to Roomvo; each ID is used in the API path to fetch one listing.

---

## API endpoints

| Listing type | Endpoint pattern | Example |
|--------------|------------------|---------|
| **Resale**   | `https://casa.housing.com/api/v2/flat/{id}/resale/details?api_name=RESALE_DEDICATED_DETAILS&source=web` | `.../flat/18151449/resale/details?...` |
| **Rent**     | `https://casa.housing.com/api/v2/flat/{id}/rent/details?api_name=RESALE_DEDICATED_DETAILS&source=web`   | `.../flat/19396122/rent/details?...`   |

Replace `{id}` with the listing ID from your provided list. The response is JSON with a top-level `data` object; all paths below are relative to `data` unless stated otherwise.

---

## Fields to hardcode (no mapping from API)

| Roomvo field     | Value to use        |
|------------------|----------------------|
| `currency`       | `INR`                |
| `listing_status` | `active`             |
| `country`        | `India`              |
| `postal_code`    | Not present with us (use empty string or null as agreed) |
| `listing_source` | `Not applicable`    |

---

## Fields to map from API response

### `listing` and `canonical_listing`

- **Roomvo expectation:** String ID for the listing (same value for both).
- **Mapping:** Use the listing ID you used in the API URL.
  - From response: `data.id` (number) — use as string, e.g. `String(data.id)`.
- **Example:** `"18151449"` (resale), `"19396122"` (rent).

---

### `listing_price` (range: min / max)

- **Roomvo expectation:** Price range (min and max). For rent/resale, typically a single price (min = max).
- **Mapping:**
  - Use `data.inventory_configs`.
  - If there is **one** config: use `inventory_configs[0].price` for both min and max.
  - If there are **multiple** configs:  
    - **min** = minimum of `inventory_configs[].price`  
    - **max** = maximum of `inventory_configs[].price`
- **API path:** `data.inventory_configs[].price` (numeric, in INR).
- **Example:** Resale with one config: min = 4100000, max = 4100000.

---

### `listing_type`

- **Roomvo expectation:** `rent` | `resale` | `project`.
- **Mapping:** Set from the API you called:
  - **Resale** endpoint → `"resale"`.
  - **Rent** endpoint → `"rent"`.

---

### `size_sqft` (range: min / max)

- **Roomvo expectation:** Area range in sq.ft. For rent/resale, usually a single value (min = max).
- **Mapping:**
  - Use `data.inventory_configs`.
  - Prefer built-up / super built-up area: `inventory_configs[].area_in_sq_ft` or `inventory_configs[].area` (both in sq.ft in the sample).
  - If **one** config: use that value for both min and max.
  - If **multiple** configs:  
    - **min** = minimum of the chosen area field  
    - **max** = maximum of the chosen area field
- **API path:** `data.inventory_configs[].area_in_sq_ft` or `data.inventory_configs[].area`.
- **Example:** 700 sq.ft → min = 700, max = 700.

---

### `year_built`

- **Roomvo expectation:** Possession date / construction completion date (e.g. year).
- **Mapping:**
  - Prefer **`data.possession_date`** if available: parse the date and derive the **year** (e.g. for "2025-12-29" use 2025).
  - If `possession_date` is null or missing: use **`data.age_of_property`** (number, age in years). This is usually present for ready-to-move-in properties. Derive year as **current year − age_of_property** (e.g. if age is 2 and current year is 2026, year_built = 2024).
  - If both are missing: leave empty or null as per Roomvo’s convention.
- **API paths:** `data.possession_date` (ISO date string or null); `data.age_of_property` (number, years).

---

### `building_type`

- **Roomvo expectation:** Category such as apartment, independent_house, villa, plot, studio.
- **Mapping:** Derive from **`data.inventory_configs[0].property_type`** (or the primary config). The API returns the **name** from the property type list. Possible values (use as returned, or map to your allowed set):
  - **Apartment**
  - **Independent House**
  - **Independent Floor**
  - **Plot**
  - **Studio**
  - **Duplex**
  - **Penthouse**
  - **Row House**
  - **Villa**
  - **Agricultural Land**
  - Use a default (e.g. `apartment`) for unknown or missing values.
- **API path:** `data.inventory_configs[0].property_type` (string; API uses the type’s `name`).

---

### `property_type`

- **Roomvo expectation:** Configuration label like "1 BHK", "2 BHK", "3 BHK". Single value for rent/resale.
- **Mapping:** Use **`data.inventory_configs[0].apartment_type`**. The API returns the **name** from the apartment type list. Possible values (use as returned):
  - **1 RK**
  - **1 BHK**
  - **2 BHK**
  - **3 BHK**
  - **4 BHK**
  - **5 BHK**
  - **5+ BHK**
  - If multiple configs, use the first or the one you treat as primary.
- **API path:** `data.inventory_configs[0].apartment_type` (string; API uses the type’s `name`).
- **Example:** `"1 BHK"`, `"2 BHK"`, `"1 RK"`.

---

### `url`

- **Roomvo expectation:** Canonical URL of the property listing.
- **Mapping:**
  - Use **`data.inventory_canonical_url`** (path only).
  - Prepend your base domain, e.g. `https://www.housing.com` + `inventory_canonical_url`.
  - Resale example path: `/in/buy/resale/page/18151449-1-bhk-studio-in-jait-for-rs-4100000`
  - Rent example path: `/in/rent/...` (path structure may vary; use the returned value as-is).
- **API path:** `data.inventory_canonical_url` (string).

---

### `street_address`

- **Roomvo expectation:** Short address or full address line.
- **Mapping:** Prefer **`data.street_info`** if present and non-empty; otherwise use **`data.address`**.
  - `address` is an array of strings (e.g. locality, city); join with `", "` or similar.
- **API paths:**
  - `data.street_info` (string, e.g. "Ram Tal Crossing On Vip Road Vrindavan")
  - `data.address` (array of strings, e.g. `["Jait", "Vrindavan"]`)
- **Example:** `street_info` → "Ram Tal Crossing On Vip Road Vrindavan"; fallback: "Jait, Vrindavan".

---

### `city`

- **Roomvo expectation:** City name.
- **Mapping:** Prefer **`data.polygons_hash.city.name`**. If not available, use **`data.polygons_hash.bounding_box.name`**.
- **API paths:** `data.polygons_hash.city.name` (string); fallback: `data.polygons_hash.bounding_box.name` (string).
- **Example:** "Vrindavan", "Greater Noida".

---

### `state`

- **Roomvo expectation:** State name.
- **Mapping:** Prefer **`data.polygons_hash.state.name`**. If not present, use **`data.polygons_hash.housing_state.name`**.
- **API paths:** `data.polygons_hash.state.name` (string); fallback: `data.polygons_hash.housing_state.name` (string).
- **Example:** "Uttar Pradesh", "Haryana".

---

### `brokerage`

- **Roomvo expectation:** Brokerage amount or indicator.
- **Mapping:** Use **`data.inventory_configs[0].brokerage`** (numeric).
  - Note: **Brokerage can be 0 even when `is_brokerage_chargeable` is false.** Roomvo should handle this accordingly (e.g. do not infer “no brokerage” from the numeric value alone).
- **API path:** `data.inventory_configs[0].brokerage`.

---

### `agent`

- **Roomvo expectation:** Name of the primary agent/seller.
- **Mapping:** **`data.sellers_info[0].name`**.
  - If `sellers_info` is empty or missing, use empty string or null.
- **API path:** `data.sellers_info[0].name` (string).
- **Example:** "OMNI INFRA".

---

## Response shape reference (relevant parts)

```text
data
├── id                          → listing / canonical_listing
├── inventory_configs[]          → listing_price, size_sqft, building_type, property_type, brokerage
│   ├── price
│   ├── area_in_sq_ft / area
│   ├── property_type           → building_type
│   ├── apartment_type          → property_type
│   └── brokerage
├── possession_date             → year_built (prefer; derive year)
├── age_of_property             → year_built (fallback for ready-to-move; current_year − age)
├── inventory_canonical_url      → url (prepend base domain)
├── street_info                  → street_address (prefer)
├── address[]                    → street_address (fallback)
├── polygons_hash
│   ├── city.name                → city (prefer)
│   ├── bounding_box.name        → city (fallback)
│   ├── state.name               → state (prefer)
│   └── housing_state.name       → state (fallback)
└── sellers_info[0].name         → agent
```

---

## Notes

- **Missing or null:** For any optional field, if the API value is null/empty, follow Roomvo’s convention (empty string, null, or omit).
- **Multiple `inventory_configs`:** When multiple configurations exist, document whether you use the first config only or aggregate (e.g. min/max price and size) so behaviour is consistent.
- **Rent vs resale:** The response structure is the same; only the endpoint and `listing_type` differ.
