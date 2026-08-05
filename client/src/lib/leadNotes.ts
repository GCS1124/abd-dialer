const WEBSITE_LINE_PATTERN = /^\s*Website:\s*(.+?)\s*$/i;
const WEBSITE_URL_PATTERN = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)\b/i;
const TIMEZONE_LINE_PATTERN = /^\s*Time Zone:\s*(.+?)\s*$/i;

function normalizeLeadWebsite(value: string) {
  return value.trim().replace(/[),.;]+$/g, "");
}

function normalizeLeadTimezone(value: string) {
  return value.trim().replace(/[),.;]+$/g, "");
}

function isLinkedInWebsite(value: string) {
  try {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const hostname = new URL(href).hostname.toLowerCase();
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function extractLeadWebsite(notes?: string | null) {
  if (!notes?.trim()) {
    return null;
  }

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(WEBSITE_LINE_PATTERN);
    if (match?.[1]) {
      const website = normalizeLeadWebsite(match[1]);
      if (website && !isLinkedInWebsite(website)) {
        return website;
      }
    }
  }

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(WEBSITE_URL_PATTERN);
    if (match?.[1]) {
      const website = normalizeLeadWebsite(match[1]);
      if (website && !isLinkedInWebsite(website)) {
        return website;
      }
    }
  }

  return null;
}

export function extractLeadTimezone(notes?: string | null) {
  if (!notes?.trim()) {
    return null;
  }

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(TIMEZONE_LINE_PATTERN);
    if (match?.[1]) {
      const timezone = normalizeLeadTimezone(match[1]);
      if (timezone) {
        return timezone;
      }
    }
  }

  return null;
}

export function stripLeadWebsiteFromNotes(notes?: string | null) {
  if (!notes?.trim()) {
    return "";
  }

  return notes
    .split(/\r?\n/)
    .filter((line) => !WEBSITE_LINE_PATTERN.test(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

export function stripLeadTimezoneFromNotes(notes?: string | null) {
  if (!notes?.trim()) {
    return "";
  }

  return notes
    .split(/\r?\n/)
    .filter((line) => !TIMEZONE_LINE_PATTERN.test(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

export function buildLeadWebsiteHref(value: string) {
  const website = normalizeLeadWebsite(value);
  if (!website) {
    return "";
  }

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
