import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralVideoBridgeRequest,
  extractRingCentralSessionId,
  isRingCentralOutboundDirection,
  normalizeRingCentralVideoBridge,
  normalizeRingCentralSessionId,
  selectRingCentralRecordingForSession,
  shouldSuppressRingCentralLiveAlert,
} from "./ringcentral.ts";

test("extracts a legacy RingCentral session id from auto-logged notes", () => {
  assert.equal(
    extractRingCentralSessionId("Auto-logged from RingCentral session s-abc123."),
    "s-abc123",
  );
  assert.equal(
    extractRingCentralSessionId("RingCentral outgoing call connected to +15555550123."),
    null,
  );
});

test("selects the longest recording for the matching telephony session", () => {
  const recording = selectRingCentralRecordingForSession(
    [
      {
        id: "call-1",
        telephonySessionId: "session-1",
        startTime: "2026-05-27T10:00:00.000Z",
        duration: 12,
        recording: {
          id: "rec-1",
          contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-1/content",
        },
      },
      {
        id: "call-2",
        telephonySessionId: "session-1",
        startTime: "2026-05-27T10:00:05.000Z",
        duration: 48,
        recording: {
          id: "rec-2",
          contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-2/content",
        },
      },
      {
        id: "call-3",
        telephonySessionId: "session-2",
        startTime: "2026-05-27T10:00:10.000Z",
        duration: 120,
        recording: {
          id: "rec-3",
          contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-3/content",
        },
      },
      {
        id: "call-4",
        telephonySessionId: "session-1",
        startTime: "2026-05-27T10:00:03.000Z",
        duration: 75,
        recording: null,
      },
    ],
    "session-1",
  );

  assert.deepEqual(recording, {
    callLogId: "call-2",
    recordingId: "rec-2",
    contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-2/content",
    telephonySessionId: "session-1",
  });
});

test("normalizes RingCentral session ids before matching recordings", () => {
  assert.equal(normalizeRingCentralSessionId(' "s-a0d178729c49dz1876d9b9d11z19269ec0000." '), "s-a0d178729c49dz1876d9b9d11z19269ec0000");

  const recording = selectRingCentralRecordingForSession(
    [
      {
        id: "call-1",
        telephonySessionId: "s-a0d178729c49dz1876d9b9d11z19269ec0000",
        startTime: "2026-05-27T10:00:00.000Z",
        duration: 48,
        recording: {
          id: "rec-1",
          contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-1/content",
        },
      },
    ],
    "s-a0d178729c49dz1876d9b9d11z19269ec0000.",
  );

  assert.deepEqual(recording, {
    callLogId: "call-1",
    recordingId: "rec-1",
    contentUri: "https://media.ringcentral.com/restapi/v1.0/account/~/recording/rec-1/content",
    telephonySessionId: "s-a0d178729c49dz1876d9b9d11z19269ec0000",
  });
});

test("detects outbound telephony directions", () => {
  assert.equal(isRingCentralOutboundDirection("Outbound"), true);
  assert.equal(isRingCentralOutboundDirection(" outbound "), true);
  assert.equal(isRingCentralOutboundDirection("Inbound"), false);
  assert.equal(isRingCentralOutboundDirection(null), false);
});

test("suppresses RingCentral live alerts during outbound sessions", () => {
  assert.equal(
    shouldSuppressRingCentralLiveAlert({
      direction: "Inbound",
      activeDirection: "Outbound",
    }),
    true,
  );
  assert.equal(
    shouldSuppressRingCentralLiveAlert({
      direction: "Outbound",
      activeDirection: "Inbound",
    }),
    true,
  );
  assert.equal(
    shouldSuppressRingCentralLiveAlert({
      direction: "Inbound",
      activeDirection: "Inbound",
    }),
    false,
  );
});

test("builds a RingCentral video bridge payload with sane CRM defaults", () => {
  assert.deepEqual(
    buildRingCentralVideoBridgeRequest({
      name: "  Demo pipeline review  ",
      type: "Scheduled",
      password: "  Wq123ygs15  ",
      joinBeforeHost: false,
      audioMuted: true,
      videoMuted: false,
    }),
    {
      name: "Demo pipeline review",
      type: "Scheduled",
      security: {
        passwordProtected: true,
        password: "Wq123ygs15",
        noGuests: false,
        sameAccount: false,
        e2ee: false,
      },
      preferences: {
        join: {
          audioMuted: true,
          videoMuted: false,
          waitingRoomRequired: "Nobody",
          pstn: {
            promptAnnouncement: true,
            promptParticipants: true,
          },
        },
        playTones: "Off",
        musicOnHold: true,
        joinBeforeHost: false,
        screenSharing: true,
        recordingsMode: "User",
        transcriptionsMode: "User",
      },
    },
  );
});

test("normalizes a RingCentral video bridge into the CRM meeting shape", () => {
  assert.deepEqual(
    normalizeRingCentralVideoBridge({
      id: "iad41-c04-ndb256065cf14ae6a1832389d9c2e",
      name: "Weekly Meeting with Joseph",
      type: "Instant",
      pins: {
        pstn: {
          host: "432331057631",
          participant: "013409241367",
        },
        web: "018209241352",
      },
      security: {
        passwordProtected: true,
        password: {
          plainText: "Wq123ygs15",
        },
      },
      preferences: {
        join: {
          audioMuted: false,
          videoMuted: false,
        },
        joinBeforeHost: true,
      },
      discovery: {
        web: "https://v.ringcentral.com/join/018209241352?pw=99e4f8e6a241fc71279449a9c8f46eef",
      },
    }),
    {
      id: "iad41-c04-ndb256065cf14ae6a1832389d9c2e",
      name: "Weekly Meeting with Joseph",
      type: "Instant",
      joinUrl: "https://v.ringcentral.com/join/018209241352?pw=99e4f8e6a241fc71279449a9c8f46eef",
      webPin: "018209241352",
      participantCode: "013409241367",
      hostCode: "432331057631",
      password: "Wq123ygs15",
      passwordProtected: true,
      joinBeforeHost: true,
      audioMuted: false,
      videoMuted: false,
    },
  );
});
