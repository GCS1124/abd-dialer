import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRingCentralAuthorizationUrl,
  isRingCentralCallerIdNumber,
  isRingCentralOutboundNumber,
  isRingCentralRingOutFromNumber,
  formatRingCentralPhoneNumber,
  normalizeRingCentralBrowserVoiceSession,
  selectRingCentralCallerIdNumber,
  selectRingCentralRingOutFromNumber,
} from "./ringcentral.ts";

test("builds the RingCentral PKCE authorization url", () => {
  const url = buildRingCentralAuthorizationUrl({
    clientId: "rc-client-id",
    redirectUri: "https://crm.example.com/",
    codeChallenge: "code-challenge",
    state: "state-token",
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://platform.ringcentral.com");
  assert.equal(parsed.pathname, "/restapi/oauth/authorize");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("client_id"), "rc-client-id");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://crm.example.com/");
  assert.equal(parsed.searchParams.get("state"), "state-token");
  assert.equal(parsed.searchParams.get("code_challenge"), "code-challenge");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
});

test("normalizes a RingCentral browser voice session", () => {
  const session = normalizeRingCentralBrowserVoiceSession({
    available: true,
    source: "ringcentral",
    callerId: "+17325939636",
    websocketUrl: "wss://sip.ringcentral.example/ws",
    sipDomain: "sip.ringcentral.example",
    username: "1001",
    authorizationId: "instance-123",
    authorizationUsername: "1001",
    authorizationPassword: "secret",
    displayName: "Rocco Sgro",
  });

  assert.equal(session.available, true);
  assert.equal(session.source, "ringcentral");
  assert.equal(session.authorizationId, "instance-123");
  assert.equal(session.authorizationPassword, "secret");
});

test("keeps the caller-id and RingOut helper aliases compatible", () => {
  const numbers = [
    { phoneNumber: "18005550123", features: ["CallFlip"] },
    { phoneNumber: "18005550124", features: ["CallerId"] },
  ];

  assert.equal(isRingCentralCallerIdNumber(numbers[1]), true);
  assert.equal(isRingCentralOutboundNumber(numbers[1]), true);
  assert.equal(isRingCentralRingOutFromNumber(numbers[1]), true);
  assert.equal(selectRingCentralCallerIdNumber(numbers, null), "18005550124");
  assert.equal(selectRingCentralRingOutFromNumber(numbers, null), "18005550124");
});

test("does not use disabled caller-id numbers", () => {
  const selectedNumber = selectRingCentralCallerIdNumber(
    [
      { phoneNumber: "18005550123", features: ["CallerId"], enabled: false },
      { phoneNumber: "18005550124", features: ["CallerId"], enabled: true },
    ],
    null,
  );

  assert.equal(selectedNumber, "18005550124");
});

test("formats RingCentral phone numbers for display", () => {
  assert.equal(formatRingCentralPhoneNumber("17027494172"), "+1 702 749 4172");
  assert.equal(formatRingCentralPhoneNumber("7027494172"), "+1 702 749 4172");
});
