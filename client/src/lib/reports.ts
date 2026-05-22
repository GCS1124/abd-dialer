export type ReportStatusFilter = "all" | "connected" | "rejected" | "missed" | "not_answered";

export type ReportSortField =
  | "createdAt"
  | "durationSeconds"
  | "agentName"
  | "customerName"
  | "campaignName"
  | "status";

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

const REPORT_STATUS_VALUES: ReportStatusFilter[] = [
  "all",
  "connected",
  "rejected",
  "missed",
  "not_answered",
];

const REPORT_SORT_FIELDS: ReportSortField[] = [
  "createdAt",
  "durationSeconds",
  "agentName",
  "customerName",
  "campaignName",
  "status",
];

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function parseLocalDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);

    if (isValidDate(parsed) && parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed;
    }

    return null;
  }

  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : null;
}

function normalizeDateString(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = parseLocalDateString(trimmed);
  return parsed ? formatDate(parsed) : fallback;
}

function normalizeOptionalString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? fallback) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreRate(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return clamp(part / total, 0, 1);
}

export function createDefaultReportFilters(referenceDate = new Date()): ReportFilters {
  const safeReference = isValidDate(referenceDate) ? referenceDate : new Date();

  return {
    from: formatDate(startOfMonth(safeReference)),
    to: formatDate(safeReference),
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
  const status = REPORT_STATUS_VALUES.includes(input.status ?? "all") ? (input.status ?? "all") : "all";
  const sortField = REPORT_SORT_FIELDS.includes(input.sortField ?? "createdAt")
    ? (input.sortField ?? "createdAt")
    : "createdAt";
  const sortDirection = input.sortDirection === "asc" ? "asc" : "desc";

  return {
    from: normalizeDateString(input.from, defaults.from),
    to: normalizeDateString(input.to, defaults.to),
    campaign: normalizeOptionalString(input.campaign) || "all",
    agentId: normalizeOptionalString(input.agentId) || "all",
    status,
    search: normalizeOptionalString(input.search),
    sortField,
    sortDirection,
    page: normalizePositiveInteger(input.page, 1),
    pageSize: normalizePositiveInteger(input.pageSize, 25),
  };
}

export function parseReportFilters(searchParams: URLSearchParams, referenceDate = new Date()): ReportFilters {
  const sortValue = searchParams.get("sort") ?? "createdAt:desc";
  const [sortFieldRaw = "createdAt", sortDirectionRaw = "desc"] = sortValue.split(":");

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

export function serializeReportFilters(filters: ReportFilters): URLSearchParams {
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

export function campaignLabelFromSource(source: string | null | undefined): string {
  const value = normalizeOptionalString(source);
  return value || "Uncategorized";
}

export function classifyReportStatus(input: { callStatus: string; disposition: string }): ReportStatusFilter {
  const callStatus = normalizeOptionalString(input.callStatus).toLowerCase();
  const disposition = normalizeOptionalString(input.disposition).toLowerCase();

  if (callStatus === "missed" || callStatus === "failed" || disposition === "failed attempt") {
    return "missed";
  }

  if (disposition === "busy" || disposition === "wrong number") {
    return "rejected";
  }

  if (disposition === "no answer" || disposition === "voicemail") {
    return "not_answered";
  }

  if (callStatus === "connected") {
    return "connected";
  }

  return "connected";
}

export function formatReportDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildPerformanceScore(input: {
  totalCalls: number;
  connectedCalls: number;
  convertedCalls: number;
  averageTalkSeconds: number;
}): number {
  if (input.totalCalls <= 0) {
    return 0;
  }

  const totalCallsScore = clamp(input.totalCalls, 0, 100) / 100 * 20;
  const connectedScore = scoreRate(input.connectedCalls, input.totalCalls) * 40;
  const convertedScore = scoreRate(input.convertedCalls, input.totalCalls) * 20;
  const talkScore = clamp(input.averageTalkSeconds, 0, 120) / 120 * 20;

  return clamp(Math.floor(totalCallsScore + connectedScore + convertedScore + talkScore), 0, 100);
}
