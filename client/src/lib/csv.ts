import { read, utils } from "xlsx";

import type { LeadImportRecord, LeadPriority, LeadStatus } from "../types";
import { getLeadCompanyName } from "./leadIdentity";

const defaultStatus: LeadStatus = "new";
const defaultPriority: LeadPriority = "Medium";

type ParsedField =
  | keyof LeadImportRecord
  | "firstName"
  | "lastName"
  | "address"
  | "city"
  | "state"
  | "country"
  | "timeZone"
  | "linkedin"
  | "industry"
  | "zipCode"
  | "age"
  | "importDate"
  | "website";

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeStatusValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

const fieldAliases: Array<[string, ParsedField]> = [
  ["full name", "fullName"],
  ["full_name", "fullName"],
  ["fullname", "fullName"],
  ["name", "fullName"],
  ["contact", "fullName"],
  ["contact name", "fullName"],
  ["contact_name", "fullName"],
  ["contact person", "fullName"],
  ["contact person name", "fullName"],
  ["lead name", "fullName"],
  ["lead_name", "fullName"],
  ["customer name", "fullName"],
  ["customer_name", "fullName"],
  ["client name", "fullName"],
  ["client_name", "fullName"],
  ["decision maker", "fullName"],
  ["decision_maker", "fullName"],
  ["decision-maker", "fullName"],
  ["decision maker name", "fullName"],
  ["decision_maker_name", "fullName"],
  ["primary contact", "fullName"],
  ["primary_contact", "fullName"],
  ["main contact", "fullName"],
  ["main_contact", "fullName"],
  ["first name", "firstName"],
  ["first_name", "firstName"],
  ["firstname", "firstName"],
  ["last name", "lastName"],
  ["last_name", "lastName"],
  ["lastname", "lastName"],
  ["phone", "phone"],
  ["phone number", "phone"],
  ["phone_number", "phone"],
  ["phone no", "phone"],
  ["phone1", "phone"],
  ["mobile", "phone"],
  ["mobile number", "phone"],
  ["mobile_number", "phone"],
  ["mobile phone", "phone"],
  ["mobile_phone", "phone"],
  ["cell", "phone"],
  ["cell phone", "phone"],
  ["cell_phone", "phone"],
  ["cell number", "phone"],
  ["cell_number", "phone"],
  ["primary phone", "phone"],
  ["primary_phone", "phone"],
  ["main phone", "phone"],
  ["main_phone", "phone"],
  ["direct phone", "phone"],
  ["direct_phone", "phone"],
  ["telephone", "phone"],
  ["telephone number", "phone"],
  ["telephone_number", "phone"],
  ["work phone", "phone"],
  ["work_phone", "phone"],
  ["home phone", "phone"],
  ["home_phone", "phone"],
  ["alt phone", "altPhone"],
  ["alt_phone", "altPhone"],
  ["alt phone number", "altPhone"],
  ["alt_phone_number", "altPhone"],
  ["alternate phone", "altPhone"],
  ["alternate_phone", "altPhone"],
  ["alternate number", "altPhone"],
  ["alternate_number", "altPhone"],
  ["secondary phone", "altPhone"],
  ["secondary_phone", "altPhone"],
  ["other phone", "altPhone"],
  ["other_phone", "altPhone"],
  ["phone2", "altPhone"],
  ["email", "email"],
  ["email address", "email"],
  ["email_address", "email"],
  ["company", "company"],
  ["company name", "company"],
  ["company_name", "company"],
  ["account name", "company"],
  ["account_name", "company"],
  ["business", "company"],
  ["business name", "company"],
  ["business_name", "company"],
  ["organization", "company"],
  ["organisation", "company"],
  ["firm", "company"],
  ["job title", "jobTitle"],
  ["job_title", "jobTitle"],
  ["title", "jobTitle"],
  ["address", "address"],
  ["city", "city"],
  ["state", "state"],
  ["province", "state"],
  ["country", "country"],
  ["country name", "country"],
  ["country_name", "country"],
  ["zip", "zipCode"],
  ["zip code", "zipCode"],
  ["zip_code", "zipCode"],
  ["zipcode", "zipCode"],
  ["postal code", "zipCode"],
  ["postal_code", "zipCode"],
  ["postcode", "zipCode"],
  ["location", "location"],
  ["website", "website"],
  ["website url", "website"],
  ["website_url", "website"],
  ["web site", "website"],
  ["url", "website"],
  ["date", "importDate"],
  ["date added", "importDate"],
  ["added date", "importDate"],
  ["source", "source"],
  ["lead source", "source"],
  ["lead_source", "source"],
  ["campaign source", "source"],
  ["source campaign", "source"],
  ["interest", "interest"],
  ["product", "interest"],
  ["service", "interest"],
  ["status", "status"],
  ["note", "notes"],
  ["notes", "notes"],
  ["remark", "notes"],
  ["remarks", "notes"],
  ["comment", "notes"],
  ["comments", "notes"],
  ["description", "notes"],
  ["details", "notes"],
  ["age", "age"],
  ["import date", "importDate"],
  ["import_date", "importDate"],
  ["created at", "importDate"],
  ["created_at", "importDate"],
  ["last contacted", "lastContacted"],
  ["last_contacted", "lastContacted"],
  ["assigned agent", "assignedAgentName"],
  ["assigned_agent", "assignedAgentName"],
  ["assigned agent name", "assignedAgentName"],
  ["assigned_agent_name", "assignedAgentName"],
  ["callback time", "callbackTime"],
  ["callback_time", "callbackTime"],
  ["priority", "priority"],
  ["linkedin", "linkedin"],
  ["linked in", "linkedin"],
  ["linkedin profile", "linkedin"],
  ["linkedin profile url", "linkedin"],
  ["linkedin url", "linkedin"],
  ["industry", "industry"],
  ["time zone", "timeZone"],
  ["timezone", "timeZone"],
  ["__empty", "source"],
  ["__empty_1", "importDate"],
];

