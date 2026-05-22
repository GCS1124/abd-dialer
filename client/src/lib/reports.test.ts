import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformanceScore,
  campaignLabelFromSource,
  classifyReportStatus,
  createDefaultReportFilters,
  formatReportDuration,
  normalizeReportFilters,
  parseReportFilters,
  serializeReportFilters,
} from "./reports.ts";

test("creates the current month-to-date range and round-trips the query string", () => {
  const filters = createDefaultReportFilters(new Date("2026-05-23T10:15:00.000Z"));

  assert.deepEqual(filters, {
    from: "2026-05-01",
    to: "2026-05-23",
    campaign: "all",
    agentId: "all",
    status: "all",
    search: "",
    sortField: "createdAt",
    sortDirection: "desc",
    page: 1,
    pageSize: 25,
  });

  const query = serializeReportFilters(filters);
  const parsed = parseReportFilters(new URLSearchParams(query), new Date("2026-05-23T10:15:00.000Z"));

  assert.deepEqual(parsed, filters);
});

test("normalizes filters, campaign labels, status buckets, duration formatting, and scoring", () => {
  const normalized = normalizeReportFilters(
    {
      from: "",
      to: "",
      campaign: "",
      agentId: "",
      status: "all",
      search: "   ",
      sortField: "createdAt",
      sortDirection: "desc",
      page: 0,
      pageSize: 0,
    },
    new Date("2026-05-23T10:15:00.000Z"),
  );

  assert.equal(normalized.from, "2026-05-01");
  assert.equal(normalized.to, "2026-05-23");
  assert.equal(normalized.campaign, "all");
  assert.equal(normalized.agentId, "all");
  assert.equal(normalized.search, "");
  assert.equal(normalized.page, 1);
  assert.equal(normalized.pageSize, 25);
  assert.equal(campaignLabelFromSource(""), "Uncategorized");
  assert.equal(campaignLabelFromSource("  Spring Launch  "), "Spring Launch");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Interested" }), "connected");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Busy" }), "rejected");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Wrong Number" }), "rejected");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "No Answer" }), "not_answered");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Voicemail" }), "not_answered");
  assert.equal(classifyReportStatus({ callStatus: "missed", disposition: "No Answer" }), "missed");
  assert.equal(classifyReportStatus({ callStatus: "failed", disposition: "Failed Attempt" }), "missed");
  assert.equal(formatReportDuration(125), "02:05");
  assert.equal(formatReportDuration(-4), "00:00");
  assert.equal(
    buildPerformanceScore({
      totalCalls: 100,
      connectedCalls: 70,
      convertedCalls: 20,
      averageTalkSeconds: 95,
    }),
    67,
  );
  assert.equal(
    buildPerformanceScore({
      totalCalls: 0,
      connectedCalls: 99,
      convertedCalls: 99,
      averageTalkSeconds: 999,
    }),
    0,
  );
});
