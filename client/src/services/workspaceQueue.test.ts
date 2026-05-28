import assert from "node:assert/strict";
import test from "node:test";

import { computeNextQueueCursor } from "./workspace.ts";
import type { Campaign, Lead, QueueCursor, User } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function isoOffset(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function buildLead(
  overrides: Partial<Lead> &
    Pick<Lead, "id" | "fullName" | "phone" | "status" | "priority" | "createdAt">,
): Lead {
  const lead: Lead = {
    altPhone: "",
    assignedAgentId: "",
    assignedAgentName: "",
    activities: [],
    callHistory: [],
    callbackPriority: "Medium",
    callbackTime: null,
    company: "",
    contactAttemptCount: 0,
    connectedAttemptCount: 0,
    createdAt: overrides.createdAt,
    email: "",
    externalId: null,
    fullName: overrides.fullName,
    id: overrides.id,
    interest: "",
    isDnc: false,
    isInvalidNumber: false,
    jobTitle: "",
    lastAttemptedAt: null,
    lastContacted: null,
    lastContactedAt: null,
    lastDisposition: null,
    leadScore: 0,
    location: "",
    nextCallbackAt: null,
    nextEligibleAt: null,
    nextFollowUpAt: null,
    notes: "",
    notesHistory: [],
    notInterestedReason: null,
    phone: overrides.phone,
    phoneNumbers: [overrides.phone],
    priority: overrides.priority,
    source: "",
    status: overrides.status,
    tags: [],
    timezone: "",
    updatedAt: overrides.createdAt,
  } as Lead;

  return Object.assign(lead, overrides);
}

const user = {
  id: "user-1",
  name: "Agent",
  email: "agent@example.com",
  role: "admin",
  team: "Team",
  timezone: "America/New_York",
  avatar: "A",
  title: "Agent",
  status: "online",
  mustResetPassword: false,
} as User;

test("fresh leads are selected before callback and retry leads", () => {
  const campaigns: Campaign[] = [];
  const leads = [
    buildLead({
      id: "lead-dnc",
      fullName: "DNC Lead",
      phone: "+1 555 010 0004",
      status: "new",
      priority: "Low",
      createdAt: isoOffset(-5 * DAY_MS),
      isDnc: true,
      lastDisposition: "DNC",
      lastAttemptedAt: isoOffset(-DAY_MS),
      nextEligibleAt: null,
    }),
    buildLead({
      id: "lead-retry",
      fullName: "Retry Lead",
      phone: "+1 555 010 0003",
      status: "contacted",
      priority: "Medium",
      createdAt: isoOffset(-4 * DAY_MS),
      contactAttemptCount: 2,
      connectedAttemptCount: 0,
      lastDispositionMain: "NOT_CONNECTED",
      lastDispositionSub: "NO_ANSWER",
      lastDisposition: "No Answer",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: isoOffset(-DAY_MS),
      nextEligibleAt: isoOffset(-HOUR_MS),
    }),
    buildLead({
      id: "lead-callback",
      fullName: "Callback Lead",
      phone: "+1 555 010 0002",
      status: "contacted",
      priority: "High",
      createdAt: isoOffset(-3 * DAY_MS),
      contactAttemptCount: 1,
      connectedAttemptCount: 1,
      lastDispositionMain: "CALLBACK",
      lastDispositionSub: "CALL_BACK_LATER",
      lastDisposition: "Call Back Later",
      lastAttemptedAt: isoOffset(-2 * DAY_MS),
      lastContactedAt: isoOffset(-2 * DAY_MS),
      nextEligibleAt: isoOffset(-30 * 60 * 1000),
      nextCallbackAt: isoOffset(-30 * 60 * 1000),
      callbackPriority: "High",
    }),
    buildLead({
      id: "lead-fresh",
      fullName: "Fresh Lead",
      phone: "+1 555 010 0001",
      status: "new",
      priority: "Urgent",
      createdAt: isoOffset(-6 * DAY_MS),
      contactAttemptCount: 0,
      connectedAttemptCount: 0,
      lastDisposition: null,
      lastAttemptedAt: null,
      lastContactedAt: null,
      nextEligibleAt: null,
    }),
  ];

  const firstCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    null,
    "restart",
  );
  assert.deepEqual(firstCursor, {
    currentLeadId: "lead-fresh",
    currentPhoneIndex: 0,
  } satisfies QueueCursor);

  const secondCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    firstCursor,
    "completed",
  );
  assert.deepEqual(secondCursor, {
    currentLeadId: null,
    currentPhoneIndex: -1,
  } satisfies QueueCursor);
});

