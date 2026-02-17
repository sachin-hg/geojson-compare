# Vendor field mapping: Project (new development) API (Roomvo)

This document describes how to map the **Project** (new development) property detail API response to **Roomvo**’s required output fields. Use it together with the list of project IDs provided to Roomvo; each ID is used in the API path to fetch one project.

---

## API endpoint

| Listing type | Endpoint pattern | Example |
|--------------|------------------|---------|
| **Project**  | `https://venus.housing.com/api/v9/new-projects/{id}/webapp?fixed_images_hash=true&include_derived_floor_plan=true&api_name=PROJECT_DEDICATED_DETAILS&source=web` | `.../new-projects/305972/webapp?...` |

Replace `{id}` with the project ID from your provided list. The response is JSON with a top-level `data` object; all paths below are relative to `data` unless stated otherwise.

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

- **Roomvo expectation:** String ID for the project (same value for both).
- **Mapping:** Use the project ID you used in the API URL.
  - From response: you can confirm with `data.id` if present, or use the same `{id}` from the path. Output as string (e.g. `"305972"`).
- **Example:** `"305972"`.

---

### `listing_price` (range: min / max)

- **Roomvo expectation:** Price range (min and max). Projects can have multiple configurations, so min and max may differ.
- **Mapping:** Use **`data.inventory_configs[].actual_price`**.
  - **Min price** = minimum of `inventory_configs[].actual_price`.
  - **Max price** = maximum of `inventory_configs[].actual_price`.
- **API path:** `data.inventory_configs[].actual_price` (numeric).

---

### `listing_type`

- **Roomvo expectation:** `rent` | `resale` | `project`.
- **Mapping:** Always **`"project"`** for this API.

---

### `size_sqft` (range: min / max)

- **Roomvo expectation:** Area range in sq.ft. For projects, this is often a range (min ≠ max) across different unit types.
- **Mapping:** Use **`data.inventory_configs[].area_information[0].value`** for area. Assume unit is **sq.ft** unless otherwise indicated.
  - If **`area_information[0].value`** is not available, use **`data.inventory_configs[].selected_area_in_unit`** (or equivalent) and convert to sq.ft if needed.
  - **Min** = minimum of area values across configs; **max** = maximum of area values across configs.
- **API paths:** `data.inventory_configs[].area_information[0].value` (primary); fallback: `data.inventory_configs[].selected_area_in_unit`.

---

### `year_built`

- **Roomvo expectation:** Possession date / construction completion date (e.g. year).
- **Mapping:** Use **`data.possession_date`**. If present, parse the date and derive the **year** (e.g. for "2025-12-31" use 2025). If null or missing, leave empty or null as per Roomvo’s convention.
- **API path:** `data.possession_date` (ISO date string or null).

---

### `building_type`

- **Roomvo expectation:** Category such as apartment, independent_house, villa, plot, studio.
- **Mapping:** Use **`data.inventory_configs[0].property_type`** (or aggregate from **`data.inventory_configs[].property_type`**). Projects can have **multiple** property types across configs; pass the value(s) as returned or map to your allowed set. Use a default (e.g. `apartment`) when missing.
- **API path:** `data.inventory_configs[].property_type` (string; can be multiple across configs).

---

### `property_type`

- **Roomvo expectation:** Configuration label(s) like "1 BHK", "2 BHK". For projects, **multiple** values are allowed (array or comma-separated).
- **Mapping:** Use **`data.inventory_configs[].apartment_group_name`**. Collect unique values across configs for the list (e.g. `["3 BHK", "4 BHK"]` or `"3 BHK, 4 BHK"` as per Roomvo’s format).
- **API path:** `data.inventory_configs[].apartment_group_name` (string; one per config; aggregate for multiple).
- **Example:** Configs with apartment_group_name "3 BHK" and "4 BHK" → ["3 BHK", "4 BHK"] or "3 BHK, 4 BHK".

---

### `url`

