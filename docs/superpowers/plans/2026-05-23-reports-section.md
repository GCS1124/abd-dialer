# Reports Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current summary-only Reports page with a backend-backed reporting dashboard that supports date-range filtering, agent and campaign analysis, paginated call records, and CSV/XLSX/PDF export.

**Architecture:** Keep one shared reporting model in `client/src/lib/reports.ts` so the backend service, page hook, and export actions all use the same date normalization, status bucketing, campaign labeling, and score calculation. Add a dedicated `client/src/services/reports.ts` aggregation service that queries Supabase directly for the selected date range and filters, then expose it through `apiRequest()` as the `/reports/*` surface. Build the page as a thin orchestrator around a `useReportsDashboard` hook plus focused report components, and add a print-friendly route for PDF export so we do not introduce a new PDF dependency.

**Tech Stack:** React, TypeScript, Vite, Supabase browser client, `date-fns`, `@tanstack/react-table`, `recharts`, `xlsx`, `lucide-react`, node:test with `--experimental-strip-types`.

---

### Task 1: Add the shared report model and pure helpers

**Files:**
- Create: `client/src/lib/reports.ts`
- Create: `client/src/lib/reports.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
} from "./reports";

test("creates the current month-to-date range and round-trips the query string", () => {
  const filters = createDefaultReportFilters(new Date("2026-05-23T10:15:00.000Z"));

  assert.equal(filters.from, "2026-05-01");
  assert.equal(filters.to, "2026-05-23");
  assert.equal(filters.status, "all");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 25);
  assert.equal(filters.sortField, "createdAt");
  assert.equal(filters.sortDirection, "desc");

  const query = serializeReportFilters(filters);
  const parsed = parseReportFilters(new URLSearchParams(query));

  assert.deepEqual(parsed, filters);
});

test("normalizes filters, maps status buckets, and scores performance", () => {
  const filters = normalizeReportFilters(
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

  assert.equal(filters.from, "2026-05-01");
  assert.equal(filters.to, "2026-05-23");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 25);
  assert.equal(campaignLabelFromSource(""), "Uncategorized");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Interested" }), "connected");
  assert.equal(classifyReportStatus({ callStatus: "connected", disposition: "Busy" }), "rejected");
  assert.equal(classifyReportStatus({ callStatus: "missed", disposition: "No Answer" }), "not_answered");
  assert.equal(classifyReportStatus({ callStatus: "failed", disposition: "Failed Attempt" }), "missed");
  assert.equal(formatReportDuration(125), "02:05");
  assert.equal(
    buildPerformanceScore({
      totalCalls: 100,
      connectedCalls: 70,
      convertedCalls: 20,
      averageTalkSeconds: 95,
    }) > 0,
    true,
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test client/src/lib/reports.test.ts`

Expected: fail with missing exports until `client/src/lib/reports.ts` exists.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { endOfDay, format, isValid, parseISO, startOfMonth } from "date-fns";

export type ReportStatusFilter = "all" | "connected" | "rejected" | "missed" | "not_answered";
export type ReportSortField = "createdAt" | "durationSeconds" | "agentName" | "customerName" | "campaignName" | "status";
export type ReportSortDirection = "asc" | "desc";

export interface ReportFilters {
  from: string;
  to: string;
  campaign: string;
  agentId: string;
  status: ReportStatusFilter;
  search: string;
  sortField: ReportSortField;
  sortDirection: ReportSortDirection;
  page: number;
  pageSize: number;
}

export interface ReportCallRecord {
  id: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  customerName: string;
  customerPhone: string;
  campaignName: string;
  status: ReportStatusFilter;
  disposition: string;
  durationSeconds: number;
  duration: string;
  remarks: string;
  leadId: string;
}

export interface ReportSummaryTotals {
  totalCalls: number;
  connectedCalls: number;
  rejectedCalls: number;
  missedCalls: number;
  notAnsweredCalls: number;
  totalDurationSeconds: number;
  averageCallDurationSeconds: number;
  averageCallDuration: string;
  conversionRate: number;
  totalAgents: number;
  performanceScore: number;
}

export interface ReportOption {
  value: string;
  label: string;
}

export interface ReportTrendPoint {
  date: string;
  label: string;
  totalCalls: number;
  connectedCalls: number;
  averageDurationSeconds: number;
}

export interface ReportAgentSummary {
  agentId: string;
  agentName: string;
  totalCalls: number;
  connectedCalls: number;
  rejectedCalls: number;
  missedCalls: number;
  notAnsweredCalls: number;
  averageTalkSeconds: number;
  averageTalkTime: string;
  conversionRate: number;
  performanceScore: number;
}

