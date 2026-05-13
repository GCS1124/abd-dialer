import type { Lead } from "../types";
import { formatPhone } from "./utils";

export interface DialDestinationOption {
  value: string;
  label: string;
  phoneIndex?: number;
}

export interface LeadDialMatch {
  lead: Pick<Lead, "id" | "fullName" | "phone" | "altPhone" | "phoneNumbers">;
  phoneIndex: number;
  phoneNumber: string;
}

function normalizeDialNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function buildMatchVariants(value: string) {
  const normalized = normalizeDialNumber(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  if (normalized.length === 11 && normalized.startsWith("1")) {
    variants.add(normalized.slice(1));
  }
  if (normalized.length === 10) {
    variants.add(`1${normalized}`);
  }

  return [...variants];
}

function numbersMatch(left: string, right: string) {
  const leftVariants = buildMatchVariants(left);
  const rightVariants = buildMatchVariants(right);
  if (!leftVariants.length || !rightVariants.length) {
    return false;
  }

  return leftVariants.some((value) => rightVariants.includes(value));
}

function addOption(
  options: DialDestinationOption[],
  seen: Set<string>,
  rawValue: string,
  label: string,
  phoneIndex?: number,
) {
  const value = normalizeDialNumber(rawValue);
  if (!value || seen.has(value)) {
    return;
  }

  seen.add(value);
  options.push({
    value,
    label,
    phoneIndex,
  });
}

export function buildLeadDestinationOptions(
  lead: Pick<Lead, "phone" | "altPhone" | "phoneNumbers"> | null | undefined,
) {
  const options: DialDestinationOption[] = [];
  const seen = new Set<string>();
  const phoneNumbers = lead?.phoneNumbers?.length
    ? lead.phoneNumbers
    : [lead?.phone ?? "", lead?.altPhone ?? ""];

  phoneNumbers.forEach((phoneNumber, index) => {
    const labelPrefix = lead?.phoneNumbers?.length
      ? `Phone ${index + 1}`
      : index === 0
        ? "Primary"
        : "Alternate";

    addOption(options, seen, phoneNumber, `${labelPrefix} · ${formatPhone(phoneNumber)}`, index);
  });

  return options;
}

export function buildWorkspaceDestinationOptions(leads: Array<Pick<Lead, "fullName" | "phone" | "altPhone" | "phoneNumbers">>) {
  const options: DialDestinationOption[] = [];
  const seen = new Set<string>();

  leads.forEach((lead) => {
    const phoneNumbers = lead.phoneNumbers?.length ? lead.phoneNumbers : [lead.phone, lead.altPhone];

    phoneNumbers.forEach((phoneNumber) => {
      addOption(options, seen, phoneNumber, `${lead.fullName} · ${formatPhone(phoneNumber)}`);
    });
  });

  return options;
}

export function findLeadForDialNumber(
  leads: Array<Pick<Lead, "id" | "fullName" | "phone" | "altPhone" | "phoneNumbers">>,
  dialNumber: string,
): LeadDialMatch | null {
  const target = dialNumber.trim();
  if (!target) {
    return null;
  }

  for (const lead of leads) {
    const phoneNumbers = lead.phoneNumbers?.length ? lead.phoneNumbers : [lead.phone, lead.altPhone];
    for (let index = 0; index < phoneNumbers.length; index += 1) {
      const phoneNumber = phoneNumbers[index] ?? "";
      if (numbersMatch(phoneNumber, target)) {
        return {
          lead,
          phoneIndex: index,
          phoneNumber,
        };
      }
    }
  }

  return null;
}
