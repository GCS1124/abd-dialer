# Reports Section Design

## Goal

Build a complete Reports section for the calling and campaign management dashboard that feels native to the existing CRM, but is backed by a dedicated reporting API instead of client-side analytics math.

The Reports page should let admins and team leaders:

- choose a date range with a from/to calendar filter
- filter by campaign, agent, and call status
- review overall campaign performance
- compare all agents
- drill into one agent's performance
- inspect raw call records
- export the filtered report scope to CSV, Excel, or PDF

## Scope

- Replace the current lightweight Reports page with a full reporting workspace.
- Add a dedicated reports aggregation API in the app's backend/service layer.
- Make all report cards, charts, and tables update from backend data when filters change.
- Add a date-range picker at the top of the page.
- Add campaign, agent, and status filters.
- Add search and sorting for the report tables.
- Add export buttons for CSV, Excel, and PDF.
- Keep Reports accessible only to `admin` and `team_leader`.

## Non-goals

- No agent-facing Reports access.
- No changes to the dialer call flow.
- No changes to call creation or disposition UX.
- No separate standalone reporting product.
- No requirement to build a fully generic BI tool.
- No need to introduce a separate campaign table in v1.

## Key Assumption

There is no first-class campaign table in the current schema. For v1, campaign reporting will be derived from `leads.source`:

- non-empty `leads.source` values are treated as campaign names/keys
- missing or blank values are grouped under `Uncategorized`
- if a true campaign entity is added later, the backend aggregation layer should be able to swap to that source without changing the page layout

If the product wants a dedicated campaign table before implementation, that is a separate schema project.

## Placement

Primary placement:

- Use the existing `/reports` route and upgrade it into a full reporting workspace.

Access:

- Keep the route behind the existing manager gate so only `admin` and `team_leader` can open it.

## Data And API Contract

The Reports page should not compute its metrics from `analytics` in app state.
Instead, it should fetch filtered data from a dedicated reports API surface.

Suggested endpoints:

- `GET /reports/summary`
- `GET /reports/records`
- `GET /reports/export`

Suggested query parameters:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `campaign=<campaign-key-or-all>`
- `agentId=<user-id-or-all>`
- `status=<all|connected|rejected|missed|not_answered>`
- `search=<text>`
- `sort=<field>:<direction>`
- `page=<number>`
- `pageSize=<number>`
- `format=<csv|xlsx|pdf>` for exports

The frontend should treat these like normal backend API contracts even if the first implementation is wired through the existing `apiRequest()` layer.

### Summary response shape

```json
{
  "range": {
    "from": "2026-05-01",
    "to": "2026-05-23"
  },
  "filters": {
    "campaign": "all",
    "agentId": "all",
    "status": "all",
    "search": ""
  },
  "options": {
    "campaigns": [
      { "key": "Google Ads", "label": "Google Ads" },
      { "key": "Uncategorized", "label": "Uncategorized" }
    ],
    "agents": [
      { "id": "u1", "name": "Olivia Hart" }
    ]
  },
  "summary": {
    "overallCampaign": {
      "totalCalls": 1240,
      "connectedCalls": 760,
      "rejectedCalls": 88,
      "missedCalls": 144,
      "notAnsweredCalls": 248,
      "totalDurationSeconds": 62400,
      "averageCallDurationSeconds": 50,
      "averageCallDuration": "00:50",
      "conversionRate": 18
    },
    "agentsPerformance": {
      "totalAgents": 14,
      "totalCallsHandled": 1240,
      "averageTalkTimeSeconds": 50,
      "bestPerformers": [],
      "lowPerformers": [],
      "comparison": []
    },
    "campaignPerformance": [],
    "individualAgent": null,
    "dailyTrend": [],
    "statusMix": [],
    "export": {
      "csvAvailable": true,
      "xlsxAvailable": true,
      "pdfAvailable": true
    }
  }
}
```

### Records response shape

```json
{
  "page": 1,
  "pageSize": 25,
  "total": 1240,
  "hasNextPage": true,
  "items": [
    {
      "id": "call_1",
      "createdAt": "2026-05-23T10:30:00.000Z",
      "agentId": "u1",
      "agentName": "Olivia Hart",
      "customerName": "Rahul Sharma",
      "customerPhone": "9999999999",
      "campaignKey": "Google Ads",
      "campaignName": "Google Ads",
      "status": "connected",
      "disposition": "Interested",
      "durationSeconds": 57,
      "duration": "00:57",
      "remarks": "Customer requested a callback",
      "leadId": "lead_1"
    }
  ]
}
```

## Reporting Rules

### Date range

- The default range should be the current calendar month to date.
- The user can adjust both dates independently.
- Changing either date should refetch the report summary and record list.
- The page should not require a full refresh to update data.

### Status buckets

The report should surface the user-requested call status buckets as derived values:

- `connected` = answered/connected calls
- `rejected` = calls rejected by the customer or a wrong-number style outcome
- `missed` = failed or dropped attempts
- `not answered` = no answer / voicemail style outcomes

Suggested mapping from current data:

- `connected` from `call_logs.call_status = connected`
- `rejected` from dispositions like `Busy` and `Wrong Number`
- `missed` from `call_logs.call_status = failed` and `Failed Attempt`
- `not answered` from `No Answer` and `Voicemail`

If future data contains a distinct rejected status, the aggregation helper should prefer that explicit value.

### Conversion rate

