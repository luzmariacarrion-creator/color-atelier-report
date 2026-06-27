const fs = require("fs");
const path = require("path");

// Load the function module directly
const handlerModule = require("./netlify/functions/generate-report.js");

const payload = JSON.parse(fs.readFileSync("test-payload.json", "utf8"));

const event = {
  httpMethod: "POST",
  body: JSON.stringify(payload),
};

handlerModule.handler(event).then((result) => {
  console.log("STATUS:", result.statusCode);
  if (result.statusCode !== 200) {
    console.log("BODY:", result.body);
    return;
  }
  fs.writeFileSync("test-output.html", result.body);
  console.log("Wrote test-output.html, length:", result.body.length);
}).catch(err => {
  console.error("ERROR:", err);
});
