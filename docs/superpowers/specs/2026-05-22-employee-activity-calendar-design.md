# Employee Activity Calendar Design

## Goal

Add a management-facing "Employee Activity Calendar" to the dialer portal so admins and team leaders can review employee-wise daily call activity in a month view, then drill into the records for any date.

The feature should feel like part of the existing CRM, not a separate reporting app.

## Scope

- Add the feature inside the Dialer section as a new tab or panel named `Employee Calendar`.
- Restrict access to `admin` and `team_leader` roles.
- Let the user select an employee/agent and a month.
- Render a monthly calendar with per-day summary counts and color indicators.
- Open a detail view for the selected day with the underlying call records.
- Support loading, empty, and error states.
- Reuse existing workspace call data in v1; no schema migration is required.

## Non-goals

- No new database tables in v1.
- No separate analytics backend service in v1.
- No agent-facing access.
- No edit actions from the calendar.
- No date-range report builder beyond the selected month.
- No changes to call creation or dialer call flow.

## Placement

Primary placement:

- Add a new `Employee Calendar` tab in the dialer workspace area, alongside the existing history/notes/timeline tabs.

Secondary reuse:

- The calendar component can be reused later from Reports if we want a broader admin entry point, but the first implementation should live in Dialer.

## Data And API Contract

The feature should expose a route shaped like:

`GET /api/admin/employee-activity-calendar?employeeId=<id>&month=<yyyy-mm>`

In the current app architecture, this can be implemented inside the existing `apiRequest()` layer and backed by workspace data loaded from Supabase. The frontend should treat it like a normal API contract even if the initial implementation is local to the app.

Suggested response shape:

```json
{
  "employeeId": "123",
  "employeeName": "Asha Rao",
  "month": "2026-05",
  "timezone": "Asia/Kolkata",
  "days": [
    {
      "date": "2026-05-01",
      "totalCalls": 12,
      "connectedCalls": 7,
      "interested": 3,
      "notInterested": 4,
      "disposedCompleted": 2,
      "failed": 3,
      "totalTalkTimeSeconds": 684,
      "averageDurationSeconds": 57,
      "averageDuration": "00:57",
      "records": [
        {
          "time": "10:30 AM",
          "customerName": "Rahul",
          "phone": "9999999999",
          "status": "Interested",
          "disposition": "Follow-Up Required",
          "durationSeconds": 57,
          "duration": "00:57",
          "notes": "Customer asked for callback"
        }
      ]
    }
  ]
}
```

### Aggregation rules

- Use call logs from the selected employee only.
- Bucket by the selected month.
- Group by the employee's timezone when available; otherwise fall back to the active browser/user timezone.
- The selector should list all non-admin employees who can own call history, sorted by name.
- `totalCalls` counts all matching call records.
- `connectedCalls` counts calls that reached a connected state.
- `interested` counts records with disposition `Interested`.
- `notInterested` counts records with disposition `Not Interested`.
- `disposedCompleted` counts the finalized outcomes that the product currently treats as completed, starting with `Appointment Booked` and `Sale Closed`.
- `failed` counts `No Answer`, `Busy`, `Voicemail`, `Wrong Number`, `Failed Attempt`, and similar non-connected outcomes.
- Empty days should still render as calendar cells with `No activity`.

The exact mapping for `disposedCompleted` should live in a reusable helper so it can be adjusted without changing the UI layout.

## UX And Layout

### Calendar header

- Employee selector with search.
- Month label.
- Previous and next month buttons.
- Optional status/disposition filter chip or dropdown.

### Calendar grid

- Show a standard month grid with weekday headers.
- Keep the layout rounded, soft-shadowed, and compact.
- Show today's date with a strong highlight.
- Show the selected date with a clear border or background.
- Show per-day indicator dots or stacked badges for mixed outcomes:
  - green = Interested
  - blue = Not Interested
  - purple or teal = Disposed / Completed
  - red = Call cut / Failed / Not connected
  - grey = No activity
- Each populated day card should show quick counts, not a dense table.

### Details view

- Clicking a date opens a responsive `ActivityDetailsModal`.
- On desktop, the modal can behave like a right-side panel or wide dialog.
- On mobile, it should collapse to a full-screen sheet/modal.
- The detail view should show:
  - call time
  - customer name/number
  - call status
  - disposition
  - duration
  - notes if available

## Empty And Error States

- If no employee is selected, show: `Please select an employee to view calendar activity.`
- If the selected employee has no activity in the month, show: `No call activity found for this month.`
- If loading is in progress, show a compact skeleton or placeholder grid.
- If the request fails, show a clear retryable error state.

## Component Architecture

Create a small set of reusable components:

- `EmployeeActivityCalendar`
  - Container component that owns selection state, month navigation, data loading, and the active date.
- `CalendarDayCard`
  - Renders a single day cell with counts, dots, selection state, and empty-state treatment.
- `ActivityDetailsModal`
  - Shows all records for the selected day.
- `StatusLegend`
  - Explains the color mapping for outcomes.

Recommended helper layer:

- `client/src/lib/employeeActivityCalendar.ts`
  - Pure aggregation helpers for month grouping, status bucketing, and date formatting.
- `client/src/lib/employeeActivityCalendar.test.ts`
  - Unit tests for grouping, counts, and empty-state behavior.

This keeps the UI thin and makes the calendar logic reusable if Reports later needs the same data.

## Routing And Access

- Keep the first implementation on the `/dialer` page.
- Show the tab only to `admin` and `team_leader`.
- If a non-management user hits the data route directly, return a safe forbidden/empty response.

## Responsiveness And Accessibility

- The calendar must work on desktop and mobile.
- Buttons need keyboard focus styles.
- The employee selector must be searchable and usable with the keyboard.
- The modal must trap focus and close cleanly with Escape.
- Calendar cells should have accessible labels that include the date and summary counts.

## Verification

- Management users can open the dialer and access the `Employee Calendar` tab.
- Selecting an employee and month shows daily summaries.
- Clicking a day opens the detailed record view.
- Calendar colors match the outcome buckets.
- Empty selection and empty month states match the required copy.
- No backend call is made for unsupported roles.
- Build, lint, and unit tests pass.

## Acceptance Criteria

- Admins and team leaders can visually inspect employee call activity by month inside the dialer.
- The calendar is clean, modern, and responsive.
- Each date shows a useful summary of call outcomes.
- A date click reveals the underlying call records.
- The implementation reuses current workspace call data and does not require a schema change in v1.
