# 🇵🇰 LawMate — Scraped Laws API Documentation

## Overview

These APIs scrape Pakistani government law websites, enrich each law with AI-generated
bilingual content (English + Urdu), and store everything in MongoDB.

---

## ⚙️ Setup

### 1. Add to your `.env` file:
```
ANTHROPIC_API_KEY=your_key_here   ← Get from https://console.anthropic.com/
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
```

### 2. All endpoints require JWT in header:
```
Authorization: Bearer <your_token>
```

---

## 📡 Available Sources

| Source Key     | Province / Level      | Website                          |
|----------------|-----------------------|----------------------------------|
| `federal`      | Federal Pakistan      | pakistancode.gov.pk              |
| `sindh`        | Sindh Province        | sindhlaws.gov.pk                 |
| `punjab`       | Punjab Province       | punjablaws.gov.pk                |
| `kpk`          | KPK Province          | kpcode.kp.gov.pk                 |
| `balochistan`  | Balochistan Province  | balochistancode.gob.pk           |

---

## 📋 API Endpoints

---

### 1. 🚀 Trigger Scraping + AI Enrichment
**`POST /api/scraped-laws/:source/fetch`**

Scrapes the government website for that source and saves all laws to MongoDB.
Each law is automatically enriched with AI (summary, key points, example, description in EN + UR).

This runs in the **background** — you get an immediate response and laws populate over time.

**Example:**
```
POST /api/scraped-laws/federal/fetch
POST /api/scraped-laws/sindh/fetch
POST /api/scraped-laws/punjab/fetch
POST /api/scraped-laws/kpk/fetch
POST /api/scraped-laws/balochistan/fetch
```

**Response:**
```json
{
  "success": true,
  "msg": "Scraping started for Federal Pakistan. This runs in background. Check GET /api/scraped-laws/federal to see progress."
}
```

> ⚠️ Only trigger once per source. After that, data is in MongoDB. Re-triggering will skip already-saved laws.

---

### 2. 📊 Check Scraping Progress
**`GET /api/scraped-laws/:source/status`**

Shows how many laws have been scraped and AI-enriched.

**Example:**
```
GET /api/scraped-laws/sindh/status
```

**Response:**
```json
{
  "success": true,
  "source": "sindh",
  "sourceLabel": "Sindh Province",
  "stats": {
    "total": 450,
    "enriched": 312,
    "pending": 138,
    "percentComplete": 69
  }
}
```

---

### 3. 📜 Get All Laws for a Source (Paginated)
**`GET /api/scraped-laws/:source`**

Returns all stored laws. Supports language toggle, pagination, and search.

**Query Parameters:**

| Param    | Default | Description                              |
|----------|---------|------------------------------------------|
| `lang`   | `en`    | Language: `en` (English) or `ur` (Urdu) |
| `page`   | `1`     | Page number                              |
| `limit`  | `20`    | Results per page                         |
| `search` | `""`    | Search by law title                      |

**Examples:**
```
GET /api/scraped-laws/federal?lang=en&page=1&limit=20
GET /api/scraped-laws/sindh?lang=ur&page=2
GET /api/scraped-laws/punjab?lang=en&search=property
GET /api/scraped-laws/kpk?lang=ur&search=زمین
```

**Response:**
```json
{
  "success": true,
  "source": "sindh",
  "sourceLabel": "Sindh Province",
  "language": "en",
  "total": 450,
  "page": 1,
  "limit": 20,
  "totalPages": 23,
  "laws": [
    {
      "id": "64abc123...",
      "source": "sindh",
      "title": "Sindh Agricultural Land Ceiling Act 1977",
      "summary": "This law sets a maximum limit on how much agricultural land...",
      "keyPoints": [
        "No person can hold more than 100 acres of irrigated land",
        "Excess land is acquired by the government",
        "Landowners receive compensation for acquired land",
        "Tenant farmers get priority for redistributed land",
        "Violations result in penalties and forfeiture"
      ],
      "link": "https://www.sindhlaws.gov.pk/...",
      "isEnriched": true
    }
  ]
}
```

---

### 4. 🔍 Get Single Law (Full Detail)
**`GET /api/scraped-laws/:source/:id`**

Returns complete detail of one law including real-life example and full description.

**Query Parameters:**
- `lang`: `en` or `ur`

**Example:**
```
GET /api/scraped-laws/sindh/64abc123def456?lang=en
GET /api/scraped-laws/federal/64abc123def456?lang=ur
```

