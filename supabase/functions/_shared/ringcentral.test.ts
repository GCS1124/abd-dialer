import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralVideoBridgeRequest,
  buildRingCentralSmsInstantMessageFilter,
  buildRingCentralSmsSendRequest,
  extractRingCentralSessionId,
  findRingCentralWebhookSubscription,
  isRingCentralOutboundDirection,
  isRingCentralOutboundNumber,
  isRingCentralRingOutFromNumber,
  isRingCentralSmsSenderNumber,
  isRingCentralSmsSenderForExtension,
  normalizeRingCentralVideoBridge,
  normalizeRingCentralSessionId,
  selectRingCentralRingOutFromNumber,
  selectRingCentralSmsSenderNumber,
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

test("keeps forwarded ring-out numbers eligible", () => {
  const forwardedNumber = {
    phoneNumber: "18005550123",
    features: ["CallFlip"],
    type: "PhoneLine",
    usageType: "ForwardedNumber",
  };

  assert.equal(isRingCentralOutboundNumber(forwardedNumber), true);
  assert.equal(isRingCentralRingOutFromNumber(forwardedNumber), true);
  assert.equal(selectRingCentralRingOutFromNumber([forwardedNumber], null), "18005550123");
});

test("selects sms-capable numbers and ignores unsupported ones", () => {
  const smsNumber = {
    phoneNumber: "18005550124",
    features: ["CallerId", "SmsSender"],
    type: "DirectNumber",
    usageType: "DirectNumber",
  };
  const voiceOnlyNumber = {
    phoneNumber: "18005550125",
    features: ["CallerId"],
    type: "DirectNumber",
    usageType: "DirectNumber",
  };

  assert.equal(isRingCentralSmsSenderNumber(smsNumber), true);
  assert.equal(isRingCentralSmsSenderNumber(voiceOnlyNumber), false);
  assert.equal(selectRingCentralSmsSenderNumber([voiceOnlyNumber, smsNumber], null), "18005550124");
  assert.equal(selectRingCentralSmsSenderNumber([smsNumber], "18005550124"), "18005550124");
});

test("builds extension-specific RingCentral SMS webhook filters", () => {
  assert.equal(
    buildRingCentralSmsInstantMessageFilter("123456789"),
    "/restapi/v1.0/account/~/extension/123456789/message-store/instant?type=SMS",
  );
  assert.equal(
    buildRingCentralSmsInstantMessageFilter(null),
    "/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS",
  );
});

test("builds a valid RingCentral SMS send payload", () => {
  assert.deepEqual(
    buildRingCentralSmsSendRequest({
      extensionId: "987654321",
      fromPhoneNumber: "+17027494172",
      toPhoneNumber: "+16693154290",
      text: "hi",
    }),
    {
      path: "/restapi/v1.0/account/~/extension/987654321/sms",
      body: {
        from: { phoneNumber: "+17027494172" },
        to: [{ phoneNumber: "+16693154290" }],
        text: "hi",
      },
    },
  );

  assert.equal(
    buildRingCentralSmsSendRequest({
      fromPhoneNumber: "+17027494172",
      toPhoneNumber: "+16693154290",
      text: "hi",
    }).path,
    "/restapi/v1.0/account/~/extension/~/sms",
  );
});

test("treats direct non-fax numbers with omitted features as SMS-capable", () => {
  assert.equal(
    isRingCentralSmsSenderNumber({
      phoneNumber: "16693154290",
      features: [],
      type: "VoiceFax",
      usageType: "DirectNumber",
    }),
    true,
  );
  assert.equal(
    isRingCentralSmsSenderNumber({
      phoneNumber: "18775787788",
      features: ["CallerId"],
      type: "VoiceFax",
      usageType: "MainCompanyNumber",
    }),
    false,
  );
  assert.equal(
    isRingCentralSmsSenderNumber({
      phoneNumber: "18005550126",
      features: [],
      type: "FaxOnly",
      usageType: "DirectNumber",
    }),
    false,
  );
});

test("does not select another extension's direct number for SMS", () => {
  const shadmaNumber = {
    phoneNumber: "17027494172",
    extensionId: "63398260007",
    features: ["SmsSender"],
    type: "VoiceFax",
    usageType: "DirectNumber",
  };
  const keithNumber = {
    phoneNumber: "16693154290",
    extensionId: "63677362007",
    features: ["SmsSender"],
    type: "VoiceFax",
    usageType: "DirectNumber",
  };

  assert.equal(isRingCentralSmsSenderForExtension(shadmaNumber, "63398260007"), true);
  assert.equal(isRingCentralSmsSenderForExtension(keithNumber, "63398260007"), false);
  assert.equal(
    selectRingCentralSmsSenderNumber([keithNumber, shadmaNumber], "16693154290", "63398260007"),
    "17027494172",
  );
});

test("allows an explicitly selected SMS sender from another extension", () => {
  const keithNumber = {
    phoneNumber: "16693154290",
    extensionId: "63677362007",
    features: ["SmsSender"],
    type: "VoiceFax",
    usageType: "DirectNumber",
  };

  assert.equal(
    selectRingCentralSmsSenderNumber([keithNumber], "16693154290"),
    "16693154290",
  );
  assert.deepEqual(
    buildRingCentralSmsSendRequest({
      extensionId: keithNumber.extensionId,
      fromPhoneNumber: "+16693154290",
      toPhoneNumber: "+17025550123",
      text: "Keith message",
    }).path,
    "/restapi/v1.0/account/~/extension/63677362007/sms",
  );
});

test("finds an active webhook subscription for the CRM endpoint", () => {
  assert.deepEqual(
    findRingCentralWebhookSubscription(
      [
        {
          id: "inactive-subscription",
          status: "Blacklisted",
          deliveryMode: {
            transportType: "WebHook",
            address: "https://example.com/ringcentral-webhook",
          },
        },
        {
          id: "crm-subscription",
          status: "Active",
          eventFilters: ["/restapi/v1.0/account/~/telephony/sessions"],
          deliveryMode: {
            transportType: "WebHook",
            address: "https://example.com/ringcentral-webhook",
          },
          expirationTime: "2026-08-07T00:00:00.000Z",
        },
      ],
      "https://example.com/ringcentral-webhook",
    ),
    {
      id: "crm-subscription",
      expirationTime: "2026-08-07T00:00:00.000Z",
    },
  );
});

test("reuses a webhook subscription by address even when its old filters differ", () => {
  assert.deepEqual(
    findRingCentralWebhookSubscription(
      [
        {
          id: "sms-only-subscription",
          status: "Active",
          eventFilters: ["/restapi/v1.0/account/~/extension/~/message-store"],
          deliveryMode: {
            transportType: "WebHook",
            address: "https://example.com/ringcentral-webhook",
          },
          expirationTime: "2026-08-07T00:00:00.000Z",
        },
      ],
      "https://example.com/ringcentral-webhook",
    ),
    {
      id: "sms-only-subscription",
      expirationTime: "2026-08-07T00:00:00.000Z",
    },
  );
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