const fieldMap: Record<string, ParsedField> = Object.fromEntries(
  fieldAliases.map(([alias, field]) => [normalizeHeader(alias), field]),
);

function splitCsvLine(line: string) {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      columns.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  columns.push(current.trim());
  return columns.map((column) => column.replace(/^"|"$/g, ""));
}

function includesAny(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function getMappedField(header: string) {
  const normalized = normalizeHeader(header);
  const exactMatch = fieldMap[normalized];
  if (exactMatch) {
    return exactMatch;
  }

  if (/^phone\d+$/.test(normalized)) {
    return normalized === "phone1" ? "phone" : "altPhone";
  }

  if (/^email\d+$/.test(normalized)) {
    return "email";
  }

  if (includesAny(normalized, ["first", "given", "forename"])) {
    return "firstName";
  }

  if (includesAny(normalized, ["last", "surname", "family"])) {
    return "lastName";
  }

  if (includesAny(normalized, ["phone", "mobile", "cell", "telephone", "tel", "phoneno"])) {
    if (includesAny(normalized, ["alt", "alternate", "secondary", "other", "backup"])) {
      return "altPhone";
    }
    return "phone";
  }

  if (includesAny(normalized, ["email", "mail"])) {
    return "email";
  }

  if (
    includesAny(normalized, ["company", "business", "organization", "organisation", "firm", "accountname"])
  ) {
    return "company";
  }

  if (includesAny(normalized, ["jobtitle", "title", "position", "role", "occupation"])) {
    return "jobTitle";
  }

  if (includesAny(normalized, ["address", "street", "addr"])) {
    return "address";
  }

  if (includesAny(normalized, ["city", "town"])) {
    return "city";
  }

  if (includesAny(normalized, ["state", "province", "region", "county"])) {
    return "state";
  }

  if (includesAny(normalized, ["country", "nation", "territory"])) {
    return "country";
  }

  if (includesAny(normalized, ["zip", "postal", "postcode"])) {
    return "zipCode";
  }

  if (includesAny(normalized, ["website", "web", "url", "domain"])) {
    return "website";
  }

  if (includesAny(normalized, ["leadsource", "source", "referral", "origin", "campaign"])) {
    return "source";
  }

  if (includesAny(normalized, ["interest", "product", "service"])) {
    return "interest";
  }

  if (includesAny(normalized, ["status"])) {
    return "status";
  }

  if (includesAny(normalized, ["note", "remark", "comment", "description", "detail", "memo"])) {
    return "notes";
  }

  if (includesAny(normalized, ["import", "created", "added"])) {
    return "importDate";
  }

  if (includesAny(normalized, ["lastcontact", "lasttouch", "lastinteraction"])) {
    return "lastContacted";
  }

  if (includesAny(normalized, ["linkedin"])) {
    return "linkedin";
  }

  if (includesAny(normalized, ["industry", "sector"])) {
    return "industry";
  }

  if (includesAny(normalized, ["timezone", "timezon", "tz"])) {
    return "timeZone";
  }

  if (
    includesAny(normalized, ["assignedagent", "assignedto", "assignedowner", "assignedrep"]) ||
    (normalized.includes("assigned") && includesAny(normalized, ["agent", "owner", "rep", "name"])) ||
    includesAny(normalized, ["owner", "agent", "rep"])
  ) {
    return "assignedAgentName";
  }

  if (includesAny(normalized, ["callback", "followup", "nextcall"])) {
    return "callbackTime";
  }

  if (includesAny(normalized, ["priority", "urgency"])) {
    return "priority";
  }

  return null;
}

function parseStatus(value: string): LeadStatus {
  const normalized = normalizeStatusValue(value);
  const allowed: LeadStatus[] = [
    "new",
    "contacted",
    "callback_due",
    "follow_up",
    "qualified",
    "appointment_booked",
    "closed_won",
    "closed_lost",
    "invalid",
  ];

  if (allowed.includes(normalized as LeadStatus)) {
    return normalized as LeadStatus;
  }

  return defaultStatus;
}

function parsePriority(value: string): LeadPriority {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low") {
    return "Low";
  }
  if (normalized === "high") {
    return "High";
  }
  if (normalized === "urgent") {
    return "Urgent";
  }
  return defaultPriority;
}