**Response:**
```json
{
  "success": true,
  "language": "en",
  "law": {
    "id": "64abc123...",
    "source": "sindh",
    "title": "Sindh Agricultural Land Ceiling Act 1977",
    "summary": "This law sets a maximum limit on agricultural land ownership...",
    "keyPoints": [
      "No person can hold more than 100 acres of irrigated land",
      "Excess land is acquired by the government",
      "Tenant farmers get priority for redistributed land"
    ],
    "realLifeExample": "Ahmed owns 250 acres of irrigated farmland in Larkana. Under this Act, he can only legally retain 100 acres. The remaining 150 acres are acquired by the Sindh government, which then redistributes this land to landless tenant farmers like Ghulam, who has been farming the same land for 20 years...",
    "description": "The Sindh Agricultural Land Ceiling Act of 1977 was enacted to address deep inequalities in land ownership in rural Sindh. The law caps individual land holdings at specified maximums and creates a mechanism for redistributing excess land...",
    "link": "https://www.sindhlaws.gov.pk/...",
    "titleAlt": "سندھ زرعی زمین سیلنگ ایکٹ 1977",
    "isEnriched": true,
    "enrichedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 5. 🔄 Re-Enrich a Law with AI
**`POST /api/scraped-laws/:source/:id/enrich`**

Manually triggers AI re-enrichment for a single law (if content was wrong or missing).

**Example:**
```
POST /api/scraped-laws/punjab/64abc123def456/enrich
```

---

### 6. ⚡ Bulk Re-Enrich Every Pending Law for a Source
**`POST /api/scraped-laws/:source/enrich-all`**

Re-enriches every law for a source where `isEnriched` is still `false`, in one
call, instead of calling endpoint #5 once per law. Runs in the background —
responds immediately, then check progress via endpoint #2 (status).

**Example:**
```
POST /api/scraped-laws/federal/enrich-all
```

**When to use this:** after fixing an enrichment problem (e.g. an expired/
retired AI model string, or adding billing credit) so every law that's stuck
on "Processing" gets retried in one shot, rather than one request per law.

---

### 7. 🧹 Clean Up Non-Law Entries
**`DELETE /api/scraped-laws/:source/cleanup-junk`**

Removes already-saved entries that are actually site navigation labels
("About Us", "Contact Us", "Category Wise", a bare "Amendment" with no real
act name attached, etc.) rather than real laws — these can end up saved if
they were scraped before the title filter in `scraperService.js` existed or
was strengthened. Re-scraping alone does **not** remove these; it only stops
new junk from being saved going forward. Pass `all` as the source to clean
every source in one call.

**Example:**
```
DELETE /api/scraped-laws/federal/cleanup-junk
DELETE /api/scraped-laws/all/cleanup-junk
```

**Response:**
```json
{
  "success": true,
  "msg": "Removed 5 non-law entries.",
  "deletedCount": 5,
  "deletedTitles": ["About Us", "Amendment", "Category Wise", "Contact Us", "Document Retrieval"]
}
```

---

## 📱 How to Use in Your App (Frontend)

### Language Selector:
```
User selects "English" → call API with ?lang=en
User selects "اردو"     → call API with ?lang=ur
```

### Province Selector:
```
"Federal Laws"   → GET /api/scraped-laws/federal
"Sindh"          → GET /api/scraped-laws/sindh
"Punjab"         → GET /api/scraped-laws/punjab
"KPK"            → GET /api/scraped-laws/kpk
"Balochistan"    → GET /api/scraped-laws/balochistan
```

### Law Detail Screen:
```
User taps a law → GET /api/scraped-laws/:source/:id?lang=en
Show: title, summary, keyPoints, realLifeExample, description
"Read Full Law" button → open law.link in WebView
```

---

## 🗃️ Data Structure in MongoDB (ScrapedLaw model)

```
source          : "federal" | "sindh" | "punjab" | "kpk" | "balochistan"
title.en        : English title
title.ur        : Urdu title
summary.en      : 5-6 line English summary
summary.ur      : 5-6 line Urdu summary
keyPoints.en    : [ "point1", "point2", ... ]
keyPoints.ur    : [ "نکتہ1", "نکتہ2", ... ]
realLifeExample.en : Real-life scenario in English
realLifeExample.ur : Real-life scenario in Urdu
description.en  : 8-9 line detailed description in English
description.ur  : 8-9 line detailed description in Urdu
link            : Original government website URL
isEnriched      : true/false
enrichedAt      : Date when AI enrichment was done
```
