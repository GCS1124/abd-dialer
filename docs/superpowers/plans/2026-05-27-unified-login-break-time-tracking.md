# Unified Login and Break Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify login and break timing into one timestamp-based model that accurately shows Active System Time, Total Break Time, and Total Login Hours while staying synchronized across the navbar, break menu, refreshes, and restarts.

**Architecture:** Keep `client/src/lib/timeTracking.ts` as the single source of truth for all timing math, state transitions, and display labels. The existing `TimeTrackingState` in `useAppState.tsx` already persists per user, so this work should tighten the helper outputs and wire the navbar/break menu to those derived values instead of introducing another timer store. Preserve wrap-up timing as a separate concern, but keep it out of the login/break totals.

**Tech Stack:** React, TypeScript, Vite, localStorage-backed app state, `node:test` with `--experimental-strip-types`, Tailwind CSS, lucide-react.

---

### Task 1: Add unified duration helpers and regression tests

**Files:**
- Modify: `client/src/lib/timeTracking.ts`
- Modify: `client/src/lib/timeTracking.test.ts`

- [ ] **Step 1: Write the failing test**

Add a regression that proves the three displayed totals are derived from timestamps and that multiple breaks compose correctly:

```ts
test("panel state derives active system time, total break time, and total login hours from multiple breaks", () => {
  const checkedIn = checkIn(
    createInitialTimeTrackingState("2026-05-27T09:00:00.000Z"),
    "2026-05-27T09:00:00.000Z",
  );
  const lunchBreak = startBreak(checkedIn, "lunch", "2026-05-27T09:15:00.000Z");
  const afterLunch = endBreak(lunchBreak, "2026-05-27T09:25:00.000Z");
  const teaBreak = startBreak(afterLunch, "tea", "2026-05-27T09:40:00.000Z");
  const panel = getTimeTrackingPanelState(teaBreak, "2026-05-27T09:45:00.000Z");

  assert.equal(panel.readyDurationLabel, "0:30:00");
  assert.equal(panel.activeSystemTimeLabel, "0:30:00");
  assert.equal(panel.totalBreakTimeLabel, "0:15:00");
  assert.equal(panel.totalLoginHoursLabel, "0:45:00");
  assert.equal(panel.activeBreakLabel, "Tea Break");
  assert.equal(panel.activeBreakDurationLabel, "05:00");
});
```

Also add a small normalization check so corrupted stored values still recover to a safe checked-out state without breaking the summary labels.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --test client/src/lib/timeTracking.test.ts
```

Expected: fail with missing `activeSystemTimeLabel`, `totalBreakTimeLabel`, or `totalLoginHoursLabel` until the helper is expanded.

- [ ] **Step 3: Write the minimal implementation**

Extend `TimeTrackingPanelState` and the helper layer so one function returns all summary labels from timestamp math:

```ts
export interface TimeTrackingPanelState {
  readyDurationLabel: string;
  activeSystemTimeLabel: string;
  totalBreakTimeLabel: string;
  totalLoginHoursLabel: string;
  activeBreakLabel: string | null;
  activeBreakDurationLabel: string | null;
  activeBreakUsageLabel: string | null;
  isOnBreak: boolean;
}

export function getActiveSystemSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()) {
  return getDisplayedSeconds(state, nowIso);
}

export function getTotalBreakSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()) {
  const normalized = normalizeTimeTrackingState(state, nowIso);
  const liveBreakSeconds =
    normalized.status === "on_break" ? diffSeconds(normalized.breakStartedAt, nowIso) : 0;
  return Math.max(0, normalized.activeBreakSeconds + liveBreakSeconds);
}

export function getTotalLoginSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()) {
  return Math.max(0, getActiveSystemSeconds(state, nowIso) + getTotalBreakSeconds(state, nowIso));
}