function createEmptyRow(): LeadImportRecord {
  return {
    fullName: "",
    phone: "",
    altPhone: "",
    email: "",
    company: "",
    jobTitle: "",
    location: "",
    source: "",
    interest: "",
    status: defaultStatus,
    notes: "",
    lastContacted: null,
    assignedAgentName: "",
    callbackTime: null,
    priority: defaultPriority,
  };
}

function normalizeCellValue(rawValue: unknown) {
  if (rawValue == null) {
    return "";
  }

  if (typeof rawValue === "number") {
    return Number.isInteger(rawValue) ? String(rawValue) : String(rawValue).trim();
  }

  return String(rawValue).trim();
}

function excelSerialToIsoString(serial: number) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 24 * 60 * 60 * 1000).toISOString();
}

function parseIsoDate(rawValue: unknown) {
  if (rawValue == null || rawValue === "") {
    return null;
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 20000) {
    return excelSerialToIsoString(rawValue);
  }

  const value = normalizeCellValue(rawValue);
  if (/^\d{5,}$/.test(value)) {
    const serial = Number(value);
    if (Number.isFinite(serial) && serial > 20000) {
      return excelSerialToIsoString(serial);
    }
  }

  const delimited = value.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (delimited) {
    const first = Number(delimited[1]);
    const second = Number(delimited[2]);
    const third = Number(delimited[3]);

    if (Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(third)) {
      let year: number;
      let month: number;
      let day: number;

      if (delimited[1].length === 4) {
        year = first;
        month = second;
        day = third;
      } else if (delimited[3].length === 4) {
        year = third;
        if (first > 12 && second <= 12) {
          day = first;
          month = second;
        } else if (second > 12 && first <= 12) {
          month = first;
          day = second;
        } else {
          // Lead exports often use day-month-year in the wild. Prefer that for ambiguous dates.
          day = first;
          month = second;
        }
      } else {
        return null;
      }

      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      if (
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day
      ) {
        return parsedDate.toISOString();
      }
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function compactJoin(parts: Array<string | null | undefined>, separator: string) {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(separator);
}

function buildNotes(baseNotes: string, extras: string[]) {
  return [baseNotes.trim(), ...extras.filter(Boolean)]
    .filter(Boolean)
    .join(baseNotes.trim() ? "\n" : "\n")
    .trim();
}

function rowsFromHeaders(headers: string[], bodyRows: unknown[][]) {
  return bodyRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, String(row[index] ?? "").trim()]),
      ),
    );
}

