import assert from "node:assert/strict";
import test from "node:test";

import { computeNextQueueCursor } from "./workspace.ts";
import type { Campaign, Lead, QueueCursor, User } from "../types";

function buildLead(overrides: Partial<Lead> & Pick<Lead, "id" | "fullName" | "phone" | "status" | "priority" | "createdAt">): Lead {
  return {
    ...overrides,
    altPhone: "",
    assignedAgentId: null,
    assignedAgentName: null,
    callbackTime: null,
    callHistory: [],
    company: "",
    email: "",
    externalId: null,
    interest: "",
    jobTitle: "",
    leadScore: 0,
    location: "",
    notes: "",
    source: null,
    activities: [],
    tags: [],
    createdAt: overrides.createdAt,
    fullName: overrides.fullName,
    id: overrides.id,
    phone: overrides.phone,
    phoneNumbers: [overrides.phone],
    priority: overrides.priority,
    status: overrides.status,
    updatedAt: overrides.createdAt,
  } as Lead;
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

test("advancing the final queue item marks the cursor exhausted instead of pinning the last lead", () => {
  const leads = [
    buildLead({
      id: "lead-1",
      fullName: "Lead One",
      phone: "+1 555 010 0001",
      status: "new",
      priority: "High",
      createdAt: "2026-05-27T00:00:00.000Z",
    }),
  ];
  const campaigns: Campaign[] = [];

  const nextCursor = computeNextQueueCursor(
    leads,
    campaigns,
    user,
    "priority",
    "all",
    "default",
    { currentLeadId: "lead-1", currentPhoneIndex: 0 },
    "completed",
  );

  assert.deepEqual(nextCursor, {
    currentLeadId: null,
    currentPhoneIndex: -1,
  } satisfies QueueCursor);
});