export function getTimeTrackingPanelState(state: TimeTrackingState, nowIso = new Date().toISOString()): TimeTrackingPanelState {
  const normalized = normalizeTimeTrackingState(state, nowIso);
  const activeSystemSeconds = getActiveSystemSeconds(normalized, nowIso);
  const totalBreakSeconds = getTotalBreakSeconds(normalized, nowIso);
  const totalLoginSeconds = getTotalLoginSeconds(normalized, nowIso);
  const activeBreak = normalized.status === "on_break"
    ? getBreakMenuOptions(normalized, nowIso).find((option) => option.active) ?? null
    : null;

  return {
    readyDurationLabel: formatElapsedDurationSeconds(activeSystemSeconds),
    activeSystemTimeLabel: formatElapsedDurationSeconds(activeSystemSeconds),
    totalBreakTimeLabel: formatElapsedDurationSeconds(totalBreakSeconds),
    totalLoginHoursLabel: formatElapsedDurationSeconds(totalLoginSeconds),
    activeBreakLabel: activeBreak?.label ?? null,
    activeBreakDurationLabel: activeBreak?.durationLabel ?? null,
    activeBreakUsageLabel: activeBreak?.usageLabel ?? null,
    isOnBreak: normalized.status === "on_break",
  };
}
```

Keep the existing `checkIn`, `startBreak`, `endBreak`, `startWrapUp`, `endWrapUp`, and `checkOut` transitions intact. The only new behavior in this task is the derived summary math and the new labels.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --experimental-strip-types --test client/src/lib/timeTracking.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/timeTracking.ts client/src/lib/timeTracking.test.ts
git commit -m "feat: unify login and break timing helpers"
```

### Task 2: Rework the navbar and break menu to show the unified summary

**Files:**
- Modify: `client/src/components/layout/GlobalNavbar.tsx`
- Modify: `client/src/components/layout/BreakMenu.tsx`

- [ ] **Step 1: Update the navbar to read the unified active-system label**

Keep the existing pill layout, but switch the visible timer value to `panelState.activeSystemTimeLabel` so the `READY` pill reflects Active System Time instead of a separate counter.

```tsx
<span className="uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
  Ready
</span>
<span className="font-semibold text-slate-700 dark:text-slate-100">
  {panelState.activeSystemTimeLabel}
</span>
```

When the user is on break, keep the existing `ON BREAK` label and replace the subline with the active break name plus live break duration from the same panel state:

```tsx
{timeTracking.status === "on_break" ? (
  <>
    <span>ON BREAK</span>
    <span className="text-[11px] font-semibold normal-case tracking-normal text-amber-800 dark:text-amber-100">
      {panelState.activeBreakLabel ?? "Break"} {"\u2022"} {panelState.activeBreakDurationLabel ?? "00:00"}
    </span>
  </>
) : (
  <span>{statusLabel}</span>
)}
```

- [ ] **Step 2: Add a compact three-value summary at the top of the break menu**

Add a small summary strip above the break list so the dropdown shows:

- Active System Time
- Total Break Time
- Total Login Hours

Use the same `getTimeTrackingPanelState()` output from Task 1 so the menu never recomputes its own timing logic.

```tsx
<div className="mt-3 grid gap-2 sm:grid-cols-3">
  <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
      Active System Time
    </p>
    <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
      {panelState.activeSystemTimeLabel}
    </p>
  </div>
  <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
      Total Break Time
    </p>
    <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
      {panelState.totalBreakTimeLabel}
    </p>
  </div>
  <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
      Total Login Hours
    </p>
    <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
      {panelState.totalLoginHoursLabel}
    </p>
  </div>
</div>
```

Leave the break options, per-break durations, and usage limits unchanged so the menu still controls break selection exactly as before.

- [ ] **Step 3: Run a browser smoke check**

Open the authenticated app and confirm:

- the navbar still shows `CHECK IN` / `CHECK OUT` correctly
- the `READY` pill shows live Active System Time
- when on break, the pill shows the break name and live break duration
- the break menu shows all three summary values and the existing break options

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/GlobalNavbar.tsx client/src/components/layout/BreakMenu.tsx
git commit -m "feat: show unified time tracking summary"
```

### Task 3: Verify refresh/restart recovery and finalize the release

**Files:**
- None; this is the final verification pass.

- [ ] **Step 1: Re-run the time-tracking test file**

Run:

```bash
node --experimental-strip-types --test client/src/lib/timeTracking.test.ts
```

Expected: PASS.

- [ ] **Step 2: Build and lint the client**

Run:

```bash
npm.cmd run build
npm.cmd run lint
```

Expected: both commands complete without TypeScript or bundler errors.

- [ ] **Step 3: Verify refresh behavior in the browser**

In the authenticated app:

- check in
- start a break
- wait long enough for the live timers to change
- refresh the page
- confirm the navbar still shows the correct break state
- end the break
- confirm `Active System Time + Total Break Time = Total Login Hours`
- start a second break in the same session and confirm the totals keep accumulating instead of resetting

- [ ] **Step 4: Commit any final polish**

If the browser pass reveals any copy or spacing fixes, commit them with:

```bash
git add client/src/lib/timeTracking.ts client/src/lib/timeTracking.test.ts client/src/components/layout/GlobalNavbar.tsx client/src/components/layout/BreakMenu.tsx
git commit -m "fix: finalize unified time tracking"
```
