# Color Atelier — Report Generator (Netlify Function)

This turns a Tally form submission into a finished, print-ready Color Atelier
client report (10 pages: 6 personalized + 4 fixed reference pages).

## What you already have
- A domain
- Netlify hosting (with at least one prior deploy)
- A Tally account
- A Make account, with a scenario: Tally webhook → HTTP (call this function) → Gmail (email the result)

## What this package contains
```
netlify.toml                          <- Netlify config
package.json                          <- dependencies
netlify/functions/generate-report.js  <- the function that builds the report
templates/report-template.html        <- the report layout (don't edit unless
                                          you also update generate-report.js
                                          to match any id changes)
data/subseason-full-data.json         <- locked palette/driver/sister/metal
                                          data for all 12 subseasons
```

## The Tally form — current field list

The report now only needs **5 photos** (down from 23) and a handful of text
fields. Everything you write in ChatGPT (the feature analysis, the metal-test
description) goes into two free-text fields rather than many small ones.

**The question titles in Tally must match these exactly** (case-insensitive):

| Tally question title | Type | Notes |
|---|---|---|
| Client Name | short text | |
| Subseason | **Dropdown** | exact options: Light Spring, True Spring, Bright Spring, Light Summer, True Summer, Soft Summer, Soft Autumn, True Autumn, Deep Autumn, Deep Winter, True Winter, Bright Winter |
| Report Date | short text | e.g. "June 2026" |
| Overview Summary | **long text / textarea** | despite the name, this holds the *entire* hair/brows/eyes/features/skin write-up from ChatGPT, with each feature's temperature/value/chroma commentary woven into the prose. Paragraph breaks are preserved in the final report. Lands on Page 2. |
| Gold and Silver Test | long text | what you/ChatGPT observed in the gold vs silver test |
| Cover Photo | **file upload** | client's neutral "mystery" portrait for Page 1 — plain turtleneck, not yet color-matched |
| Overview Picture | **file upload** | the "reveal" portrait for Page 2 — client in her best color, separate photo from Cover Photo |
| Gold and Silver Test Photo | file upload | one photo showing the metal-test result |
| Best 10 Colors | file upload | one collage image showing all 10 best colors on the client (generated in ChatGPT as a single image) |
| Your 10 Not-Your-Colors | file upload | one collage image showing all 10 not-colors on the client |

That's 11 fields total — 6 text, 5 photo uploads.

> **Page 4** (the season palette, sister subseasons, swatches) and the
> **gold/silver result line** (e.g. "Gold is your harmony") are fully
> generated from the locked subseason data — nothing to fill in for those.

## Step 1 — Deploy this to Netlify

Push these files to the GitHub repo connected to your Netlify site (root of
the repo, not inside a subfolder), then trigger a deploy. Once published,
your function lives at:
```
https://YOUR-SITE-NAME.netlify.app/.netlify/functions/generate-report
```

## Step 2 — Build the Tally form

Use the field list above. Make sure file upload fields are configured to
accept images.

## Step 3 — Connect Tally → Make → this function → email

1. In Tally: Integrations → Webhooks → point at your Make scenario's webhook URL
2. In Make: Webhooks (Custom webhook) → HTTP (Make a request: POST, `application/json` body, pointed at your Netlify function URL, body content = the webhook's raw `data` field) → Gmail (Send an email, with the HTTP step's `Data` output attached as `report.html`)

## Notes on the locked data

`data/subseason-full-data.json` contains, for all 12 subseasons: the tag
line, family (Spring/Summer/Autumn/Winter), best/worst 10 named colors with
hex values, sister subseasons, and gold/silver metal guidance. Page 4's
palette and sister-subseason swatches, and the gold/silver result text on
page 3, are generated from this file — never typed in by hand.

If you ever want to adjust a hex value, a color name, or which two
subseasons count as "sisters," edit this JSON file directly and redeploy —
no need to touch the function code.

## Testing without Tally

`test-payload.json` and `test-run.js` let you test the function locally with
Node before connecting Tally:
```
node test-run.js
```
This writes `test-output.html`, which you can open directly in a browser.
