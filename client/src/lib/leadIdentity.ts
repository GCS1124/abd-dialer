type LeadIdentitySource = {
  fullName: string;
  company?: string | null;
  source?: string | null;
};

const ORGANIZATION_NAME_PATTERN =
  /\b(?:llc|l\.l\.c\.|inc|inc\.|corp|corporation|co\.?|company|companies|service|services|solution|solutions|group|agency|studio|consulting|cleaning|cleaners?|maids?|care|health|clinic|dental|law|legal|marketing|software|systems?|technology|tech|media|design|construction|contracting|properties|realty|moving|logistics|hospitality|restaurant|plumbing|electric|roofing|maintenance|security|transport)\b/i;

const ORGANIZATION_PUNCTUATION_PATTERN = /[&/,]/;

function normalizeLeadText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function isLikelyOrganizationName(value: string | null | undefined) {
  const normalized = normalizeLeadText(value);
  if (!normalized) {
    return false;
  }

  if (ORGANIZATION_PUNCTUATION_PATTERN.test(normalized)) {
    return true;
  }

  return ORGANIZATION_NAME_PATTERN.test(normalized);
}

export function getLeadDisplayName(lead: LeadIdentitySource) {
  const normalizedName = normalizeLeadText(lead.fullName);
  if (!normalizedName) {
    return "";
  }

  if (isLikelyOrganizationName(normalizedName)) {
    return "";
  }

  return normalizedName;
}

export function getLeadTitleName(lead: LeadIdentitySource) {
  const normalizedName = normalizeLeadText(lead.fullName);
  if (normalizedName) {
    return normalizedName;
  }

  return getLeadCompanyName(lead);
}

export function getLeadCompanyName(lead: LeadIdentitySource) {
  const normalizedCompany = normalizeLeadText(lead.company);
  if (normalizedCompany) {
    return normalizedCompany;
  }

  const normalizedName = normalizeLeadText(lead.fullName);
  if (isLikelyOrganizationName(normalizedName)) {
    return normalizedName;
  }

  return "";
}
