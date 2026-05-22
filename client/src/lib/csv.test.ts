import assert from "node:assert/strict";
import test from "node:test";

import { utils, write } from "xlsx";

import { parseLeadCsv, parseLeadFile } from "./csv";

test("skips the default template notes row without counting it as invalid", () => {
  const parsed = parseLeadCsv(`Full Name,Phone,Alt Phone,Email,Company,Location,Interest,Status
Alice Example,+1 (555) 111-2222,,alice@example.com,Example Co,Delhi,Outbound,new
Notes:,Phone supports E.164 (+91...) or digits; spaces/dashes are okay.,Alt phone is optional.,Email should be valid.,Status must be one of the allowed values.,,,
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Alice Example");
  assert.equal(parsed.rows[0]?.phone, "+1 (555) 111-2222");
});

test("still counts a genuinely incomplete row as invalid", () => {
  const parsed = parseLeadCsv(`Full Name,Phone,Email
Valid Lead,555-111-2222,valid@example.com
Broken Lead,,broken@example.com
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 1);
});

test("parses lead-finder xlsx exports with mobile, website, and address columns", async () => {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["name", "mobile", "email", "website", "address", "source"],
    [
      "Keith Show Number",
      "+1 (732) 593-9636",
      "keith@example.com",
      "https://keithshownumber.example",
      "123 Main St, New York, NY",
      "Google Places",
    ],
  ]);

  utils.book_append_sheet(workbook, sheet, "Leads");
  const buffer = write(workbook, { bookType: "xlsx", type: "buffer" });
  const file = {
    name: "lead-finder-export.xlsx",
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as File;

  const parsed = await parseLeadFile(file);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Keith Show Number");
  assert.equal(parsed.rows[0]?.phone, "+1 (732) 593-9636");
  assert.equal(parsed.rows[0]?.location, "123 Main St, New York, NY");
  assert.equal(parsed.rows[0]?.source, "Google Places");
  assert.match(parsed.rows[0]?.notes ?? "", /Website: https:\/\/keithshownumber\.example/);
});
