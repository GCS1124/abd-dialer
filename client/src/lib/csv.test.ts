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
  assert.equal(parsed.rows[0]?.website, "https://keithshownumber.example");
  assert.equal(parsed.rows[0]?.timezone, "");
  assert.doesNotMatch(parsed.rows[0]?.notes ?? "", /Website:/i);
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

test("parses messy lead-sheet exports with decision makers and extra detail columns", async () => {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    [
      "Date",
      "Name",
      "Company",
      "Decision Maker",
      "Position",
      "Phone-1",
      "Phone-2",
      "Email-1",
      "Email-2",
      "Website",
      "Country",
      "Time Zone",
      "LinkedIn",
      "Industry",
    ],
    [
      "18-08-2025",
      "Kaushal",
      "TAG Custom Bridal",
      "Patricia Davis",
      "Founder",
      "904-395-1858",
      "904-480-3719",
      "patricia.davis@tagcustombridal.com",
      "patricia@needledantl.com",
      "https://www.tagcustombridal.com",
      "USA",
      "EST",
      "https://www.linkedin.com/in/patriciadavis",
      "Retail Apparel and Fashion",
    ],
  ]);

  utils.book_append_sheet(workbook, sheet, "Leads");
  const buffer = write(workbook, { bookType: "xlsx", type: "buffer" });

  const parsed = await parseLeadFile(workbookFile("messy-leads.xlsm", buffer));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Patricia Davis");
  assert.equal(parsed.rows[0]?.company, "TAG Custom Bridal");
  assert.equal(parsed.rows[0]?.phone, "904-395-1858");
  assert.equal(parsed.rows[0]?.altPhone, "904-480-3719");
  assert.deepEqual(parsed.rows[0]?.phoneNumbers, ["9043951858", "9044803719"]);
  assert.equal(parsed.rows[0]?.email, "patricia.davis@tagcustombridal.com");
  assert.equal(parsed.rows[0]?.location, "USA");
  assert.equal(parsed.rows[0]?.website, "https://www.tagcustombridal.com");
  assert.equal(parsed.rows[0]?.timezone, "EST");
  assert.match(parsed.rows[0]?.notes ?? "", /Import Date: 2025-08-18/);
  assert.match(parsed.rows[0]?.notes ?? "", /Country: USA/);
  assert.match(parsed.rows[0]?.notes ?? "", /LinkedIn: https:\/\/www\.linkedin\.com\/in\/patriciadavis/);
  assert.match(parsed.rows[0]?.notes ?? "", /Industry: Retail Apparel and Fashion/);
  assert.match(parsed.rows[0]?.notes ?? "", /Secondary Email: patricia@needledantl\.com/);
  assert.doesNotMatch(parsed.rows[0]?.notes ?? "", /Website:/i);
  assert.doesNotMatch(parsed.rows[0]?.notes ?? "", /Time Zone:/i);
});

test("keeps the name when decision maker is blank and keeps all dialable phone numbers", async () => {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ["Name", "Decision Maker", "Phone-1", "Phone-2", "Email-1"],
    ["Kaushal", "", "904-395-1858", "904-480-3719", "kaushal@example.com"],
  ]);

  utils.book_append_sheet(workbook, sheet, "Leads");
  const buffer = write(workbook, { bookType: "xlsx", type: "buffer" });

  const parsed = await parseLeadFile(workbookFile("blank-decision-maker.xlsx", buffer));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.invalidRows, 0);
  assert.equal(parsed.rows[0]?.fullName, "Kaushal");
  assert.equal(parsed.rows[0]?.phone, "904-395-1858");
  assert.equal(parsed.rows[0]?.altPhone, "904-480-3719");
  assert.deepEqual(parsed.rows[0]?.phoneNumbers, ["9043951858", "9044803719"]);
});
