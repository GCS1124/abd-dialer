import type { CallDisposition, CallLogStatus, Lead, User } from "../types";
import { formatDuration } from "./utils.ts";

export interface EmployeeActivityCalendarRecord {
  time: string;
  customerName: string;
  phone: string;
  callStatus: CallLogStatus;
  status: CallDisposition;
  disposition: CallDisposition;
  durationSeconds: number;
  duration: string;
  notes: string;
}

export interface EmployeeActivityCalendarDay {
  date: string;
  totalCalls: number;
  connectedCalls: number;
  interested: number;
  notInterested: number;
  disposedCompleted: number;
  failed: number;
  totalTalkTimeSeconds: number;
  averageDurationSeconds: number;
  averageDuration: string;
  records: EmployeeActivityCalendarRecord[];
}

export interface EmployeeActivityCalendarResponse {
  employeeId: string;
  employeeName: string;
  month: string;
  timezone: string;
  days: EmployeeActivityCalendarDay[];
}

interface EmployeeActivityCalendarInput {
  users: User[];
  leads: Lead[];
  employeeId: string;
  month: string;
}

const completedDispositions = new Set(["Appointment Booked", "Sale Closed"]);
const failedDispositions = new Set([
  "No Answer",
  "Busy",
  "Voicemail",
  "Wrong Number",
  "Failed Attempt",
  "Not available",
  "Rpc hung",
]);

function parseMonthKey(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      monthIndex: today.getMonth(),
    };
  }

  return { year, monthIndex };
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function getMonthDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function getDatePartsInTimeZone(value: string, timeZone: string) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function formatTimeInTimeZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function createEmptyDay(date: string): EmployeeActivityCalendarDay {
  return {
    date,
    totalCalls: 0,
    connectedCalls: 0,
    interested: 0,
    notInterested: 0,
    disposedCompleted: 0,
    failed: 0,
    totalTalkTimeSeconds: 0,
    averageDurationSeconds: 0,
    averageDuration: "00:00",
    records: [],
  };
}

export function buildEmployeeActivityCalendar({
  users,
  leads,
  employeeId,
  month,
}: EmployeeActivityCalendarInput): EmployeeActivityCalendarResponse {
  const employee = users.find((user) => user.id === employeeId && user.role !== "admin") ?? null;
  const timezone = employee?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { year, monthIndex } = parseMonthKey(month);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const dayMap = new Map<string, EmployeeActivityCalendarDay>();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = getMonthDateKey(year, monthIndex, day);
    dayMap.set(date, createEmptyDay(date));
  }

  const calls = leads
    .flatMap((lead) =>
      lead.callHistory
        .filter((call) => call.agentId === employeeId)
        .map((call) => ({
          ...call,
          leadName: call.leadName || lead.fullName,
          phone: call.phone || lead.phone,
        })),
    )
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  calls.forEach((call) => {
    const dateKey = getDatePartsInTimeZone(call.createdAt, timezone);
    if (!dayMap.has(dateKey)) {
      return;
    }

    const day = dayMap.get(dateKey);
    if (!day) {
      return;
    }

    day.totalCalls += 1;
    day.totalTalkTimeSeconds += call.durationSeconds;
    day.connectedCalls += call.status === "connected" ? 1 : 0;
    day.interested += call.disposition === "Interested" ? 1 : 0;
    day.notInterested += call.disposition === "Not Interested" ? 1 : 0;
    day.disposedCompleted += completedDispositions.has(call.disposition) ? 1 : 0;
    day.failed += failedDispositions.has(call.disposition) || call.status === "failed" ? 1 : 0;
    day.records.push({
      time: formatTimeInTimeZone(call.createdAt, timezone),
      customerName: call.leadName,
      phone: call.phone,
      callStatus: call.status,
      status: call.disposition,
      disposition: call.disposition,
      durationSeconds: call.durationSeconds,
      duration: formatDuration(call.durationSeconds),
      notes: call.notes || "",
    });
  });

  const days = Array.from(dayMap.values()).map((day) => {
    const averageDurationSeconds =
      day.totalCalls > 0 ? Math.round(day.totalTalkTimeSeconds / day.totalCalls) : 0;

    return {
      ...day,
      averageDurationSeconds,
      averageDuration: formatDuration(averageDurationSeconds),
    };
  });

  return {
    employeeId,
    employeeName: employee?.name ?? "Unknown employee",
    month: `${year}-${pad(monthIndex + 1)}`,
    timezone,
    days,
  };
}
