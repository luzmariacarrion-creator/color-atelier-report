// netlify/functions/generate-report.js
//
// Receives a Tally webhook submission, builds the Color Atelier client
// report HTML, and returns it. Designed to be configured as the webhook
// target in Tally's form settings (Integrations -> Webhooks).
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
    path.join(__dirname, "data", "subseason-full-data.json"),       // Netlify deployed layout
    path.join(__dirname, "..", "..", "data", "subseason-full-data.json"), // local dev layout
  ])
);

const TEMPLATE_HTML = readFirstExisting([
  path.join(__dirname, "templates", "report-template.html"),         // Netlify deployed layout
  path.join(__dirname, "..", "..", "templates", "report-template.html"), // local dev layout
]);

// ---- Tally field label -> internal key map ----
// Edit the left-hand strings below to match your actual Tally question
// titles exactly if you change the wording in the form.
const FIELD_LABELS = {
  "client name": "clientName",
  "subseason": "subseason",
  "report date": "reportDate",

  "overview summary": "overviewSummary",

  "hair description": "hairDesc",
  "hair temperature": "hairTemp",
  "hair value": "hairValue",
  "hair chroma": "hairChroma",

  "brow description": "browDesc",
  "brow temperature": "browTemp",
  "brow value": "browValue",
  "brow chroma": "browChroma",

  "eye description": "eyeDesc",
  "eye temperature": "eyeTemp",
  "eye value": "eyeValue",
  "eye chroma": "eyeChroma",

  "features description": "featuresDesc",
  "features temperature": "featuresTemp",
  "features value": "featuresValue",
  "features chroma": "featuresChroma",

  "skin description": "skinDesc",
  "skin temperature": "skinTemp",
  "skin value": "skinValue",
  "skin chroma": "skinChroma",

  "gold description": "goldCopy",
  "silver description": "silverCopy",

  "cover photo": "coverPhoto",
  "gold photo": "goldPhoto",
  "silver photo": "silverPhoto",

  // Best colors photos 1-10
  "best color photo 1": "bestPhoto1",
  "best color photo 2": "bestPhoto2",
  "best color photo 3": "bestPhoto3",
  "best color photo 4": "bestPhoto4",
  "best color photo 5": "bestPhoto5",
  "best color photo 6": "bestPhoto6",
  "best color photo 7": "bestPhoto7",
  "best color photo 8": "bestPhoto8",
  "best color photo 9": "bestPhoto9",
  "best color photo 10": "bestPhoto10",

  // Not-color (worst) photos 1-10
  "not-color photo 1": "worstPhoto1",
  "not-color photo 2": "worstPhoto2",
  "not-color photo 3": "worstPhoto3",
  "not-color photo 4": "worstPhoto4",
  "not-color photo 5": "worstPhoto5",
  "not-color photo 6": "worstPhoto6",
  "not-color photo 7": "worstPhoto7",
  "not-color photo 8": "worstPhoto8",
  "not-color photo 9": "worstPhoto9",
  "not-color photo 10": "worstPhoto10",
};

function normalizeLabel(label) {
  return (label || "").toString().trim().toLowerCase();
}

// Tally sends different field "type"s with different value shapes:
//   - INPUT_TEXT: value is a plain string
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

  // Plain string array with no options (shouldn't normally happen)
  return first;
}

