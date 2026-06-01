import assert from "node:assert/strict";
import test from "node:test";

import {
  filterLeadsForDialerCampaign,
  getActiveDialerCampaigns,
  resolveDialerCampaignKey,
  shouldAutoDialCampaign,
} from "./dialerCampaigns.ts";
import type { Campaign, Lead } from "../types";

function createLead(id: string, source: string): Lead {
  return {
    id,
    fullName: id,
    phone: "5551234567",
    altPhone: "",
    email: "",
    company: "",
    jobTitle: "",
    location: "",
    source,
    interest: "",
    status: "new",
    notes: "",
    lastContacted: null,
    assignedAgentId: "",
    assignedAgentName: "",
    callbackTime: null,
    priority: "Medium",
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    tags: [],
    callHistory: [],
    notesHistory: [],
    activities: [],
    leadScore: 0,
    timezone: "UTC",
  };
}

function createCampaign(
  name: string,
  sourceKey: string,
  isActive: boolean,
  allowAutoDial = true,
): Campaign {
  return {
    id: `campaign:${sourceKey}`,
    name,
    sourceKey,
    assignedUserId: null,
    assignedUserName: "Unassigned",
    isActive,
    allowAutoDial,
    leadCount: 0,
    activeLeadCount: 0,
    callbackCount: 0,
    untouchedCount: 0,
    staleCount: 0,
    recentLeadAt: null,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
  };
}

test("resolves the only active campaign automatically", () => {
  const campaigns = [
    createCampaign("Paused", "paused-campaign", false),
    createCampaign("Active", "active-campaign", true),
  ];

  assert.deepEqual(getActiveDialerCampaigns(campaigns).map((campaign) => campaign.sourceKey), [
    "active-campaign",
  ]);
  assert.equal(resolveDialerCampaignKey(campaigns, null), "active-campaign");
});

test("keeps the selected campaign when it is active", () => {
  const campaigns = [
    createCampaign("Alpha", "alpha", true),
    createCampaign("Beta", "beta", true),
  ];

  assert.equal(resolveDialerCampaignKey(campaigns, "beta"), "beta");
});

test("requires a choice when multiple campaigns are active and no preference exists", () => {
  const campaigns = [
    createCampaign("Alpha", "alpha", true),
    createCampaign("Beta", "beta", true),
  ];

  assert.equal(resolveDialerCampaignKey(campaigns, null), null);
});

test("falls back to the only active campaign when the stored selection is paused", () => {
  const campaigns = [
    createCampaign("Alpha", "alpha", true),
    createCampaign("Beta", "beta", false),
  ];
  const leads = [createLead("1", "alpha"), createLead("2", "beta")];

  assert.equal(resolveDialerCampaignKey(campaigns, "beta"), "alpha");
  assert.deepEqual(filterLeadsForDialerCampaign(leads, campaigns, "alpha"), [leads[0]]);
});

test("prefers the selected campaign auto-dial setting", () => {
  const campaigns = [
    createCampaign("Alpha", "alpha", true, true),
    createCampaign("Beta", "beta", true, false),
  ];

  assert.equal(shouldAutoDialCampaign(campaigns, "alpha"), true);
  assert.equal(shouldAutoDialCampaign(campaigns, "beta"), false);
});

test("falls back to the global auto-dial flag when no campaign is selected", () => {
  const campaigns = [
    createCampaign("Alpha", "alpha", true, true),
    createCampaign("Beta", "beta", true, false),
  ];

  assert.equal(shouldAutoDialCampaign(campaigns, null, true), true);
  assert.equal(shouldAutoDialCampaign(campaigns, null, false), false);
});