export interface ReportCampaignSummary {
  campaignName: string;
  totalCalls: number;
  connectedCalls: number;
  rejectedCalls: number;
  missedCalls: number;
  notAnsweredCalls: number;
  averageTalkSeconds: number;
  averageTalkTime: string;
  conversionRate: number;
}

export interface ReportIndividualAgentSummary extends ReportAgentSummary {
  selectedRange: { from: string; to: string };
  dailyBreakdown: ReportTrendPoint[];
}

export interface ReportsSummaryResponse {
  filters: ReportFilters;
  options: {
    campaigns: ReportOption[];
    agents: ReportOption[];
    statuses: ReportOption[];
  };
  totals: ReportSummaryTotals;
  campaignSummary: ReportCampaignSummary[];
  agentSummary: ReportAgentSummary[];
  bestPerformers: ReportAgentSummary[];
  lowPerformers: ReportAgentSummary[];
  dailyTrend: ReportTrendPoint[];
  statusMix: Array<{ label: ReportStatusFilter; value: number }>;
  individualAgent: ReportIndividualAgentSummary | null;
}

export interface ReportsRecordsResponse {
  filters: ReportFilters;
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  items: ReportCallRecord[];
}

export interface ReportsExportResponse {
  filters: ReportFilters;
  totals: ReportSummaryTotals;
  rows: ReportCallRecord[];
}

function toDateString(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function createDefaultReportFilters(referenceDate = new Date()): ReportFilters {
  const safeReference = isValid(referenceDate) ? referenceDate : new Date();
  const from = startOfMonth(safeReference);
  return {
    from: toDateString(from),
    to: toDateString(safeReference),
    campaign: "all",
    agentId: "all",
    status: "all",
    search: "",
    sortField: "createdAt",
    sortDirection: "desc",
    page: 1,
    pageSize: 25,
  };
}

export function normalizeReportFilters(
  input: Partial<ReportFilters>,
  referenceDate = new Date(),
): ReportFilters {
  const defaults = createDefaultReportFilters(referenceDate);
  const from = typeof input.from === "string" && input.from.trim() ? input.from.trim() : defaults.from;
  const to = typeof input.to === "string" && input.to.trim() ? input.to.trim() : defaults.to;
  const campaign = typeof input.campaign === "string" && input.campaign.trim() ? input.campaign.trim() : "all";
  const agentId = typeof input.agentId === "string" && input.agentId.trim() ? input.agentId.trim() : "all";
  const status =
    input.status === "connected" ||
    input.status === "rejected" ||
    input.status === "missed" ||
    input.status === "not_answered"
      ? input.status
      : "all";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const sortField =
    input.sortField === "durationSeconds" ||
    input.sortField === "agentName" ||
    input.sortField === "customerName" ||
    input.sortField === "campaignName" ||
    input.sortField === "status"
      ? input.sortField
      : "createdAt";
  const sortDirection = input.sortDirection === "asc" ? "asc" : "desc";
  const page = Number.isFinite(input.page) && (input.page ?? 0) > 0 ? Math.floor(input.page ?? 1) : 1;
  const pageSize = Number.isFinite(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.floor(input.pageSize ?? 25) : 25;

  return { from, to, campaign, agentId, status, search, sortField, sortDirection, page, pageSize };
}

export function parseReportFilters(searchParams: URLSearchParams, referenceDate = new Date()): ReportFilters {
  const [sortFieldRaw, sortDirectionRaw] = (searchParams.get("sort") ?? "createdAt:desc").split(":");
  return normalizeReportFilters(
    {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      campaign: searchParams.get("campaign") ?? undefined,
      agentId: searchParams.get("agentId") ?? undefined,
      status: (searchParams.get("status") ?? "all") as ReportStatusFilter,
      search: searchParams.get("search") ?? undefined,
      sortField: sortFieldRaw as ReportSortField,
      sortDirection: sortDirectionRaw === "asc" ? "asc" : "desc",
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 25),
    },
    referenceDate,
  );
}

export function serializeReportFilters(filters: ReportFilters) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  params.set("campaign", filters.campaign);
  params.set("agentId", filters.agentId);
  params.set("status", filters.status);
  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }
  params.set("sort", `${filters.sortField}:${filters.sortDirection}`);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  return params;
}

export function campaignLabelFromSource(source: string | null | undefined) {
  const value = typeof source === "string" ? source.trim() : "";
  return value || "Uncategorized";
}