const EXCEL_FILE_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "xltx", "xltm"]);
const EXCEL_HEADER_SCAN_LIMIT = 40;

function scoreExcelHeaderRow(headers: string[]) {
  const mappedFields = new Set<ParsedField>();

  headers.forEach((header) => {
    const mappedField = getMappedField(header);
    if (mappedField) {
      mappedFields.add(mappedField);
    }
  });

  const hasNameLike =
    mappedFields.has("fullName") ||
    mappedFields.has("firstName") ||
    mappedFields.has("lastName") ||
    mappedFields.has("company");
  const hasPhoneLike = mappedFields.has("phone") || mappedFields.has("altPhone");

  if (!hasNameLike || !hasPhoneLike) {
    return 0;
  }

  let score = mappedFields.size * 10;
  if (mappedFields.has("fullName")) score += 20;
  if (mappedFields.has("firstName")) score += 12;
  if (mappedFields.has("lastName")) score += 12;
  if (mappedFields.has("company")) score += 10;
  if (mappedFields.has("phone")) score += 25;
  if (mappedFields.has("altPhone")) score += 18;
  if (mappedFields.has("email")) score += 5;
  if (mappedFields.has("notes")) score += 2;
  if (mappedFields.has("source")) score += 2;

  return score;
}

function parseExcelSheetRows(matrix: unknown[][]) {
  let bestCandidate: { score: number; headers: string[]; parsed: ReturnType<typeof parseMappedRows> } | null =
    null;
  const scanLimit = Math.min(matrix.length, EXCEL_HEADER_SCAN_LIMIT);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const headerRow = matrix[rowIndex] ?? [];
    const headers = headerRow.map((cell, index) => {
      const label = normalizeCellValue(cell);
      return label || `Column ${index + 1}`;
    });
    const headerScore = scoreExcelHeaderRow(headers);

    if (!headerScore) {
      continue;
    }

    const rawRows = rowsFromHeaders(headers, matrix.slice(rowIndex + 1) as unknown[][]);
    const parsed = parseMappedRows(rawRows);
    const candidateScore = headerScore * 1000 + parsed.rows.length * 10 - parsed.invalidRows;

    if (!bestCandidate || candidateScore > bestCandidate.score) {
      bestCandidate = {
        score: candidateScore,
        headers,
        parsed,
      };
    }
  }

  return bestCandidate;
}

function isTemplateInstructionRow(rawRow: Record<string, unknown>) {
  return Object.values(rawRow).some((rawValue) => /^notes?:/i.test(normalizeCellValue(rawValue)));
}

