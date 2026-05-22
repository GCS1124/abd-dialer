import type { BreakType, TimeTrackingState } from "../types/index.ts";

const BREAK_TYPES: BreakType[] = ["freshen_up", "lunch", "tea", "meeting_training"];

const BREAK_LABELS: Record<BreakType, string> = {
  freshen_up: "Freshen Up Break",
  lunch: "Lunch Break",
  tea: "Tea Break",
  meeting_training: "Meeting / Training",
};

const BREAK_USAGE_LIMITS: Record<BreakType, number | null> = {
  freshen_up: null,
  lunch: 1,
  tea: 2,
  meeting_training: null,
};

function createEmptyBreakRecord() {
  return {
    freshen_up: 0,
    lunch: 0,
    tea: 0,
    meeting_training: 0,
  } satisfies Record<BreakType, number>;
}

function diffSeconds(startIso: string | null, nowIso: string) {
  if (!startIso) {
    return 0;
  }

  const start = Date.parse(startIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= start) {
    return 0;
  }

  return Math.floor((now - start) / 1000);
}

function formatDurationSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatElapsedDurationSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600).toString();
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function normalizeBreakRecord(record?: Partial<Record<BreakType, number>> | null) {
  const normalized = createEmptyBreakRecord();

  for (const breakType of BREAK_TYPES) {
    const rawValue = record?.[breakType];
    normalized[breakType] = typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0
      ? Math.floor(rawValue)
      : 0;
  }

  return normalized;
}

function isNormalizedBreakRecord(
  record: Partial<Record<BreakType, number>> | null | undefined,
  normalized: Record<BreakType, number>,
) {
  return BREAK_TYPES.every(
    (breakType) =>
      typeof record?.[breakType] === "number" && record[breakType] === normalized[breakType],
  );
}

export interface BreakMenuOptionState {
  value: BreakType;
  label: string;
  durationSeconds: number;
  durationLabel: string;
  usageCount: number;
  usageLimit: number | null;
  usageLabel: string | null;
  disabled: boolean;
  active: boolean;
}

export interface TimeTrackingPanelState {
  loginDurationLabel: string;
  activeBreakLabel: string | null;
  activeBreakDurationLabel: string | null;
  activeBreakUsageLabel: string | null;
  isOnBreak: boolean;
}

export function createInitialTimeTrackingState(nowIso = new Date().toISOString()): TimeTrackingState {
  return {
    status: "checked_out",
    checkedInAt: null,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: 0,
    activeBreakSeconds: 0,
    hasCheckedIn: false,
    breakUsageCounts: createEmptyBreakRecord(),
    breakDurationsSeconds: createEmptyBreakRecord(),
    lastUpdatedAt: nowIso,
  };
}

export function normalizeTimeTrackingState(
  state: TimeTrackingState | null | undefined,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  if (!state) {
    return createInitialTimeTrackingState(nowIso);
  }

  const breakUsageCounts = normalizeBreakRecord(state.breakUsageCounts);
  const breakDurationsSeconds = normalizeBreakRecord(state.breakDurationsSeconds);
  const inferredHasCheckedIn =
    state.status === "checked_in" ||
    state.status === "on_break" ||
    Boolean(state.checkedInAt) ||
    state.activeSessionSeconds > 0 ||
    state.activeBreakSeconds > 0 ||
    BREAK_TYPES.some(
      (breakType) => breakUsageCounts[breakType] > 0 || breakDurationsSeconds[breakType] > 0,
    );
  const hasCheckedIn = Boolean(state.hasCheckedIn) || inferredHasCheckedIn;

  if (
    isNormalizedBreakRecord(state.breakUsageCounts, breakUsageCounts) &&
    isNormalizedBreakRecord(state.breakDurationsSeconds, breakDurationsSeconds) &&
    typeof state.hasCheckedIn === "boolean" &&
    state.hasCheckedIn === hasCheckedIn &&
    state.lastUpdatedAt !== null &&
    state.breakUsageCounts &&
    state.breakDurationsSeconds
  ) {
    return state;
  }

  return {
    ...state,
    hasCheckedIn,
    breakUsageCounts,
    breakDurationsSeconds,
    lastUpdatedAt: state.lastUpdatedAt ?? nowIso,
  };
}

export function getDisplayedSeconds(state: TimeTrackingState, nowIso = new Date().toISOString()) {
  const liveActiveSeconds =
    state.status === "checked_in" ? diffSeconds(state.checkedInAt, nowIso) : 0;
  return Math.max(0, state.activeSessionSeconds + liveActiveSeconds);
}

