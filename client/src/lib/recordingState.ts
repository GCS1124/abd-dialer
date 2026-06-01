import type { CallLog } from "../types";

export type RecordingStatus = "Ready" | "Processing" | "Unavailable";

export interface RecordingState {
  hasRecordingUrl: boolean;
  status: RecordingStatus;
  toneClass: string;
}

export function getRecordingState(call: Pick<CallLog, "recordingEnabled" | "recordingUrl">): RecordingState {
  const hasRecordingUrl = Boolean(call.recordingUrl);
  const status: RecordingStatus = hasRecordingUrl
    ? "Ready"
    : call.recordingEnabled
      ? "Processing"
      : "Unavailable";

  const toneClass = hasRecordingUrl
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
    : call.recordingEnabled
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return {
    hasRecordingUrl,
    status,
    toneClass,
  };
}
