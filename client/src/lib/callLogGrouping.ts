import type { CallLog } from "../types";

export interface MergedCallLog extends CallLog {
  mergedCallIds: string[];
  mergedCalls: CallLog[];
  mergedCount: number;
  recordingCallId: string | null;
  searchText: string;
}

const DEFAULT_MERGE_WINDOW_MS = 5 * 60 * 1000;

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function metadataCallScore(call: CallLog) {
  return [
    call.callType === "outgoing" ? 1_000_000 : 0,
    call.recordingUrl ? 1_000 : 0,
    call.recordingEnabled ? 100 : 0,
    call.status === "connected" ? 40 : call.status === "follow_up" ? 20 : 0,
    call.disposition === "Interested" ? 10 : call.disposition === "Not Interested" ? 5 : 0,
    call.source !== "failed_attempt" ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

function recordingCallScore(call: CallLog) {
  return [
    call.callType === "incoming" ? 1_000_000 : 0,
    call.recordingUrl ? 1_000 : 0,
    call.recordingEnabled ? 100 : 0,
    call.status === "connected" ? 40 : call.status === "follow_up" ? 20 : 0,
    call.source !== "failed_attempt" ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

function pickMetadataCall(calls: CallLog[]) {
  return [...calls].sort((left, right) => {
    const scoreDiff = metadataCallScore(right) - metadataCallScore(left);
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

function pickRecordingCall(calls: CallLog[]) {
  const recordingCalls = calls.filter((call) => call.recordingEnabled || Boolean(call.recordingUrl));
  const candidates = recordingCalls.length ? recordingCalls : calls;

  return [...candidates].sort((left, right) => {
    const scoreDiff = recordingCallScore(right) - recordingCallScore(left);
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
  const primaryCall = pickMetadataCall(calls);
  const recordingCall = pickRecordingCall(calls);

  return {
    ...primaryCall,
    recordingEnabled: calls.some((call) => call.recordingEnabled || Boolean(call.recordingUrl)),
    recordingUrl: recordingCall?.recordingUrl ?? primaryCall.recordingUrl ?? null,
    recordingCallId: recordingCall?.id ?? null,
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