export function getBreakMenuOptions(
  state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): BreakMenuOptionState[] {
  const normalized = normalizeTimeTrackingState(state, nowIso);

  return BREAK_TYPES.map((breakType) => {
    const usageCount = normalized.breakUsageCounts[breakType];
    const usageLimit = BREAK_USAGE_LIMITS[breakType];
    const isActive = normalized.status === "on_break" && normalized.breakType === breakType;
    const liveBreakSeconds =
      isActive ? diffSeconds(normalized.breakStartedAt, nowIso) : 0;
    const durationSeconds = normalized.breakDurationsSeconds[breakType] + liveBreakSeconds;
    const disabled =
      normalized.status !== "checked_in" ||
      (usageLimit !== null && usageCount >= usageLimit);

    return {
      value: breakType,
      label: BREAK_LABELS[breakType],
      durationSeconds,
      durationLabel: formatDurationSeconds(durationSeconds),
      usageCount,
      usageLimit,
      usageLabel:
        usageLimit === null ? null : `${usageCount}/${usageLimit} used`,
      disabled,
      active: isActive,
    };
  });
}

export function getTimeTrackingPanelState(
  state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): TimeTrackingPanelState {
  const normalized = normalizeTimeTrackingState(state, nowIso);
  const loginDurationLabel = formatElapsedDurationSeconds(getDisplayedSeconds(normalized, nowIso));
  const activeBreak = normalized.status === "on_break"
    ? getBreakMenuOptions(normalized, nowIso).find((option) => option.active) ?? null
    : null;

  return {
    loginDurationLabel,
    activeBreakLabel: activeBreak?.label ?? null,
    activeBreakDurationLabel: activeBreak?.durationLabel ?? null,
    activeBreakUsageLabel: activeBreak?.usageLabel ?? null,
    isOnBreak: normalized.status === "on_break",
  };
}

export function checkIn(
  state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  const normalized = normalizeTimeTrackingState(state, nowIso);

  return {
    ...normalized,
    status: "checked_in",
    checkedInAt: nowIso,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: 0,
    activeBreakSeconds: 0,
    hasCheckedIn: true,
    breakUsageCounts: createEmptyBreakRecord(),
    breakDurationsSeconds: createEmptyBreakRecord(),
    lastUpdatedAt: nowIso,
  };
}

export function startBreak(
  state: TimeTrackingState,
  breakType: BreakType,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  const normalized = normalizeTimeTrackingState(state, nowIso);

  if (normalized.status !== "checked_in") {
    return normalized;
  }

  const usageLimit = BREAK_USAGE_LIMITS[breakType];
  const usageCount = normalized.breakUsageCounts[breakType];
  if (usageLimit !== null && usageCount >= usageLimit) {
    return normalized;
  }

  return {
    ...normalized,
    status: "on_break",
    checkedInAt: null,
    breakStartedAt: nowIso,
    breakType,
    activeSessionSeconds: getDisplayedSeconds(normalized, nowIso),
    hasCheckedIn: true,
    breakUsageCounts: {
      ...normalized.breakUsageCounts,
      [breakType]: usageCount + 1,
    },
    lastUpdatedAt: nowIso,
  };
}

export function endBreak(
  state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  const normalized = normalizeTimeTrackingState(state, nowIso);

  if (normalized.status !== "on_break") {
    return normalized;
  }

  const breakType = normalized.breakType;
  const breakSeconds = diffSeconds(normalized.breakStartedAt, nowIso);
  const breakDurationsSeconds = { ...normalized.breakDurationsSeconds };

  if (breakType) {
    breakDurationsSeconds[breakType] += breakSeconds;
  }

  return {
    ...normalized,
    status: "checked_in",
    checkedInAt: nowIso,
    breakStartedAt: null,
    breakType: null,
    activeBreakSeconds: normalized.activeBreakSeconds + breakSeconds,
    hasCheckedIn: true,
    breakDurationsSeconds,
    lastUpdatedAt: nowIso,
  };
}

export function checkOut(
  state: TimeTrackingState,
  nowIso = new Date().toISOString(),
): TimeTrackingState {
  const normalized = normalizeTimeTrackingState(state, nowIso);
  const sessionSeconds =
    normalized.status === "checked_in"
      ? getDisplayedSeconds(normalized, nowIso)
      : normalized.activeSessionSeconds;
  const breakSeconds =
    normalized.status === "on_break"
      ? normalized.activeBreakSeconds + diffSeconds(normalized.breakStartedAt, nowIso)
      : normalized.activeBreakSeconds;
  const breakDurationsSeconds = { ...normalized.breakDurationsSeconds };

  if (normalized.status === "on_break" && normalized.breakType) {
    breakDurationsSeconds[normalized.breakType] += diffSeconds(normalized.breakStartedAt, nowIso);
  }

  return {
    ...normalized,
    status: "checked_out",
    checkedInAt: null,
    breakStartedAt: null,
    breakType: null,
    activeSessionSeconds: sessionSeconds,
    activeBreakSeconds: breakSeconds,
    hasCheckedIn: normalized.hasCheckedIn || normalized.status !== "checked_out",
    breakDurationsSeconds,
    lastUpdatedAt: nowIso,
  };
}