- **Roomvo expectation:** Canonical URL of the project listing.
- **Mapping:**
  - Prefer **`data.parent_canonical_url`** if it represents the correct project page (path only).
  - Otherwise construct from project ID, e.g. **`/in/buy/projects/page/{id}-{slug}`**. If the API returns a **canonical_url** or **project_url** for this project, use that.
  - Prepend your base domain (e.g. `https://www.housing.com`).
- **API path:** `data.parent_canonical_url` (string). Example: `/in/buy/projects/page/328297-dlf-the-ultima-by-dlf-in-sector-81`.
- **Note:** `parent_canonical_url` may point to a parent project; if you have a project-specific canonical URL in the response, use that for accuracy.

---

### `street_address`

- **Roomvo expectation:** Short address or full address line.
- **Mapping:** Prefer **`data.street_info`** if present. Otherwise use **`data.address`** (array of strings; use the first element or join with `", "`).
- **API paths:** `data.street_info` (string, prefer); fallback: `data.address[0]` or `data.address.join(", ")`.
- **Example:** "Sector 81, Gurgaon".

---

### `city`

- **Roomvo expectation:** City name.
- **Mapping:** Prefer **`data.polygons_hash.city.name`**. If not available, use **`data.polygons_hash.bounding_box.name`**.
- **API paths:** `data.polygons_hash.city.name` (string); fallback: `data.polygons_hash.bounding_box.name` (string).
- **Example:** "Gurgaon".

---

### `state`

- **Roomvo expectation:** State name.
- **Mapping:** Prefer **`data.polygons_hash.state.name`**. If not present, use **`data.polygons_hash.housing_state.name`**.
- **API paths:** `data.polygons_hash.state.name` (string); fallback: `data.polygons_hash.housing_state.name` (string).
- **Example:** "Haryana".

---

### `brokerage`

- **Roomvo expectation:** Brokerage amount or indicator.
- **Mapping:** Projects are typically sold by the developer; brokerage is usually not applicable.
  - Use **`0`** or **empty string** or **null** as agreed with Roomvo.
- **API path:** Not applicable; hardcode or leave empty.

---

### `agent`

- **Roomvo expectation:** Name of the primary agent/seller. For projects, this is often the developer.
- **Mapping:**
  - If the API returns **developer** or **builder** info (e.g. `data.developer_information`, `data.builder_name`, or similar), use the primary developer/builder name.
  - If no such field exists, use **empty string** or **null** and document that project listings do not have an agent in the same sense as rent/resale.
- **API path:** Any `data.developer_information`, `data.builder_name`, or equivalent in your response. The sample project response did not include a top-level agent/seller; check the full response for developer-related fields.

---

## Response shape reference (relevant parts)

```text
data
├── id (or use URL {id})         → listing / canonical_listing
├── possession_date              → year_built (derive year)
├── parent_canonical_url         → url (prepend base domain)
├── street_info                  → street_address (prefer)
├── address[]                    → street_address (fallback)
├── polygons_hash
│   ├── city.name                → city (prefer)
│   ├── bounding_box.name        → city (fallback)
│   ├── state.name               → state (prefer)
│   └── housing_state.name       → state (fallback)
├── inventory_configs[]
│   ├── actual_price            → listing_price (min/max range)
│   ├── area_information[0].value → size_sqft (assume sq.ft); else selected_area_in_unit
│   ├── property_type            → building_type (multiple)
│   └── apartment_group_name    → property_type (multiple)
└── developer_* / builder_*      → agent (if present)
```

---

## Notes

- **Missing or null:** For any optional field, if the API value is null/empty, follow Roomvo’s convention (empty string, null, or omit).
- **Price/size ranges:** Project APIs may expose only formatted strings (e.g. "3.28 Cr"). Document whether Roomvo needs numeric values and, if so, how you parse or back-fill (e.g. from config-level data).
- **Multiple configurations:** For `property_type` and size/price ranges, prefer aggregating from config-level data when available for consistency with rent/resale mapping.
- **Canonical URL:** Prefer a project-specific canonical URL over a parent project URL when the API provides it.
