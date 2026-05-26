# Unified Login and Break Time Tracking Design

## Goal

Unify login timing and break timing into one timestamp-based time-tracking model so the app can accurately show:

- Active System Time
- Total Break Time
- Total Login Hours

The model must keep the navbar and break menu synchronized, survive refreshes and restarts, and support multiple breaks in one session without counter drift.

## Scope

- Keep time tracking in the global authenticated navbar.
- Use one shared time-tracking state as the source of truth for login and break timing.
- Calculate all visible timers from timestamps plus persisted accumulated totals.
- Support multiple breaks in a single logged-in session.
- Show a single coherent summary of login and break time in the navbar and time-tracking menu.
- Persist the current session across refreshes and app restarts.
- Keep existing break usage limits and per-break labels.

## Non-goals

- No backend persistence for this phase.
- No new attendance history or reporting page.
- No auto-detection of idle time.
- No change to call access rules beyond reading the unified time-tracking state.
- No change to dialer queue behavior.
- No change to wrap-up or call flow timing logic beyond keeping it separate from login/break totals.

## Key Assumption

Time tracking remains client-managed in v1 and is persisted to localStorage per user. The app should treat the stored state as the source of truth and re-derive live values from timestamps on each render.

## Placement

Primary placement:

- Keep the controls in the existing global navbar.

Secondary placement:

- Reuse the same shared helper state in the existing break menu dropdown so the display and the menu always agree.

## Data Model

The current state model should remain timestamp-based and cumulative:

```ts
interface TimeTrackingState {
  status: "checked_out" | "checked_in" | "on_break";
  checkedInAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  hasCheckedIn: boolean;
  breakUsageCounts: Record<BreakType, number>;
  breakDurationsSeconds: Record<BreakType, number>;
  lastUpdatedAt: string | null;
}
```

The existing app may keep separate wrap-up fields for call-flow timing. That data can remain in the state object, but it must not be mixed into the login/break formulas in this design.

Rules for the core timestamps:

- `checkedInAt` marks the start of the current logged-in work segment.
- `breakStartedAt` marks the start of the current break segment.
- `activeSessionSeconds` stores all completed active work time accumulated so far in the current session.
- `activeBreakSeconds` stores all completed break time accumulated so far in the current session.
- `breakUsageCounts` tracks how many times each break type was used in the current session.
- `breakDurationsSeconds` tracks the completed duration for each break type.

## Derived Time Formulas

All displayed values must be derived from the stored timestamps and counters.

### Active System Time

Active System Time is the amount of logged-in work time excluding breaks.

Formula:

- if status is `checked_in`, `activeSessionSeconds + diff(checkedInAt, now)`
- if status is `on_break`, `activeSessionSeconds`
- if status is `checked_out`, `activeSessionSeconds`

This value must never go negative and must never count live break time.

### Total Break Time

Total Break Time is the sum of all completed breaks plus the current live break if one is active.

Formula:

- `activeBreakSeconds`
- plus `diff(breakStartedAt, now)` when status is `on_break`

### Total Login Hours

Total Login Hours is the total logged-in session time, including breaks.

Formula:

- `Active System Time + Total Break Time`

This is the value the user should understand as the full elapsed login period for the current session.

## State Transitions

### Check in

- Starts a fresh login session.
- Sets `status` to `checked_in`.
- Sets `checkedInAt` to now.
- Clears any active break fields.
- Resets per-session cumulative counters to zero.
- Preserves the fact that the user has checked in before.

### Start break

- Only allowed while checked in.
- Captures the elapsed active time into `activeSessionSeconds`.
- Sets `status` to `on_break`.
- Sets `breakStartedAt` to now.
- Stores the selected `breakType`.
- Increments the usage count for that break type.
- Does not reset the session.

### End break

- Only allowed while on break.
- Calculates the elapsed break duration from `breakStartedAt`.
- Adds that duration to `activeBreakSeconds`.
- Adds the same duration to the matching `breakDurationsSeconds[breakType]`.
- Clears `breakStartedAt` and `breakType`.
- Returns the user to `checked_in` with `checkedInAt` set to now so the next active segment continues from that point.

### Check out

- Can end a live checked-in session or a live break session.
- Finalizes any live active or break time into the cumulative totals before storing the checked-out state.
- Clears live timestamps.
- Keeps the accumulated totals so the display remains accurate after checkout.

## UX And Layout

### Navbar summary

- The primary time-tracking control should remain compact and pill-based.
- When checked out, show a clear `CHECK IN` action.
- When checked in, show `READY` with the live Active System Time.
- When on break, show `ON BREAK` with the current break name and live break duration.
- The visible summary should feel like one unified control, not separate competing timers.

### Time-tracking menu

- The dropdown or popover should show the three key numbers together:
  - Active System Time
  - Total Break Time
  - Total Login Hours
- The break picker should stay inside the same menu surface.
- Each break option should still show its own cumulative duration and usage label.
- When a break is active, the menu should clearly identify the current break and provide an end-break action.

### Live synchronization

- The navbar and menu should read from the same helper output.
- The timer should update every second while the user is logged in or on break.
- Refreshing the page should restore the current session and continue counting from timestamps without visible jumps.

## Error Handling

- If stored time-tracking data is corrupt, normalize to a safe `checked_out` state.
- If timestamps are missing or invalid, clamp values to zero rather than showing negative or broken values.
- If the app reloads during an active break, recover the break state from `breakStartedAt`.
- If the app reloads during an active login segment, recover the active segment from `checkedInAt`.
- If a per-break counter is malformed, reset only that counter rather than discarding the whole session unless the record is unusable.

## Component And Helper Architecture

Likely implementation surfaces:

- `client/src/lib/timeTracking.ts`
- `client/src/lib/timeTracking.test.ts`
- `client/src/hooks/useAppState.tsx`
- `client/src/components/layout/GlobalNavbar.tsx`
- `client/src/components/layout/BreakMenu.tsx`
- `client/src/types/index.ts`

Recommended helper responsibilities:

- `timeTracking.ts` should own all state transitions, normalization, and derived calculations.
- `useAppState.tsx` should persist and expose the state and action methods, but not duplicate timer math.
- `GlobalNavbar.tsx` should render the compact summary from helper output.
- `BreakMenu.tsx` should render the detailed breakdown and break options from the same helper output.

Suggested derived helper outputs:

- `activeSystemTimeLabel`
- `totalBreakTimeLabel`
- `totalLoginHoursLabel`
- `activeBreakLabel`
- `activeBreakDurationLabel`
- `activeBreakUsageLabel`

## Responsiveness And Accessibility

- Keep the navbar compact on desktop and still readable on mobile.
- Let the summary wrap gracefully without breaking the pill layout.
- Make the break menu keyboard accessible.
- Keep the live timer text readable and stable during updates.
- Use aria labels that explain the difference between active system time, break time, and total login time.

## Verification

- Logging in starts the active system timer.
- Starting a break pauses active work time and records the break start time.
- Ending a break resumes active work time without resetting the session.
- Multiple breaks in one session sum correctly.
- Total Login Hours always equals Active System Time plus Total Break Time.
- Refreshing the app keeps the displayed numbers accurate.
- The navbar and break menu show the same live state.
- No timer becomes negative or resets unexpectedly during an active session.

## Acceptance Criteria

- The app uses one timestamp-based time-tracking model for login and breaks.
- Active System Time, Total Break Time, and Total Login Hours are all shown clearly and stay synchronized.
- Multiple breaks are supported in one session.
- The state survives refreshes and restarts.
- The UI stays compact and consistent with the existing navbar design.