function parseTallyPayload(body) {
  // Accept either shape:
  //   - Tally's native webhook: { data: { fields: [...] } }
  //   - Fields forwarded directly at the root (e.g. via some Make/Zapier
  //     passthrough configurations): { fields: [...] }  or even the fields
  //     array itself if someone maps just that.
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

function driverBadge(level) {
  // level should be "High" | "Medium" | "Low" (case-insensitive input allowed)
  const norm = (level || "").trim().toLowerCase();
  const cls = norm === "high" ? "high" : norm === "low" ? "low" : "medium";
  const label = norm === "high" ? "High" : norm === "low" ? "Low" : "Medium";
  return { cls, label };
}

// Replace the text content of an element matched by id="..." in the raw
// HTML string. Simple and dependency-free; relies on each id being unique
// and the element body containing no nested tags (true for all targets here
// except where noted).
function setTextById(html, id, value) {
  const re = new RegExp(`(id="${id}"[^>]*>)([^<]*)(</)`, "s");
  if (!re.test(html)) {
    console.warn(`setTextById: id not found: ${id}`);
    return html;
  }
  return html.replace(re, (m, open, _old, close) => `${open}${escapeHtml(value)}${close}`);
}

// Set a driver badge's class + text together (badge has classes
// "driver-badge-value medium fillable" — we swap "medium" for the right level
// class and replace the H/M/L text).
function setDriverBadge(html, id, level) {
  const { cls, label } = driverBadge(level);
  const re = new RegExp(
    `(id="${id}"[^>]*class="[^"]*?)\\b(high|medium|low)\\b([^"]*"[^>]*>)([^<]*)(</)`,
    "s"
  );
  // class list ordering in the template is "driver-badge-value medium fillable id=...",
  // so id comes after class in source order in some cases — handle both orders:
  const reAlt = new RegExp(
    `(class="driver-badge-value )(high|medium|low)( fillable" id="${id}">)([^<]*)(</)`,
    "s"
  );
  if (reAlt.test(html)) {
    return html.replace(reAlt, (m, p1, _old, p3, _oldtext, p5) => `${p1}${cls}${p3}${label}${p5}`);
  }
  console.warn(`setDriverBadge: id not found: ${id}`);
  return html;
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
    // No existing style attribute: insert one right before the closing ">"
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
      // Use the sister's own best 6 colors as its representative swatches
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

function buildOwnPaletteBlock(bestNamed, worstNamed) {
  // 24-cell grid in the original template; we have 20 named colors (10+10).
  // Fill with best 10 then worst 10 — gives the full locked palette context.
  const all = [...bestNamed, ...worstNamed];
  return swatchDivs(all);
}

function tryonCard(name, hex, photoUrl, index, kind) {
  const imgId = `img-${kind}${index}`;
  const slotId = `slot-${kind}${index}`;
  const imgStyle = photoUrl
    ? `width:100%; height:62mm; object-fit:cover; border-radius:2px; margin-bottom:8px;`
    : `display:none; width:100%; height:62mm; object-fit:cover; border-radius:2px; margin-bottom:8px;`;
  const slotStyle = photoUrl ? `display:none;` : ``;
  return `
    <div class="tryon-card">
      <img class="tryon-photo" id="${imgId}" src="${escapeHtml(photoUrl || "")}" alt="${escapeHtml(name)}" style="${imgStyle}">
      <div class="photo-slot fillable tryon-photo" id="${slotId}" style="${slotStyle}"><span>CLIENT PHOTO — ${escapeHtml(name)}</span></div>
      <div class="tryon-label">${escapeHtml(name)}</div>
    </div>`;
}

function buildTryonRow(namedColors, photoUrls, kind, startIndex) {
  return namedColors
    .map(([name, hex], i) => tryonCard(name, hex, photoUrls[i], startIndex + i, kind))
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
  const features = ["hair", "brow", "eye", "features", "skin"];
  const featureSlotNames = { hair: "hair", brow: "brows", eye: "eyes", features: "features", skin: "skin" };
  for (const f of features) {
    const slotName = featureSlotNames[f];
    html = setTextById(html, `f-desc-${slotName}`, formData[`${f}Desc`] || "");
    html = setDriverBadge(html, `f-driver-${slotName}-temp`, formData[`${f}Temp`]);
    html = setDriverBadge(html, `f-driver-${slotName}-value`, formData[`${f}Value`]);
    html = setDriverBadge(html, `f-driver-${slotName}-chroma`, formData[`${f}Chroma`]);
  }
  html = setTextById(html, "f-overview-summary", formData.overviewSummary || "");
  html = setTextById(html, "f-overview-season", data.family);
  html = setTextById(html, "f-overview-subseason", subseasonName);

  // ---- Page 3: Gold vs Silver ----
  html = setPhoto(html, "img-gold", "slot-gold", formData.goldPhoto);
  html = setPhoto(html, "img-silver", "slot-silver", formData.silverPhoto);
  html = setTextById(html, "f-gold-copy", formData.goldCopy || "");
  html = setTextById(html, "f-silver-copy", formData.silverCopy || "");
  html = setTextById(html, "f-metal-result", data.metal.result);
  html = setTextById(html, "f-metal-note", data.metal.note);

  // ---- Page 4: Season Palette ----
  html = setTextById(html, "f-subseason-title", `Your Subseason: ${subseasonName}`);
  html = setTextById(html, "f-subseason-traits", data.tag);
  html = setTextById(html, "f-subseason-copy", formData.subseasonCopy || `${subseasonName} sits within the ${data.family} family — ${data.tag.toLowerCase()}.`);
  html = setTextById(html, "f-palette-title", `${subseasonName} Palette — Your Colors`);
  html = replaceBlockById(html, "block-sisters", buildSistersBlock(data.sisters));
  html = replaceBlockById(html, "block-own-palette", buildOwnPaletteBlock(data.best_named, data.worst_named));

  // ---- Pages 5 & 6: Try-on grids ----
  const bestPhotos = [];
  const worstPhotos = [];
  for (let i = 1; i <= 10; i++) {
    bestPhotos.push(formData[`bestPhoto${i}`]);
    worstPhotos.push(formData[`worstPhoto${i}`]);
  }

  html = replaceBlockById(html, "block-best-row1", buildTryonRow(data.best_named.slice(0, 5), bestPhotos.slice(0, 5), "best", 1));
  html = replaceBlockById(html, "block-best-row2", buildTryonRow(data.best_named.slice(5, 10), bestPhotos.slice(5, 10), "best", 6));
  html = replaceBlockById(html, "block-worst-row1", buildTryonRow(data.worst_named.slice(0, 5), worstPhotos.slice(0, 5), "worst", 1));
  html = replaceBlockById(html, "block-worst-row2", buildTryonRow(data.worst_named.slice(5, 10), worstPhotos.slice(5, 10), "worst", 6));

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

  // Return the finished HTML directly. (See README for options on
  // persisting this to storage and returning a link instead.)
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: reportHtml,
  };
};