test("callback leads become the queue when no fresh leads remain", () => {
  const campaigns: Campaign[] = [];
  const leads = [
    buildLead({
      id: "lead-callback",
      fullName: "Callback Lead",
      phone: "+1 555 010 0002",
      status: "contacted",
      priority: "High",
      createdAt: isoOffset(-3 * DAY_MS),
      contactAttemptCount: 1,
      connectedAttemptCount: 1,
      lastDisposition: "Call Back Later",
      lastAttemptedAt: isoOffset(-2 * DAY_MS),
      lastContactedAt: isoOffset(-2 * DAY_MS),
      nextEligibleAt: isoOffset(-30 * 60 * 1000),
      nextCallbackAt: isoOffset(-30 * 60 * 1000),
      callbackPriority: "High",
    }),
    buildLead({
      id: "lead-retry",
      fullName: "Retry Lead",
      phone: "+1 555 010 0003",
      status: "contacted",
      priority: "Medium",
      createdAt: isoOffset(-4 * DAY_MS),
      contactAttemptCount: 2,
      connectedAttemptCount: 0,
      lastDispositionMain: "NOT_CONNECTED",
      lastDispositionSub: "NO_ANSWER",
      lastDisposition: "No Answer",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: isoOffset(-DAY_MS),
      nextEligibleAt: isoOffset(-HOUR_MS),
    }),
  ];

  const firstCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    null,
    "restart",
  );
  assert.deepEqual(firstCursor, {
    currentLeadId: "lead-callback",
    currentPhoneIndex: 0,
  } satisfies QueueCursor);

  const secondCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    firstCursor,
    "completed",
  );
  assert.deepEqual(secondCursor, {
    currentLeadId: null,
    currentPhoneIndex: -1,
  } satisfies QueueCursor);
});

test("repeat-eligible leads surface when no fresher bucket exists", () => {
  const campaigns: Campaign[] = [];
  const leads = [
    buildLead({
      id: "lead-retry",
      fullName: "Retry Lead",
      phone: "+1 555 010 0003",
      status: "contacted",
      priority: "Medium",
      createdAt: isoOffset(-4 * DAY_MS),
      contactAttemptCount: 2,
      connectedAttemptCount: 0,
      lastDispositionMain: "NOT_CONNECTED",
      lastDispositionSub: "NO_ANSWER",
      lastDisposition: "No Answer",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: isoOffset(-DAY_MS),
      nextEligibleAt: isoOffset(-HOUR_MS),
    }),
  ];

  const firstCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    null,
    "restart",
  );
  assert.deepEqual(firstCursor, {
    currentLeadId: "lead-retry",
    currentPhoneIndex: 0,
  } satisfies QueueCursor);
});

test("not interested leads stay out of the queue during cooldown", () => {
  const campaigns: Campaign[] = [];
  const leads = [
    buildLead({
      id: "lead-cooling",
      fullName: "Cooling Lead",
      phone: "+1 555 010 0100",
      status: "closed_lost",
      priority: "Medium",
      createdAt: isoOffset(-2 * DAY_MS),
      contactAttemptCount: 1,
      connectedAttemptCount: 1,
      lastDispositionMain: "NOT_INTERESTED",
      lastDispositionSub: "PRICE_ISSUE",
      lastDisposition: "Not Interested",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: isoOffset(-DAY_MS),
      nextEligibleAt: isoOffset(3 * DAY_MS),
      notInterestedReason: "Price Issue",
    }),
    buildLead({
      id: "lead-fresh-2",
      fullName: "Fresh Lead Two",
      phone: "+1 555 010 0101",
      status: "new",
      priority: "High",
      createdAt: isoOffset(-DAY_MS),
      contactAttemptCount: 0,
      connectedAttemptCount: 0,
      lastDisposition: null,
      lastAttemptedAt: null,
      lastContactedAt: null,
      nextEligibleAt: null,
    }),
  ];

  const firstCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    null,
    "restart",
  );
  assert.deepEqual(firstCursor, {
    currentLeadId: "lead-fresh-2",
    currentPhoneIndex: 0,
  } satisfies QueueCursor);

  const secondCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    firstCursor,
    "completed",
  );
  assert.deepEqual(secondCursor, {
    currentLeadId: null,
    currentPhoneIndex: -1,
  } satisfies QueueCursor);
});

test("suppressed leads are excluded from the dialer queue", () => {
  const campaigns: Campaign[] = [];
  const leads = [
    buildLead({
      id: "lead-existing",
      fullName: "Existing Customer",
      phone: "+1 555 010 0200",
      status: "closed_won",
      priority: "Medium",
      createdAt: isoOffset(-DAY_MS),
      contactAttemptCount: 2,
      connectedAttemptCount: 1,
      lastDispositionMain: "EXISTING_CUSTOMER",
      lastDispositionSub: "EXISTING_CUSTOMER",
      lastDisposition: "Existing Customer",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: isoOffset(-DAY_MS),
      nextEligibleAt: null,
    }),
    buildLead({
      id: "lead-invalid",
      fullName: "Wrong Number",
      phone: "+1 555 010 0201",
      status: "invalid",
      priority: "Low",
      createdAt: isoOffset(-DAY_MS),
      contactAttemptCount: 1,
      connectedAttemptCount: 0,
      lastDispositionMain: "INVALID_LEAD",
      lastDispositionSub: "WRONG_NUMBER",
      lastDisposition: "Wrong Number",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: null,
      nextEligibleAt: null,
      isInvalidNumber: true,
    }),
    buildLead({
      id: "lead-dnc-2",
      fullName: "DNC Lead Two",
      phone: "+1 555 010 0202",
      status: "new",
      priority: "Urgent",
      createdAt: isoOffset(-DAY_MS),
      contactAttemptCount: 1,
      connectedAttemptCount: 0,
      lastDispositionMain: "DO_NOT_CALL",
      lastDispositionSub: "DO_NOT_CALL",
      lastDisposition: "DNC",
      lastAttemptedAt: isoOffset(-DAY_MS),
      lastContactedAt: null,
      nextEligibleAt: null,
      isDnc: true,
    }),
  ];

  const nextCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    null,
    "completed",
  );

  assert.deepEqual(nextCursor, {
    currentLeadId: null,
    currentPhoneIndex: 0,
  } satisfies QueueCursor);
});
