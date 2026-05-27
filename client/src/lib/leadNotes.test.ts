import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadWebsiteHref,
  extractLeadWebsite,
  stripLeadWebsiteFromNotes,
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

test("returns no website when notes do not include one", () => {
  assert.equal(extractLeadWebsite("No website here."), null);
  assert.equal(stripLeadWebsiteFromNotes("No website here."), "No website here.");
});
