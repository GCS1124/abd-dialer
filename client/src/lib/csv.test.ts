import assert from "node:assert/strict";
import test from "node:test";

import { utils, write } from "xlsx";

import { parseLeadCsv, parseLeadFile } from "./csv";

function workbookFile(name: string, buffer: Buffer) {
  return {
    name,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as File;
}

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

test("infers a company field for business-style lead names", () => {
  const parsed = parseLeadCsv(`Full Name,Phone,Source
A Beautiful Day Cleaning,555-111-2222,Google Places
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "A Beautiful Day Cleaning");
  assert.equal(parsed.rows[0]?.company, "A Beautiful Day Cleaning");
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

test("chooses the lead sheet from a workbook with cover data and extra columns", async () => {
  const workbook = utils.book_new();
  const coverSheet = utils.aoa_to_sheet([
    ["Internal cover page"],
    ["Do not import"],
  ]);
  const leadSheet = utils.aoa_to_sheet([
    ["Sales Export"],
    ["Generated for the campaign importer"],
    ["Contact Name", "Mobile Number", "Email Address", "Company Name", "Extra Notes"],
    [
      "Jamie Example",
      "+1 (555) 111-2222",
      "jamie@example.com",
      "Example Co",
      "Ignore this extra column",
    ],
  ]);

  utils.book_append_sheet(workbook, coverSheet, "Cover");
  utils.book_append_sheet(workbook, leadSheet, "Leads");
  const buffer = write(workbook, { bookType: "xlsx", type: "buffer" });

  const parsed = await parseLeadFile(workbookFile("lead-export.xlsm", buffer));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Jamie Example");
  assert.equal(parsed.rows[0]?.phone, "+1 (555) 111-2222");
  assert.equal(parsed.rows[0]?.email, "jamie@example.com");
  assert.equal(parsed.rows[0]?.company, "Example Co");
});

test("promotes alternate-phone-only columns to the primary phone field", async () => {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["Lead Name", "Alt Phone", "Company"],
    ["Morgan Example", "+1 (555) 333-4444", "Example Partners"],
  ]);

  utils.book_append_sheet(workbook, sheet, "Leads");
  const buffer = write(workbook, { bookType: "xlsx", type: "buffer" });

  const parsed = await parseLeadFile(workbookFile("alt-phone-export.xlsx", buffer));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Morgan Example");
  assert.equal(parsed.rows[0]?.phone, "+1 (555) 333-4444");
  assert.equal(parsed.rows[0]?.altPhone, "");
});
