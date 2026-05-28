import type { CallLog } from "../types";

export interface MergedCallLog extends CallLog {
  mergedCallIds: string[];
  mergedCalls: CallLog[];
  mergedCount: number;
  searchText: string;
}

const DEFAULT_MERGE_WINDOW_MS = 5 * 60 * 1000;

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function callScore(call: CallLog) {
  return [
    call.recordingUrl ? 1_000 : 0,
    call.recordingEnabled ? 100 : 0,
    call.status === "connected" ? 40 : call.status === "follow_up" ? 20 : 0,
    call.disposition === "Interested" ? 10 : call.disposition === "Not Interested" ? 5 : 0,
    call.source !== "failed_attempt" ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

function pickPrimaryCall(calls: CallLog[]) {
  return [...calls].sort((left, right) => {
    const scoreDiff = callScore(right) - callScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const timeDiff = parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return right.id.localeCompare(left.id);
  })[0]!;
}

function buildSearchText(calls: CallLog[]) {
  return calls
    .flatMap((call) => [
      call.leadName,
      call.phone,
      call.agentName,
      call.disposition,
      call.notes,
      call.outcomeSummary,
      call.aiSummary,
      call.suggestedNextAction,
      call.followUpAt ?? "",
    ])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildMergedCallLog(calls: CallLog[]): MergedCallLog {
  const primaryCall = pickPrimaryCall(calls);
  const recordingCall = calls.find((call) => Boolean(call.recordingUrl)) ?? null;
  const noteCall = calls.find((call) => call.notes.trim()) ?? null;
  const outcomeCall = calls.find((call) => call.outcomeSummary.trim()) ?? null;
  const aiCall = calls.find((call) => call.aiSummary.trim()) ?? null;
  const nextActionCall = calls.find((call) => call.suggestedNextAction.trim()) ?? null;
  const followUpCall = calls.find((call) => Boolean(call.followUpAt)) ?? null;

  return {
    ...primaryCall,
    recordingEnabled: calls.some((call) => call.recordingEnabled || Boolean(call.recordingUrl)),
    recordingUrl: primaryCall.recordingUrl ?? recordingCall?.recordingUrl ?? null,
    notes: primaryCall.notes.trim() || noteCall?.notes || "",
    outcomeSummary: primaryCall.outcomeSummary.trim() || outcomeCall?.outcomeSummary || "",
    aiSummary: primaryCall.aiSummary.trim() || aiCall?.aiSummary || "",
    suggestedNextAction:
      primaryCall.suggestedNextAction.trim() || nextActionCall?.suggestedNextAction || "",
    followUpAt: primaryCall.followUpAt ?? followUpCall?.followUpAt ?? null,
    mergedCallIds: calls.map((call) => call.id),
    mergedCalls: calls,
    mergedCount: calls.length,
    searchText: buildSearchText(calls),
  };
}

export function mergeCallLogsForView(calls: CallLog[], mergeWindowMs = DEFAULT_MERGE_WINDOW_MS) {
  const sortedCalls = [...calls].sort((left, right) => {
    const timeDiff = parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return right.id.localeCompare(left.id);
  });

  const mergedGroups: CallLog[][] = [];
  let currentGroup: CallLog[] = [];
  let currentLeadId = "";
  let currentAgentId = "";
  let currentGroupAnchorTime = 0;

  const flushGroup = () => {
    if (!currentGroup.length) {
      return;
    }

    mergedGroups.push(currentGroup);
    currentGroup = [];
    currentLeadId = "";
    currentAgentId = "";
    currentGroupAnchorTime = 0;
  };

  for (const call of sortedCalls) {
    if (call.source === "failed_attempt") {
      flushGroup();
      mergedGroups.push([call]);
      continue;
    }

    const callTime = parseTimestamp(call.createdAt);
    const shouldMerge =
      currentGroup.length > 0 &&
      call.leadId === currentLeadId &&
      call.agentId === currentAgentId &&
      currentGroupAnchorTime - callTime <= mergeWindowMs;

    if (!shouldMerge) {
      flushGroup();
      currentGroup = [call];
      currentLeadId = call.leadId;
      currentAgentId = call.agentId;
      currentGroupAnchorTime = callTime;
      continue;
    }

    currentGroup.push(call);
  }

  flushGroup();

  return mergedGroups.map(buildMergedCallLog);
}
