const WEBSITE_LINE_PATTERN = /^\s*Website:\s*(.+?)\s*$/i;
const WEBSITE_URL_PATTERN = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)\b/i;

function normalizeLeadWebsite(value: string) {
  return value.trim().replace(/[),.;]+$/g, "");
}

export function extractLeadWebsite(notes?: string | null) {
  if (!notes?.trim()) {
    return null;
  }

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(WEBSITE_LINE_PATTERN);
    if (match?.[1]) {
      const website = normalizeLeadWebsite(match[1]);
      if (website) {
        return website;
      }
    }
  }

  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(WEBSITE_URL_PATTERN);
    if (match?.[1]) {
      const website = normalizeLeadWebsite(match[1]);
      if (website) {
        return website;
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

export function buildLeadWebsiteHref(value: string) {
  const website = normalizeLeadWebsite(value);
  if (!website) {
    return "";
  }

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
