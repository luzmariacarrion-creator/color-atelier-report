// netlify/functions/generate-report.js
//
// Receives a Tally webhook submission (optionally forwarded through Make),
// builds the Color Atelier client report HTML, and returns it.
//
// Field matching is done by TALLY FIELD LABEL TEXT, not by Tally's internal
// field IDs, because internal IDs change if the form is edited. Make sure
// the labels in your Tally form match the FIELD_LABELS map below exactly
// (case-insensitive, trimmed).

const fs = require("fs");
const path = require("path");

// File locations differ between local development (real repo folder
// structure) and Netlify's deployed function bundle (flattened, with
// included_files placed alongside the function at the same root). Try the
// Netlify-deployed layout first, then fall back to the local-dev layout.
function readFirstExisting(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`None of these paths exist: ${candidates.join(", ")}`);
}

const SUBSEASON_DATA = JSON.parse(
  readFirstExisting([
    path.join(__dirname, "data", "subseason-full-data.json"),
    path.join(__dirname, "..", "..", "data", "subseason-full-data.json"),
  ])
);

const TEMPLATE_HTML = readFirstExisting([
  path.join(__dirname, "templates", "report-template.html"),
  path.join(__dirname, "..", "..", "templates", "report-template.html"),
]);

// ---- Tally field label -> internal key map ----
// Edit the left-hand strings below to match your actual Tally question
// titles exactly if you change the wording in the form.
const FIELD_LABELS = {
  "client name": "clientName",
  "subseason": "subseason",
  "report date": "reportDate",

  // This single field holds the entire hair/brows/eyes/features/skin
  // write-up (with temperature/value/chroma commentary woven into the
  // prose) and goes into the Page 2 analysis block.
  "overview summary": "featureAnalysisText",

  "gold and silver test": "metalCopy",

  "cover photo": "coverPhoto",
  "overview picture": "overviewPhoto",
  "gold and silver test photo": "metalPhoto",
  "best 10 colors": "bestCollagePhoto",
  "your 10 not-your-colors": "worstCollagePhoto",
};

function normalizeLabel(label) {
  return (label || "").toString().trim().toLowerCase();
}

// Tally sends different field "type"s with different value shapes:
//   - INPUT_TEXT / TEXTAREA: value is a plain string
//   - DROPDOWN: value is an array containing an option ID (NOT the text!) —
//     the human-readable text lives in a sibling "options" array, e.g.
//     value: ["1d1e8fc9-..."], options: [{id:"1d1e8fc9-...", text:"Soft Autumn"}, ...]
//     so dropdown answers must be resolved through that options list.
//   - FILE_UPLOAD: value is an array of {id, name, url, mimeType, size}
// This function returns the right human-readable value for any of the above.
function extractValue(field) {
  const v = field.value;

  if (!Array.isArray(v)) {
    return v == null ? "" : String(v);
  }
  if (v.length === 0) return null;

  const first = v[0];

  // Dropdown: v[0] is an option ID string: look it up against field.options
  if (typeof first === "string" && Array.isArray(field.options)) {
    const match = field.options.find((opt) => opt.id === first);
    if (match) return match.text;
    return first; // fallback: couldn't resolve, return the raw id
  }

  // File upload: v[0] is an object with a url
  if (first && typeof first === "object") {
    return first.url || first.name || null;
  }

  return first;
}

