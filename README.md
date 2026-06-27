# Color Atelier — Report Generator (Netlify Function)

This turns a Tally form submission into a finished, print-ready Color Atelier
client report (10 pages: 6 personalized + 4 fixed reference pages).

## What you already have
- A domain
- Netlify hosting (with at least one prior deploy)
- A Tally account

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

## Step 1 — Deploy this to Netlify

If you already have a Netlify site connected to a Git repo, add these files
to that repo (in the repo root) and push. Netlify will pick up
`netlify.toml` and deploy the function automatically.

If you don't have a repo yet for this: create a new GitHub repo, add these
files, connect it to a new Netlify site (Netlify dashboard → "Add new site"
→ "Import an existing project"), and deploy.

Once deployed, your function will be live at:
```
https://YOUR-SITE-NAME.netlify.app/.netlify/functions/generate-report
```
This is the URL Tally will send submissions to.

## Step 2 — Build the Tally form

Create a new Tally form with these exact questions. **The question titles
must match the labels below exactly** (case-insensitive, but otherwise
exact) — that's how the function knows which field is which.

### Text fields
| Tally question title | Notes |
|---|---|
| Client Name | short text |
| Subseason | **must be a Dropdown/Select field**, with these 12 exact options: Light Spring, True Spring, Bright Spring, Light Summer, True Summer, Soft Summer, Soft Autumn, True Autumn, Deep Autumn, Deep Winter, True Winter, Bright Winter |
| Report Date | short text, e.g. "June 2026" |
| Overview Summary | short text — one sentence |
| Hair Description | short text |
| Hair Temperature | Dropdown: High / Medium / Low |
| Hair Value | Dropdown: High / Medium / Low |
| Hair Chroma | Dropdown: High / Medium / Low |
| Brow Description | short text |
| Brow Temperature | Dropdown: High / Medium / Low |
| Brow Value | Dropdown: High / Medium / Low |
| Brow Chroma | Dropdown: High / Medium / Low |
| Eye Description | short text |
| Eye Temperature | Dropdown: High / Medium / Low |
| Eye Value | Dropdown: High / Medium / Low |
| Eye Chroma | Dropdown: High / Medium / Low |
| Features Description | short text |
| Features Temperature | Dropdown: High / Medium / Low |
| Features Value | Dropdown: High / Medium / Low |
| Features Chroma | Dropdown: High / Medium / Low |
| Skin Description | short text |
| Skin Temperature | Dropdown: High / Medium / Low |
| Skin Value | Dropdown: High / Medium / Low |
| Skin Chroma | Dropdown: High / Medium / Low |
| Gold Description | short text |
| Silver Description | short text |

> The Feature Analysis text fields (Hair/Brow/Eye/Features/Skin Description,
> and Overview Summary) are the parts you write in ChatGPT and paste in —
> everything else on the report is either a dropdown choice or a photo.

### File upload fields
| Tally question title | Notes |
|---|---|
| Cover Photo | single file upload |
| Gold Photo | single file upload |
| Silver Photo | single file upload |
| Best Color Photo 1 ... Best Color Photo 10 | 10 separate single-file uploads |
| Not-Color Photo 1 ... Not-Color Photo 10 | 10 separate single-file uploads |

That's 23 photo upload fields total. Tedious to build once in Tally, but
after that it's reusable for every client.

> **Important — color order matters.** "Best Color Photo 1" must correspond
> to the *first* of that subseason's 10 best colors, in the same order shown
> on the prompt library tool (the one with the "Copy prompt" buttons) you
> already have. If you generate the 10 best-color photos in that same
> top-to-bottom order and upload them in that order, the labels will line up
> correctly with the photos automatically.

## Step 3 — Connect the Tally webhook

In Tally: open your form → **Integrations** → **Webhooks** → add a new
webhook → paste your Netlify function URL from Step 1 → save.

Tally will now POST every submission to your function, which returns the
finished report HTML.

## Step 4 — Get the finished report to look at

The function returns the report as raw HTML in the response body. Exactly
how you *see* that depends on what you connect after the webhook — a few
options, roughly easiest to most capable:

1. **Quickest for now:** use a tool like Zapier or Make between Tally and
   this function to catch the HTML response and email it to yourself as an
   attachment, or save it to Google Drive.
2. **Cleaner long-term:** extend the function (ask me when you're ready) to
   upload the finished HTML to a storage bucket and respond to Tally with a
   link instead of the raw HTML — then Tally's own "redirect to URL" or
   confirmation-page settings can show you the link immediately after
   submitting.

Either way, once you have the HTML file, open it in a browser and use
Print → Save as PDF (paper size A4, margins None) exactly as before.

## Notes on the locked data

`data/subseason-full-data.json` contains, for all 12 subseasons: the tag
line, family (Spring/Summer/Autumn/Winter), best/worst 10 named colors with
hex values, sister subseasons, and gold/silver metal guidance. This is the
same data already baked into the reference pages (7–10) of the report —
pages 4, 5, and 6 are generated from this same source, so the personalized
pages and the reference chart will never disagree with each other.

If you ever want to adjust a hex value, a color name, or which two
subseasons count as "sisters," edit this JSON file directly and redeploy —
no need to touch the function code.

## Testing without Tally

`test-payload.json` and `test-run.js` (in this package) let you test the
function locally with Node before connecting Tally, in case you want to
verify a change:
```
node test-run.js
```
This writes `test-output.html`, which you can open directly in a browser.