- Define conversion rate as `converted calls / connected calls`.
- `converted calls` should start with `Appointment Booked` and `Sale Closed`.
- Keep the formula in a reusable helper so the business definition can change later without rewriting the UI.

### Performance score

- Use a 0-100 derived score for agent ranking.
- Base it on connection rate, conversion rate, and call volume.
- The exact weights should live in a shared helper so the ranking logic is repeatable and testable.

## UX And Layout

### Top filter bar

The page should start with a compact, sticky filter bar containing:

- a calendar-style date range picker with `From Date` and `To Date`
- campaign dropdown
- agent dropdown/search
- call status filter
- search input for records
- export buttons for CSV, Excel, and PDF

The filter bar should look clean and operational, not like a generic form.

### Summary section

Show summary cards for the main KPIs:

- total calls
- connected calls
- rejected calls
- missed calls
- not answered calls
- total duration
- average call duration
- conversion rate
- total agents

### Overall Campaign Report

Include a campaign performance area with:

- a campaign summary chart
- a campaign comparison table
- a conversion snapshot by campaign
- a call status mix visualization

### All Agents Performance Report

Include an agent performance area with:

- total agents
- total calls handled
- connected / missed / rejected breakdown
- average talk time
- best performing agents
- low performing agents
- agent-wise comparison chart

### Individual Agent Report

Include a drill-down card or panel driven by the selected agent filter:

- agent name
- selected date range
- total calls
- connected calls
- missed calls
- rejected calls
- not answered calls
- total call duration
- average talk time
- performance score
- daily performance breakdown
- call log subset for that agent

### Call Records Section

Include a searchable, sortable table with these columns:

- date and time
- agent name
- customer name / number
- call status
- duration
- campaign name
- remarks / status update

The table should support pagination so the UI stays responsive on large datasets.

### Charts

Use charts for the views that benefit from visual comparison:

- daily trend chart for calls and connected calls
- campaign performance summary chart
- agent performance comparison chart
- call status mix chart

The page can reuse the existing chart styling language, but it should feel purpose-built for reporting.

## Component Architecture

Create focused report components rather than one large page component:

- `ReportsPage`
  - page shell, data loading orchestration, and section composition
- `ReportsFilterBar`
  - date range, campaign, agent, status, search, and export controls
- `ReportsSummaryCards`
  - top KPI cards
- `CampaignPerformanceSection`
  - campaign charts and campaign summary table
- `AgentPerformanceSection`
  - agent charts, best/low performer cards, and comparison table
- `IndividualAgentReport`
  - selected agent drill-down and daily breakdown
- `ReportRecordsTable`
  - searchable, sortable, paginated call records table
- `ReportExportActions`
  - download buttons and export state

Suggested helper layer:

- `client/src/lib/reports.ts`
  - shared report types, filter normalization, bucketing, sorting, and export row shaping
- `client/src/services/reports.ts`
  - backend-facing report queries and exports
- `client/src/lib/reports.test.ts`
  - aggregation, bucket mapping, and score calculations

## Backend Aggregation Strategy

The backend layer should query only the filtered date range and derive the totals there, instead of pulling the full workspace into the browser.

Recommended query model:

- query `call_logs` within the requested date range
- join `leads` for customer and campaign fields
- join `app_users` for agent display names
- apply campaign, agent, status, and search filters in the query layer where possible
- return paginated records for the table
- return aggregated metrics for the summary and chart sections

Performance notes:

- add or verify an index on `call_logs.created_at`
- add or verify an index on `leads.source` for campaign filtering
- keep the existing `call_logs.agent_id, created_at desc` index
- keep aggregation helpers pure so they can be unit tested

If a future implementation uses Supabase RPC functions instead of the current service layer, the API contract above should stay the same.

## Export Handling

Export buttons should honor the current filter state.

- CSV export should contain the filtered record rows.
- Excel export should contain the same rows with headers and basic formatting.
- PDF export should use a print-friendly summary plus the current record scope.

The exports should not ignore the selected date range or filters.

## Empty And Error States

- If no date range is selected, default to the current month to date.
- If the selected scope has no data, show a clear empty state in the relevant section rather than blank tables.
- If a request fails, show a retryable error banner.
- If a table filter returns zero rows, keep the summary cards visible and explain that the table scope is empty.

## Responsiveness And Accessibility

- The filter bar should stack cleanly on smaller screens.
- Charts should collapse to one column on mobile.
- Tables should remain readable with horizontal scrolling or card-like rows on narrow viewports.
- All buttons, selects, and chart controls must have visible focus states.
- Date controls should be keyboard accessible.
- Report sections should use descriptive headings so screen readers can navigate the page logically.

## Verification

- The Reports page loads with a default date range and shows backend-fed data.
- Changing the date range updates the summary cards, charts, and tables.
- Campaign, agent, and status filters all affect the fetched dataset.
- Search and sorting work in the records table.
- Export buttons honor the current report scope.
- Manager-only access still blocks agents from opening Reports.
- Build, lint, and report-related tests pass.

## Acceptance Criteria

- The Reports section is a complete management dashboard, not just a basic summary page.
- Date-range filtering is available at the top of the page and drives all reporting data.
- The page includes overall campaign, agent performance, individual agent, and call record sections.
- Charts, tables, summary cards, and export actions all reflect the same filtered report scope.
- The implementation uses a dedicated backend aggregation path and does not compute everything from app state.
- The page remains responsive and usable with larger data sets.