function parseTallyPayload(body) {
  // Accept either shape:
  //   - Tally's native webhook: { data: { fields: [...] } }
  //   - Fields forwarded directly at the root (e.g. via some Make/Zapier
  //     passthrough configurations): { fields: [...] }
  const fields =
    (body && body.data && body.data.fields) ||
    (body && body.fields) ||
    (Array.isArray(body) ? body : []) ||
    [];

  const out = {};
  for (const field of fields) {
    const key = FIELD_LABELS[normalizeLabel(field.label)];
    if (key) {
      out[key] = extractValue(field);
    }
  }
  return out;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Replace the text content of an element matched by id="..." in the raw
// HTML string. Relies on each id being unique and the element body
// containing no nested tags.
function setTextById(html, id, value) {
  const re = new RegExp(`(id="${id}"[^>]*>)([^<]*)(</)`, "s");
  if (!re.test(html)) {
    console.warn(`setTextById: id not found: ${id}`);
    return html;
  }
  return html.replace(re, (m, open, _old, close) => `${open}${escapeHtml(value)}${close}`);
}

// Like setTextById, but preserves literal newlines as <br> (used for the
// free-text feature analysis block, which is usually multi-paragraph).
function setMultilineTextById(html, id, value) {
  const safe = escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
  const re = new RegExp(`(id="${id}"[^>]*>)([^<]*)(</)`, "s");
  if (!re.test(html)) {
    console.warn(`setMultilineTextById: id not found: ${id}`);
    return html;
  }
  return html.replace(re, (m, open, _old, close) => `${open}${safe}${close}`);
}

// Replace an <img id="..."> src and reveal it, hiding the sibling
// photo-slot placeholder with a matching id of "slot-<name>".
function setPhoto(html, imgId, slotId, url) {
  if (!url) return html; // leave placeholder visible if no photo supplied

  const imgRe = new RegExp(`(<img[^>]*id="${imgId}"[^>]*src=")([^"]*)("[^>]*style="[^"]*?)display:none;?\\s*([^"]*")`, "s");
  let out = html;
  if (imgRe.test(out)) {
    out = out.replace(imgRe, (m, p1, _oldsrc, p3, p4) => `${p1}${escapeHtml(url)}${p3}${p4}`);
  } else {
    console.warn(`setPhoto: img id not found or pattern mismatch: ${imgId}`);
  }

  // Hide the placeholder slot by inserting display:none into its style/class
  const slotRe = new RegExp(`(<div[^>]*id="${slotId}"[^>]*>)`, "s");
  out = out.replace(slotRe, (m) => {
    if (m.includes("style=")) {
      return m.replace(/style="/, 'style="display:none; ');
    }
    return m.replace(/>$/, ' style="display:none;">');
  });

  return out;
}

function swatchDivs(namedColors) {
  return namedColors
    .map(([name, hex]) => `<div class="swatch" style="background:${hex};" title="${escapeHtml(name)}"></div>`)
    .join("\n");
}

function buildSistersBlock(sisterNames) {
  return sisterNames
    .map((sisterName) => {
      const sisterData = SUBSEASON_DATA[sisterName];
      if (!sisterData) return "";
      const swatches = swatchDivs(sisterData.best_named.slice(0, 6));
      return `
        <div>
          <div class="label-sm" style="text-align:center; margin-bottom:6px;">${escapeHtml(sisterName)}</div>
          <div class="sister-grid">
            ${swatches}
          </div>
        </div>`;
    })
    .join("\n");
}

// Renders the same Warmth/Value/Chroma meter+readout markup used on the
// fixed reference pages (6–9), so the client's own page 4 visually matches
// the reference plates exactly. segCount: High=3 lit segments, Medium=2, Low=1.
function buildDriverRow(drivers) {
  const segCounts = { High: 3, Medium: 2, Low: 1 };
  const order = [
    { key: "warmth", label: "Warmth", cls: "warmth" },
    { key: "value", label: "Value", cls: "value" },
    { key: "chroma", label: "Chroma", cls: "chroma" },
  ];

  return order
    .map(({ key, label, cls }) => {
      const readout = drivers && drivers[key] ? drivers[key] : "Medium";
      const lit = segCounts[readout] || 2;
      const segs = [0, 1, 2]
        .map((i) => `<div class="seg${i < lit ? " on" : ""}"></div>`)
        .join("");
      return `
      <div class="driver">
        <div class="driver-name">${label}</div>
        <div class="driver-meter ${cls}">${segs}</div>
        <div class="driver-readout">${escapeHtml(readout)}</div>
      </div>`;
    })
    .join("\n");
}

function replaceBlockById(html, blockId, innerHtml) {
  const re = new RegExp(`(id="${blockId}"[^>]*>)(.*?)(</div>)`, "s");
  if (!re.test(html)) {
    console.warn(`replaceBlockById: block id not found: ${blockId}`);
    return html;
  }
  return html.replace(re, (m, open, _old, close) => `${open}\n${innerHtml}\n${close}`);
}

function buildReport(formData) {
  let html = TEMPLATE_HTML;

  const subseasonName = formData.subseason;
  const data = SUBSEASON_DATA[subseasonName];
  if (!data) {
    throw new Error(`Unknown subseason: "${subseasonName}". Must exactly match one of: ${Object.keys(SUBSEASON_DATA).join(", ")}`);
  }

  // ---- Page 1: Cover ----
  html = setTextById(html, "f-client-name", formData.clientName || "");
  html = setTextById(html, "f-season-result", subseasonName);
  html = setTextById(html, "f-report-date", formData.reportDate || "");
  html = setPhoto(html, "img-cover", "slot-cover", formData.coverPhoto);

  // ---- Page 2: Feature Analysis ----
  // Uses its own dedicated photo (the "best color reveal" shot), uploaded
  // separately from the Cover Photo via the "Overview Picture" field.
  html = setPhoto(html, "img-feature-portrait", "slot-feature-portrait", formData.overviewPhoto);
  html = setMultilineTextById(html, "f-feature-analysis-text", formData.featureAnalysisText || "");
  html = setTextById(html, "f-overview-season", data.family);
  html = setTextById(html, "f-overview-subseason", subseasonName);

  // ---- Page 3: Gold vs Silver ----
  html = setPhoto(html, "img-metal-test", "slot-metal-test", formData.metalPhoto);
  html = setTextById(html, "f-metal-copy", formData.metalCopy || "");
  html = setTextById(html, "f-metal-result", data.metal.result);
  html = setTextById(html, "f-metal-note", data.metal.note);

  // ---- Page 4: Season Palette ----
  html = setTextById(html, "f-subseason-title", `Your Subseason: ${subseasonName}`);
  html = setTextById(html, "f-subseason-traits", data.tag);
  html = setPhoto(html, "img-best-collage", "slot-best-collage", formData.bestCollagePhoto);
  html = setTextById(html, "f-subseason-copy", formData.subseasonCopy || `${subseasonName} sits within the ${data.family} family — ${data.tag.toLowerCase()}.`);
  html = replaceBlockById(html, "block-sisters", buildSistersBlock(data.sisters));
  // Same Warmth/Value/Chroma readout shown on this subseason's entry on the
  // fixed reference pages (6–9) — kept identical so the client's own page
  // is consistent with the reference plates rather than contradicting them.
  html = replaceBlockById(html, "block-own-drivers", buildDriverRow(data.drivers));

  // ---- Page 5: Not-Your-Colors collage ----
  html = setPhoto(html, "img-worst-collage", "slot-worst-collage", formData.worstCollagePhoto);

  return html;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON payload" };
  }

  let formData;
  try {
    formData = parseTallyPayload(body);
  } catch (e) {
    return { statusCode: 400, body: `Failed to parse Tally payload: ${e.message}` };
  }

  if (!formData.subseason) {
    return { statusCode: 400, body: 'Missing required field "Subseason" in submission.' };
  }

  let reportHtml;
  try {
    reportHtml = buildReport(formData);
  } catch (e) {
    return { statusCode: 400, body: `Failed to build report: ${e.message}` };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      html: reportHtml,
      clientName: formData.clientName || "",
    }),
  };
};
