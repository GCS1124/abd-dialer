import assert from "node:assert/strict";
import test from "node:test";

import type { Lead, User } from "../types";
import { buildEmployeeActivityCalendar } from "./employeeActivityCalendar.ts";

test("builds a full monthly employee activity calendar with daily summaries", () => {
  const users: User[] = [
    {
      id: "agent-1",
      name: "Asha Rao",
      email: "asha@example.com",
      role: "agent",
      team: "Sales",
      timezone: "Asia/Kolkata",
      avatar: "AR",
      title: "Sales Agent",
      status: "online",
    },
    {
      id: "agent-2",
      name: "Ravi Singh",
      email: "ravi@example.com",
      role: "agent",
      team: "Sales",
      timezone: "Asia/Kolkata",
      avatar: "RS",
      title: "Sales Agent",
      status: "online",
    },
  ];

  const leads: Lead[] = [
    {
      id: "lead-1",
      fullName: "Rahul Sharma",
      phone: "9999999999",
      altPhone: "",
      phoneNumbers: ["9999999999"],
      email: "rahul@example.com",
      company: "Acme",
      jobTitle: "Manager",
      location: "Delhi",
      source: "Import",
      interest: "Sales",
      status: "new",
      notes: "",
      lastContacted: null,
      assignedAgentId: "agent-1",
      assignedAgentName: "Asha Rao",
      callbackTime: null,
      priority: "Medium",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      tags: [],
      callHistory: [
        {
          id: "call-1",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T04:30:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 57,
          disposition: "Interested",
          status: "connected",
          notes: "Customer asked for follow-up",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-2",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T05:15:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 23,
          disposition: "Not Interested",
          status: "connected",
          notes: "",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "negative",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-3",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-02T06:00:00.000Z",
          agentId: "agent-2",
          agentName: "Ravi Singh",
          callType: "outgoing",
          durationSeconds: 40,
          disposition: "Sale Closed",
          status: "connected",
          notes: "",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
        {
          id: "call-4",
          leadId: "lead-1",
          leadName: "Rahul Sharma",
          phone: "9999999999",
          createdAt: "2026-05-03T03:00:00.000Z",
          agentId: "agent-1",
          agentName: "Asha Rao",
          callType: "outgoing",
          durationSeconds: 89,
          disposition: "Appointment Booked",
          status: "connected",
          notes: "Booked for Friday",
          recordingEnabled: false,
          outcomeSummary: "",
          aiSummary: "",
          sentiment: "positive",
          suggestedNextAction: "",
          followUpAt: null,
        },
      ],
      notesHistory: [],
      activities: [],
      leadScore: 80,
      timezone: "Asia/Kolkata",
    },
  ];

  const timecards = [
    {
      workDate: "2026-05-02",
      timezone: "Asia/Kolkata",
      timeOnSystemSeconds: 3600,
      breakSeconds: 600,
      wrapSeconds: 300,
      loginHoursSeconds: 4500,
      capturedAt: "2026-05-02T18:00:00.000Z",
      hasCheckedIn: true,
    },
    {
      workDate: "2026-05-03",
      timezone: "Asia/Kolkata",
      timeOnSystemSeconds: 7200,
      breakSeconds: 1200,
      wrapSeconds: 600,
      loginHoursSeconds: 9000,
      capturedAt: "2026-05-03T18:00:00.000Z",
      hasCheckedIn: true,
    },
  ];

  const result = buildEmployeeActivityCalendar({
    users,
    leads,
    timecards,
    employeeId: "agent-1",
    month: "2026-05",
  });

  assert.equal(result.employeeId, "agent-1");
  assert.equal(result.employeeName, "Asha Rao");
  assert.equal(result.month, "2026-05");
  assert.equal(result.days.length, 31);
  assert.equal(result.monthTimecardSummary.trackedDays, 2);
  assert.equal(result.monthTimecardSummary.averageTimeOnSystemSeconds, 5400);
  assert.equal(result.monthTimecardSummary.averageBreakSeconds, 900);
  assert.equal(result.monthTimecardSummary.averageWrapSeconds, 450);
  assert.equal(result.monthTimecardSummary.averageLoginHoursSeconds, 6750);

  const may2 = result.days.find((day) => day.date === "2026-05-02");
  assert.ok(may2);
  assert.equal(may2?.totalCalls, 2);
  assert.equal(may2?.connectedCalls, 2);
  assert.equal(may2?.interested, 1);
  assert.equal(may2?.notInterested, 1);
  assert.equal(may2?.disposedCompleted, 0);
  assert.equal(may2?.failed, 0);
  assert.equal(may2?.records.length, 2);
  assert.equal(may2?.timecardSummary.trackedDays, 1);
  assert.equal(may2?.timecardSummary.totalTimeOnSystemSeconds, 3600);
  assert.equal(may2?.timecardSummary.totalBreakSeconds, 600);
  assert.equal(may2?.timecardSummary.totalWrapSeconds, 300);
  assert.equal(may2?.timecardSummary.totalLoginHoursSeconds, 4500);

  const may3 = result.days.find((day) => day.date === "2026-05-03");
  assert.ok(may3);
  assert.equal(may3?.disposedCompleted, 1);
  assert.equal(may3?.records.length, 1);
  assert.equal(may3?.timecardSummary.trackedDays, 1);
  assert.equal(may3?.timecardSummary.totalTimeOnSystemSeconds, 7200);
  assert.equal(may3?.timecardSummary.totalBreakSeconds, 1200);
  assert.equal(may3?.timecardSummary.totalWrapSeconds, 600);
  assert.equal(may3?.timecardSummary.totalLoginHoursSeconds, 9000);

  const may4 = result.days.find((day) => day.date === "2026-05-04");
  assert.ok(may4);
  assert.equal(may4?.totalCalls, 0);
  assert.equal(may4?.records.length, 0);
  assert.equal(may4?.timecardSummary.trackedDays, 0);
});
