import type { CallDisposition } from "../../types";

export function buildDispositionOutcomeSummary(
  disposition: CallDisposition,
  notes: string,
  leadName: string,
  context?: {
    mainDispositionLabel?: string | null;
    subDispositionLabel?: string | null;
    customDispositionLabel?: string | null;
    nextStep?: string | null;
    notInterestedReason?: string | null;
  },
) {
  const trimmedNotes = notes.trim();
  const baseDispositionLabel = context?.mainDispositionLabel ?? disposition;
  const detailDispositionLabel =
    context?.customDispositionLabel?.trim() || context?.subDispositionLabel?.trim() || null;
  const groupedDispositionLabel =
    detailDispositionLabel && detailDispositionLabel !== baseDispositionLabel
      ? `${baseDispositionLabel} / ${detailDispositionLabel}`
      : baseDispositionLabel;
  const baseSummary = `${groupedDispositionLabel} for ${leadName}.`;
  const extraParts = [
    context?.nextStep ? `Next step: ${context.nextStep}.` : "",
    context?.notInterestedReason ? `Reason: ${context.notInterestedReason}.` : "",
  ].filter(Boolean);

  const notesSummary = trimmedNotes ? `Notes: ${trimmedNotes}` : "";
  return [baseSummary, ...extraParts, notesSummary].filter(Boolean).join(" ");
}

export function isPostCallSaveDisabled(input: {
  saving: boolean;
  needsCallbackTime: boolean;
  callbackAt: string;
  needsFollowUpTime?: boolean;
  followUpAt?: string;
  needsNotInterestedReason?: boolean;
  notInterestedReason?: string;
}) {
  return (
    Boolean(
      input.saving ||
        (input.needsCallbackTime && !input.callbackAt) ||
        (input.needsFollowUpTime && !input.followUpAt) ||
        (input.needsNotInterestedReason && !input.notInterestedReason),
    )
  );
}