export function classifyReportStatus(input: { callStatus: string; disposition: string }): ReportStatusFilter {
  const disposition = input.disposition;

  if (input.callStatus === "connected" || input.callStatus === "follow_up") {
    if (disposition === "Busy" || disposition === "Wrong Number") {
      return "rejected";
    }
    if (disposition === "No Answer" || disposition === "Voicemail") {
      return "not_answered";
    }
    return "connected";
  }

  if (input.callStatus === "missed" || disposition === "Failed Attempt") {
    return "missed";
  }

  if (disposition === "Busy" || disposition === "Wrong Number") {
    return "rejected";
  }

  if (disposition === "No Answer" || disposition === "Voicemail") {
    return "not_answered";
  }

  return "connected";
}

export function isConvertedDisposition(disposition: string) {
  return disposition === "Appointment Booked" || disposition === "Sale Closed";
}

export function formatReportDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildPerformanceScore(input: {
  totalCalls: number;
  connectedCalls: number;
  convertedCalls: number;
  averageTalkSeconds: number;
}) {
  if (!input.totalCalls) {
    return 0;
  }

  const connectionRate = input.connectedCalls / input.totalCalls;
  const conversionRate = input.convertedCalls / input.totalCalls;
  const talkTimeScore = Math.min(input.averageTalkSeconds / 120, 1);
  return Math.round(Math.max(0, Math.min(100, connectionRate * 45 + conversionRate * 45 + talkTimeScore * 10)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test client/src/lib/reports.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/reports.ts client/src/lib/reports.test.ts
git commit -m "feat: add shared reports helpers"
```

### Task 2: Add the reports aggregation service and API routes

**Files:**
- Create: `client/src/services/reports.ts`
- Create: `client/src/services/reports.test.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `supabase/migrations/20260523000000_reports_indexes.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { ReportCallRecord, ReportFilters } from "../lib/reports";
import { aggregateReportsPayload } from "./reports";

const filters: ReportFilters = {
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
};

const rows: ReportCallRecord[] = [
  {
    id: "call-1",
    createdAt: "2026-05-23T09:00:00.000Z",
    agentId: "agent-1",
    agentName: "Olivia Hart",
    customerName: "Rahul Sharma",
    customerPhone: "9999999999",
    campaignName: "Google Ads",
    status: "connected",
    disposition: "Interested",
    durationSeconds: 60,
    duration: "01:00",
    remarks: "Asked for callback",
    leadId: "lead-1",
  },
  {
    id: "call-2",
    createdAt: "2026-05-23T10:00:00.000Z",
    agentId: "agent-1",
    agentName: "Olivia Hart",
    customerName: "Rahul Sharma",
    customerPhone: "9999999999",
    campaignName: "Google Ads",
    status: "rejected",
    disposition: "Busy",
    durationSeconds: 15,
    duration: "00:15",
    remarks: "Wrong time",
    leadId: "lead-1",
  },
  {
    id: "call-3",
    createdAt: "2026-05-22T12:00:00.000Z",
    agentId: "agent-2",
    agentName: "Sana Khan",
    customerName: "Amit Verma",
    customerPhone: "8888888888",
    campaignName: "Referral",
    status: "not_answered",
    disposition: "No Answer",
    durationSeconds: 0,
    duration: "00:00",
    remarks: "No answer",
    leadId: "lead-2",
  },
];

test("aggregates totals, campaign summaries, and selected-agent drilldown", () => {
  const payload = aggregateReportsPayload({
    filters,
    rows,
    total: rows.length,
    agents: [
      { value: "agent-1", label: "Olivia Hart" },
      { value: "agent-2", label: "Sana Khan" },
    ],
    campaigns: [
      { value: "Google Ads", label: "Google Ads" },
      { value: "Referral", label: "Referral" },
    ],
  });

  assert.equal(payload.totals.totalCalls, 3);
  assert.equal(payload.totals.connectedCalls, 1);
  assert.equal(payload.totals.rejectedCalls, 1);
  assert.equal(payload.totals.notAnsweredCalls, 1);
  assert.equal(payload.campaignSummary[0]?.campaignName, "Google Ads");
  assert.equal(payload.agentSummary[0]?.agentName, "Olivia Hart");
  assert.equal(payload.dailyTrend.length > 0, true);
  assert.equal(payload.individualAgent, null);
});

test("returns an individual-agent drilldown when the agent filter is active", () => {
  const payload = aggregateReportsPayload({
    filters: { ...filters, agentId: "agent-1" },
    rows,
    total: rows.length,
    agents: [{ value: "agent-1", label: "Olivia Hart" }],
    campaigns: [{ value: "Google Ads", label: "Google Ads" }],
  });

  assert.equal(payload.individualAgent?.agentName, "Olivia Hart");
  assert.equal(payload.individualAgent?.totalCalls, 2);
  assert.equal(payload.individualAgent?.selectedRange.from, "2026-05-01");
  assert.equal(payload.individualAgent?.dailyBreakdown.length > 0, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test client/src/services/reports.test.ts`

Expected: fail until `client/src/services/reports.ts` exports the aggregation helper.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { assertSupabaseConfigured, supabase } from "../lib/supabase";
import type {
  ReportCallRecord,
  ReportFilters,
  ReportOption,
  ReportsExportResponse,
  ReportsRecordsResponse,
  ReportsSummaryResponse,
} from "../lib/reports";
import {
  buildPerformanceScore,
  campaignLabelFromSource,
  classifyReportStatus,
  createDefaultReportFilters,
  formatReportDuration,
  isConvertedDisposition,
  normalizeReportFilters,
} from "../lib/reports";
import type { User } from "../types";

export function aggregateReportsPayload(input: {
  filters: ReportFilters;
  rows: ReportCallRecord[];
  total: number;
  agents: ReportOption[];
  campaigns: ReportOption[];
}): ReportsSummaryResponse {
  const rows = input.rows;
  const totals = {
    totalCalls: rows.length,
    connectedCalls: rows.filter((row) => row.status === "connected").length,
    rejectedCalls: rows.filter((row) => row.status === "rejected").length,
    missedCalls: rows.filter((row) => row.status === "missed").length,
    notAnsweredCalls: rows.filter((row) => row.status === "not_answered").length,
    totalDurationSeconds: rows.reduce((sum, row) => sum + row.durationSeconds, 0),
    averageCallDurationSeconds: rows.length ? rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length : 0,
    averageCallDuration: formatReportDuration(
      rows.length ? rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length : 0,
    ),
    conversionRate: rows.filter((row) => isConvertedDisposition(row.disposition)).length && rows.filter((row) => row.status === "connected").length
      ? Math.round((rows.filter((row) => isConvertedDisposition(row.disposition)).length / rows.filter((row) => row.status === "connected").length) * 100)
      : 0,
    totalAgents: new Set(rows.map((row) => row.agentId)).size,
    performanceScore: buildPerformanceScore({
      totalCalls: rows.length,
      connectedCalls: rows.filter((row) => row.status === "connected").length,
      convertedCalls: rows.filter((row) => isConvertedDisposition(row.disposition)).length,
      averageTalkSeconds: rows.length ? rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length : 0,
    }),
  };

  const campaignSummary = Array.from(
    rows.reduce((map, row) => {
      const current = map.get(row.campaignName) ?? {
        campaignName: row.campaignName,
        totalCalls: 0,
        connectedCalls: 0,
        rejectedCalls: 0,
        missedCalls: 0,
        notAnsweredCalls: 0,
        averageTalkSeconds: 0,
        averageTalkTime: "00:00",
        conversionRate: 0,
      };
      current.totalCalls += 1;
      current.connectedCalls += row.status === "connected" ? 1 : 0;
      current.rejectedCalls += row.status === "rejected" ? 1 : 0;
      current.missedCalls += row.status === "missed" ? 1 : 0;
      current.notAnsweredCalls += row.status === "not_answered" ? 1 : 0;
      current.averageTalkSeconds += row.durationSeconds;
      current.conversionRate += isConvertedDisposition(row.disposition) ? 1 : 0;
      map.set(row.campaignName, current);
      return map;
    }, new Map<string, any>()).values(),
  ).map((row) => ({
    ...row,
    averageTalkSeconds: row.totalCalls ? row.averageTalkSeconds / row.totalCalls : 0,
    averageTalkTime: formatReportDuration(row.totalCalls ? row.averageTalkSeconds / row.totalCalls : 0),
    conversionRate: row.connectedCalls ? Math.round((row.conversionRate / row.connectedCalls) * 100) : 0,
  }));

  const agentSummary = Array.from(
    rows.reduce((map, row) => {
      const current = map.get(row.agentId) ?? {
        agentId: row.agentId,
        agentName: row.agentName,
        totalCalls: 0,
        connectedCalls: 0,
        rejectedCalls: 0,
        missedCalls: 0,
        notAnsweredCalls: 0,
        averageTalkSeconds: 0,
        averageTalkTime: "00:00",
        conversionRate: 0,
        performanceScore: 0,
      };
      current.totalCalls += 1;
      current.connectedCalls += row.status === "connected" ? 1 : 0;
      current.rejectedCalls += row.status === "rejected" ? 1 : 0;
      current.missedCalls += row.status === "missed" ? 1 : 0;
      current.notAnsweredCalls += row.status === "not_answered" ? 1 : 0;
      current.averageTalkSeconds += row.durationSeconds;
      current.conversionRate += isConvertedDisposition(row.disposition) ? 1 : 0;
      map.set(row.agentId, current);
      return map;
    }, new Map<string, any>()).values(),
  ).map((row) => ({
    ...row,
    averageTalkSeconds: row.totalCalls ? row.averageTalkSeconds / row.totalCalls : 0,
    averageTalkTime: formatReportDuration(row.totalCalls ? row.averageTalkSeconds / row.totalCalls : 0),
    conversionRate: row.connectedCalls ? Math.round((row.conversionRate / row.connectedCalls) * 100) : 0,
    performanceScore: buildPerformanceScore({
      totalCalls: row.totalCalls,
      connectedCalls: row.connectedCalls,
      convertedCalls: row.conversionRate,
      averageTalkSeconds: row.totalCalls ? row.averageTalkSeconds / row.totalCalls : 0,
    }),
  }));

  const bestPerformers = [...agentSummary].sort((left, right) => right.performanceScore - left.performanceScore).slice(0, 3);
  const lowPerformers = [...agentSummary].sort((left, right) => left.performanceScore - right.performanceScore).slice(0, 3);
  const dailyTrend = rows.reduce((map, row) => {
    const key = row.createdAt.slice(0, 10);
    const current = map.get(key) ?? { date: key, label: key, totalCalls: 0, connectedCalls: 0, averageDurationSeconds: 0 };
    current.totalCalls += 1;
    current.connectedCalls += row.status === "connected" ? 1 : 0;
    current.averageDurationSeconds += row.durationSeconds;
    map.set(key, current);
    return map;
  }, new Map<string, { date: string; label: string; totalCalls: number; connectedCalls: number; averageDurationSeconds: number }>());

  const selectedAgent = input.filters.agentId === "all"
    ? null
    : (() => {
        const agent = agentSummary.find((item) => item.agentId === input.filters.agentId);
        if (!agent) {
          return null;
        }
        return {
          ...agent,
          selectedRange: { from: input.filters.from, to: input.filters.to },
          dailyBreakdown: Array.from(dailyTrend.values()),
        };
      })();

  return {
    filters: input.filters,
    options: {
      campaigns: input.campaigns,
      agents: input.agents,
      statuses: [
        { value: "all", label: "All outcomes" },
        { value: "connected", label: "Connected" },
        { value: "rejected", label: "Rejected" },
        { value: "missed", label: "Missed" },
        { value: "not_answered", label: "Not answered" },
      ],
    },
    totals,
    campaignSummary,
    agentSummary,
    bestPerformers,
    lowPerformers,
    dailyTrend: Array.from(dailyTrend.values()).map((row) => ({
      ...row,
      averageDurationSeconds: row.totalCalls ? row.averageDurationSeconds / row.totalCalls : 0,
    })),
    statusMix: [
      { label: "connected", value: totals.connectedCalls },
      { label: "rejected", value: totals.rejectedCalls },
      { label: "missed", value: totals.missedCalls },
      { label: "not_answered", value: totals.notAnsweredCalls },
    ],
    individualAgent: selectedAgent,
  };
}

export async function loadReportsSummary(currentUser: User, filters: ReportFilters): Promise<ReportsSummaryResponse> { /* query Supabase and call aggregateReportsPayload */ }
export async function loadReportsRecords(currentUser: User, filters: ReportFilters): Promise<ReportsRecordsResponse> { /* query Supabase and map ReportCallRecord rows */ }
export async function loadReportsExport(currentUser: User, filters: ReportFilters): Promise<ReportsExportResponse> { /* fetch all filtered rows */ }
```

Add the SQL index migration so date-range and campaign filters stay fast:

```sql
create index if not exists call_logs_created_at_idx on public.call_logs (created_at desc);
create index if not exists call_logs_lead_id_idx on public.call_logs (lead_id);
create index if not exists call_logs_disposition_idx on public.call_logs (disposition);
create index if not exists leads_source_idx on public.leads (source);
```

The `api.ts` route layer should add:

```ts
if (pathname === "/reports/summary" && method === "GET") {
  const user = await requireSessionUser();
  if (user.role === "agent") throw new ApiError("Forbidden", { status: 403 });
  const filters = parseReportFilters(route.searchParams);
  return (await loadReportsSummary(user, filters)) as T;
}

if (pathname === "/reports/records" && method === "GET") {
  const user = await requireSessionUser();
  if (user.role === "agent") throw new ApiError("Forbidden", { status: 403 });
  const filters = parseReportFilters(route.searchParams);
  return (await loadReportsRecords(user, filters)) as T;
}

if (pathname === "/reports/export" && method === "GET") {
  const user = await requireSessionUser();
  if (user.role === "agent") throw new ApiError("Forbidden", { status: 403 });
  const filters = parseReportFilters(route.searchParams);
  return (await loadReportsExport(user, filters)) as T;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test client/src/services/reports.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/reports.ts client/src/services/reports.test.ts client/src/lib/api.ts supabase/migrations/20260523000000_reports_indexes.sql supabase/schema.sql
git commit -m "feat: add reports aggregation endpoints"
```

### Task 3: Build the reports dashboard hook and page UI

**Files:**
- Create: `client/src/hooks/useReportsDashboard.ts`
- Create: `client/src/components/reports/reportRecordColumns.ts`
- Create: `client/src/components/reports/reportRecordColumns.test.ts`
- Create: `client/src/components/reports/ReportsFilterBar.tsx`
- Create: `client/src/components/reports/ReportsSummaryCards.tsx`
- Create: `client/src/components/reports/ReportsCampaignSection.tsx`
- Create: `client/src/components/reports/ReportsAgentSection.tsx`
- Create: `client/src/components/reports/ReportsIndividualAgentSection.tsx`
- Create: `client/src/components/reports/ReportRecordsTable.tsx`
- Create: `client/src/components/reports/ReportsExportActions.tsx`
- Modify: `client/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { reportRecordColumns } from "./reportRecordColumns";

test("declares the report table columns in the expected order", () => {
  assert.deepEqual(
    reportRecordColumns.map((column) => column.label),
    ["Date and time", "Agent", "Customer", "Call status", "Duration", "Campaign", "Remarks"],
  );
  assert.deepEqual(
    reportRecordColumns.map((column) => column.key),
    ["createdAt", "agentName", "customerName", "status", "duration", "campaignName", "remarks"],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test client/src/components/reports/reportRecordColumns.test.ts`

Expected: fail until `reportRecordColumns.ts` exists.

- [ ] **Step 3: Write the minimal implementation**

```ts
export const reportRecordColumns = [
  { key: "createdAt", label: "Date and time" },
  { key: "agentName", label: "Agent" },
  { key: "customerName", label: "Customer" },
  { key: "status", label: "Call status" },
  { key: "duration", label: "Duration" },
  { key: "campaignName", label: "Campaign" },
  { key: "remarks", label: "Remarks" },
] as const;
```

`useReportsDashboard.ts` should own the URL-synced filter state and the backend fetches:

```ts
const deferredSearch = useDeferredValue(filters.search);
const requestFilters = useMemo(
  () => ({ ...filters, search: deferredSearch }),
  [filters, deferredSearch],
);

useEffect(() => {
  let active = true;
  setLoading(true);
  setError(null);

  Promise.all([
    apiRequest<ReportsSummaryResponse>(`/reports/summary?${serializeReportFilters(requestFilters).toString()}`),
    apiRequest<ReportsRecordsResponse>(`/reports/records?${serializeReportFilters(requestFilters).toString()}`),
  ])
    .then(([summaryResponse, recordsResponse]) => {
      if (!active) return;
      setSummary(summaryResponse);
      setRecords(recordsResponse);
    })
    .catch((fetchError) => {
      if (!active) return;
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load reports.");
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [requestFilters]);
```

`ReportsPage.tsx` should become a thin composition layer:

```tsx
export function ReportsPage() {
  const {
    filters,
    options,
    summary,
    records,
    loading,
    error,
    updateFilters,
    updateSort,
    updatePage,
    exportCsv,
    exportExcel,
    exportPdf,
    refresh,
  } = useReportsDashboard();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Campaign and agent reporting"
        description="Filter the current range, review call outcomes, compare agents, and export the exact filtered scope."
      />

      <ReportsFilterBar
        filters={filters}
        options={options}
        loading={loading}
        onFiltersChange={updateFilters}
        onRefresh={refresh}
        onExportCsv={exportCsv}
        onExportExcel={exportExcel}
        onExportPdf={exportPdf}
      />

      {error ? <AlertBanner tone="danger" title="Unable to load reports." message={error} /> : null}

      <ReportsSummaryCards totals={summary?.totals ?? null} loading={loading} />

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportsCampaignSection summary={summary} loading={loading} />
        <ReportsAgentSection summary={summary} loading={loading} />
      </div>

      <ReportsIndividualAgentSection summary={summary} loading={loading} />

      <ReportRecordsTable
        records={records?.items ?? []}
        page={records?.page ?? filters.page}
        pageSize={records?.pageSize ?? filters.pageSize}
        total={records?.total ?? 0}
        loading={loading}
        sortField={filters.sortField}
        sortDirection={filters.sortDirection}
        onSortChange={updateSort}
        onPageChange={updatePage}
      />
    </div>
  );
}
```

`ReportsFilterBar.tsx` should use a compact calendar-style filter strip with native date inputs, selects, and the export buttons:

```tsx
<div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
  <div className="grid gap-2">
    <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">From Date</label>
    <input type="date" value={filters.from} onChange={...} className="crm-input" />
  </div>
  <div className="grid gap-2">
    <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">To Date</label>
    <input type="date" value={filters.to} onChange={...} className="crm-input" />
  </div>
  <select value={filters.campaign} onChange={...}>{/* campaign options */}</select>
  <select value={filters.agentId} onChange={...}>{/* agent options */}</select>
  <select value={filters.status} onChange={...}>{/* status options */}</select>
  <input type="search" value={filters.search} onChange={...} aria-label="Search call records" className="crm-input" />
  <ReportsExportActions
    loading={loading}
    onCsv={onExportCsv}
    onExcel={onExportExcel}
    onPdf={onExportPdf}
  />
</div>
```

`ReportRecordsTable.tsx` should use `@tanstack/react-table` with manual sorting and pagination:

```tsx
const table = useReactTable({
  data: records,
  columns,
  manualSorting: true,
  manualPagination: true,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
  state: {
    sorting: [{ id: sortField, desc: sortDirection === "desc" }],
    pagination: { pageIndex: page - 1, pageSize },
  },
  onSortingChange: ...
});
```

`ReportsCampaignSection.tsx`, `ReportsAgentSection.tsx`, and `ReportsIndividualAgentSection.tsx` should each render one clear section with a chart, a compact table or summary card grid, and an empty state when the relevant payload is missing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test client/src/components/reports/reportRecordColumns.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useReportsDashboard.ts client/src/components/reports/reportRecordColumns.ts client/src/components/reports/reportRecordColumns.test.ts client/src/components/reports/ReportsFilterBar.tsx client/src/components/reports/ReportsSummaryCards.tsx client/src/components/reports/ReportsCampaignSection.tsx client/src/components/reports/ReportsAgentSection.tsx client/src/components/reports/ReportsIndividualAgentSection.tsx client/src/components/reports/ReportRecordsTable.tsx client/src/components/reports/ReportsExportActions.tsx client/src/pages/ReportsPage.tsx
git commit -m "feat: build reports dashboard ui"
```

### Task 4: Add export helpers and the print-friendly PDF route

**Files:**
- Create: `client/src/lib/reportExports.ts`
- Create: `client/src/lib/reportExports.test.ts`
- Create: `client/src/components/reports/ReportsPrintView.tsx`
- Create: `client/src/pages/ReportsPrintPage.tsx`
- Modify: `client/src/components/reports/ReportsExportActions.tsx`
- Modify: `client/src/components/layout/AppShell.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildReportCsv, buildReportWorkbook, buildReportsPrintUrl } from "./reportExports";

test("builds csv, workbook, and print url from the same filtered export rows", () => {
  const rows = [
    {
      id: "call-1",
      createdAt: "2026-05-23T09:00:00.000Z",
      agentName: "Olivia Hart",
      customerName: "Rahul Sharma",
      customerPhone: "9999999999",
      campaignName: "Google Ads",
      status: "connected",
      disposition: "Interested",
      duration: "01:00",
      remarks: "Asked for callback",
    },
  ];

  const csv = buildReportCsv(rows);
  const workbook = buildReportWorkbook(rows);
  const printUrl = buildReportsPrintUrl({
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

  assert.equal(csv.includes("Olivia Hart"), true);
  assert.equal(workbook.SheetNames.includes("Reports"), true);
  assert.equal(printUrl.includes("from=2026-05-01"), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test client/src/lib/reportExports.test.ts`

Expected: fail until `reportExports.ts` exists.

- [ ] **Step 3: Write the minimal implementation**

```ts
import { utils, writeFile } from "xlsx";
import type { ReportCallRecord, ReportFilters } from "./reports";
import { serializeReportFilters } from "./reports";

export function buildReportCsv(rows: Array<Record<string, string>>) {
  const worksheet = utils.json_to_sheet(rows);
  return utils.sheet_to_csv(worksheet);
}

export function buildReportWorkbook(rows: Array<Record<string, string>>) {
  const workbook = utils.book_new();
  const worksheet = utils.json_to_sheet(rows);
  utils.book_append_sheet(workbook, worksheet, "Reports");
  return workbook;
}

export function saveReportWorkbook(fileName: string, rows: Array<Record<string, string>>) {
  writeFile(buildReportWorkbook(rows), fileName);
}

export function buildReportsPrintUrl(filters: ReportFilters) {
  return `/reports/print?${serializeReportFilters(filters).toString()}`;
}

export function toPrintableReportRows(rows: ReportCallRecord[]) {
  return rows.map((row) => ({
    "Date and time": row.createdAt,
    Agent: row.agentName,
    Customer: `${row.customerName} (${row.customerPhone})`,
    "Call status": row.status,
    Duration: row.duration,
    Campaign: row.campaignName,
    Remarks: row.remarks,
  }));
}
```

`ReportsExportActions.tsx` should call the backend export endpoint, feed the rows through these helpers, and download the correct file type.

`ReportsPrintPage.tsx` should:

```tsx
const location = useLocation();
const filters = useMemo(() => parseReportFilters(new URLSearchParams(location.search)), [location.search]);
const [payload, setPayload] = useState<ReportsExportResponse | null>(null);

useEffect(() => {
  void apiRequest<ReportsExportResponse>(`/reports/export?${serializeReportFilters(filters).toString()}`)
    .then(setPayload);
}, [filters]);

useEffect(() => {
  if (!payload) return;
  const timer = window.setTimeout(() => window.print(), 150);
  return () => window.clearTimeout(timer);
}, [payload]);
```

`ReportsPrintView.tsx` should render a print-friendly summary, charts, and the exported rows without the app shell chrome.

`AppShell.tsx` should skip the full app chrome for the print route so the export renders as a clean report sheet:

```tsx
const location = useLocation();
if (location.pathname === "/reports/print") {
  return <Outlet />;
}
```

`App.tsx` should add the print route inside the authenticated manager area:

```tsx
<Route
  path="/reports/print"
  element={
    <ManagerRoute>
      <LazyPage>
        <ReportsPrintPage />
      </LazyPage>
    </ManagerRoute>
  }
/>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-strip-types --test client/src/lib/reportExports.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/reportExports.ts client/src/lib/reportExports.test.ts client/src/components/reports/ReportsPrintView.tsx client/src/pages/ReportsPrintPage.tsx client/src/components/layout/AppShell.tsx client/src/App.tsx
git commit -m "feat: add reports export and print flow"
```

### Task 5: Verify the reports stack end to end

**Files:**
- None; this is the final verification pass.

- [ ] **Step 1: Run the report-focused tests together**

Run:

```bash
node --experimental-strip-types --test client/src/lib/reports.test.ts client/src/services/reports.test.ts client/src/components/reports/reportRecordColumns.test.ts client/src/lib/reportExports.test.ts
```

Expected: PASS.

- [ ] **Step 2: Build and lint the client**

Run:

```bash
npm.cmd run build
npm.cmd run lint
```

Expected: both commands complete without TypeScript or bundler errors.

- [ ] **Step 3: Open the app and confirm the live behavior**

Run the dev server, open `/reports`, and verify:

- the top filter bar shows a From Date and To Date calendar-style range picker
- campaign, agent, status, and search filters update the dataset automatically
- summary cards, campaign charts, agent charts, and the call records table all reflect the same filtered scope
- CSV and Excel exports download the filtered rows
- PDF export opens the print route and prints a clean report sheet without the app chrome
- the page still stays behind the existing manager gate for `admin` and `team_leader`

- [ ] **Step 4: Commit any final polish**

```bash
git add client/src/pages/ReportsPage.tsx client/src/components/reports/*.tsx client/src/hooks/useReportsDashboard.ts client/src/services/reports.ts client/src/lib/api.ts supabase/migrations/20260523000000_reports_indexes.sql supabase/schema.sql
git commit -m "feat: ship reports dashboard"
```
