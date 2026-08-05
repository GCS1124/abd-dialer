import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadWebsiteHref,
  extractLeadWebsite,
  extractLeadTimezone,
  stripLeadWebsiteFromNotes,
  stripLeadTimezoneFromNotes,
} from "./leadNotes.ts";

test("extracts a website from an imported website note line", () => {
  const notes = [
    "Age: 42",
    "Website: http://hdcleanteam.com/",
    "Import Date: 2026-05-27",
  ].join("\n");

  assert.equal(extractLeadWebsite(notes), "http://hdcleanteam.com/");
  assert.equal(
    stripLeadWebsiteFromNotes(notes),
    ["Age: 42", "Import Date: 2026-05-27"].join("\n"),
  );
});

test("builds a usable href for bare domains", () => {
  assert.equal(buildLeadWebsiteHref("www.hdcleanteam.com"), "https://www.hdcleanteam.com");
});

test("does not substitute a LinkedIn profile for a missing website", () => {
  const notes = [
    "LinkedIn: https://www.linkedin.com/in/jamie-example",
    "Industry: Professional Services",
  ].join("\n");

  assert.equal(extractLeadWebsite(notes), null);
  assert.equal(stripLeadWebsiteFromNotes(notes), notes);
});

test("keeps a real website separate from a LinkedIn profile", () => {
  const notes = [
    "LinkedIn: https://www.linkedin.com/company/example",
    "Website: www.example.com",
  ].join("\n");

  assert.equal(extractLeadWebsite(notes), "www.example.com");
});

test("extracts and strips a timezone from an imported timezone note line", () => {
  const notes = [
    "Country: USA",
    "Time Zone: EST",
    "Import Date: 2026-05-27",
  ].join("\n");

  assert.equal(extractLeadTimezone(notes), "EST");
  assert.equal(
    stripLeadTimezoneFromNotes(notes),
    ["Country: USA", "Import Date: 2026-05-27"].join("\n"),
  );
});

test("returns no website when notes do not include one", () => {
  assert.equal(extractLeadWebsite("No website here."), null);
  assert.equal(stripLeadWebsiteFromNotes("No website here."), "No website here.");
  assert.equal(extractLeadTimezone("No timezone here."), null);
  assert.equal(stripLeadTimezoneFromNotes("No timezone here."), "No timezone here.");
});