function parseMappedRows(rawRows: Array<Record<string, unknown>>) {
  let invalidRows = 0;
  const rows: LeadImportRecord[] = [];

  rawRows.forEach((rawRow) => {
    if (isTemplateInstructionRow(rawRow)) {
      return;
    }

    const row = createEmptyRow();
    const scratch = {
      fullName: "",
      firstName: "",
      lastName: "",
      address: "",
      city: "",
      state: "",
      country: "",
      timeZone: "",
      linkedin: "",
      industry: "",
      zipCode: "",
      age: "",
      importDate: "",
      website: "",
      secondaryEmail: "",
      secondaryPhone: "",
    };

    Object.entries(rawRow).forEach(([header, rawValue]) => {
      const mappedField = getMappedField(header);
      if (!mappedField) {
        return;
      }

      const value = normalizeCellValue(rawValue);

      if (mappedField === "status") {
        row.status = parseStatus(value);
        return;
      }

      if (mappedField === "priority") {
        row.priority = parsePriority(value);
        return;
      }

      if (mappedField === "email") {
        if (!row.email) {
          row.email = value;
        } else if (value && value !== row.email && !scratch.secondaryEmail) {
          scratch.secondaryEmail = value;
        }
        return;
      }

      if (mappedField === "phone") {
        if (!row.phone) {
          row.phone = value;
        } else if (!row.altPhone) {
          row.altPhone = value;
        } else if (value && value !== row.phone && value !== row.altPhone && !scratch.secondaryPhone) {
          scratch.secondaryPhone = value;
        }
        return;
      }

      if (mappedField === "altPhone") {
        if (!row.phone && value) {
          row.phone = value;
          return;
        }

        if (!row.altPhone) {
          row.altPhone = value;
        } else if (value && value !== row.phone && value !== row.altPhone && !scratch.secondaryPhone) {
          scratch.secondaryPhone = value;
        }
        return;
      }

      if (mappedField === "lastContacted") {
        row.lastContacted = parseIsoDate(rawValue);
        return;
      }

      if (mappedField === "callbackTime") {
        row.callbackTime = parseIsoDate(rawValue);
        return;
      }

      if (mappedField === "fullName") {
        scratch.fullName = value;
        return;
      }

      if (mappedField in scratch) {
        scratch[mappedField as keyof typeof scratch] = value;
        return;
      }

      row[mappedField as keyof LeadImportRecord] = value as never;
    });

    if (!row.fullName) {
      row.fullName = scratch.fullName || compactJoin([scratch.firstName, scratch.lastName], " ") || row.company;
    }

    if (!row.phone && row.altPhone) {
      row.phone = row.altPhone;
      row.altPhone = "";
    }

    if (!row.company) {
      row.company = getLeadCompanyName({
        fullName: row.fullName,
        company: row.company,
      });
    }

    if (!row.location) {
      row.location = compactJoin(
        [
          scratch.address,
          compactJoin(
            [
              scratch.city,
              compactJoin([scratch.state, scratch.zipCode], " "),
            ],
            ", ",
          ),
          scratch.country,
        ],
        ", ",
      );
    }

    row.notes = buildNotes(row.notes, [
      scratch.country ? `Country: ${scratch.country}` : "",
      scratch.timeZone ? `Time Zone: ${scratch.timeZone}` : "",
      scratch.linkedin ? `LinkedIn: ${scratch.linkedin}` : "",
      scratch.industry ? `Industry: ${scratch.industry}` : "",
      scratch.age ? `Age: ${scratch.age}` : "",
      scratch.website ? `Website: ${scratch.website}` : "",
      scratch.secondaryEmail ? `Secondary Email: ${scratch.secondaryEmail}` : "",
      scratch.secondaryPhone ? `Secondary Phone: ${scratch.secondaryPhone}` : "",
      parseIsoDate(scratch.importDate)?.slice(0, 10)
        ? `Import Date: ${parseIsoDate(scratch.importDate)?.slice(0, 10)}`
        : "",
    ]);

    if (!row.fullName || !row.phone) {
      invalidRows += 1;
      return;
    }

    rows.push(row);
  });

  return { rows, invalidRows };
}

export function parseLeadCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [] as LeadImportRecord[],
      invalidRows: 0,
    };
  }

  const headers = splitCsvLine(lines[0]).map((cell, index) => {
    const label = String(cell ?? "").trim();
    return label || `Column ${index + 1}`;
  });
  const rawRows = rowsFromHeaders(
    headers,
    lines.slice(1).map((line) => splitCsvLine(line)) as unknown[][],
  );

  return parseMappedRows(rawRows);
}

export async function parseLeadFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && EXCEL_FILE_EXTENSIONS.has(extension)) {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    let bestSheet = null as ReturnType<typeof parseExcelSheetRows> | null;

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return;
      }

      const matrix = utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: "",
      });
      const candidate = parseExcelSheetRows(matrix as unknown[][]);

      if (!candidate) {
        return;
      }

      if (!bestSheet || candidate.score > bestSheet.score) {
        bestSheet = candidate;
      }
    });

    if (!bestSheet) {
      throw new Error("Could not find a usable lead table in the workbook.");
    }

    return {
      rows: bestSheet.parsed.rows,
      invalidRows: bestSheet.parsed.invalidRows,
    };
  }

  return parseLeadCsv(await file.text());
}
