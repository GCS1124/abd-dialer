# RingCentral Browser Softphone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-first RingCentral calling flow that handles outgoing and incoming calls in-app, with RingOut kept as a hidden fallback when the browser client cannot register.

**Architecture:** Add a small browser softphone service around RingCentral Web Phone / SIP.js, keep `useAppState` as the single source of truth for active calls, and reuse the existing dialer pages so the only visible UI change is the incoming answer/reject state. Recover call state from the RingCentral status payload on refresh and keep the current RingOut teardown path intact.

**Tech Stack:** React 19, TypeScript, Vite, `ringcentral-web-phone`, `@ringcentral/sdk`, SIP.js/WebRTC, Supabase Edge Functions (Deno), Node's built-in test runner, `sonner`

---

### Task 1: Add browser softphone config helpers and vendor typings

**Files:**
- Create `client/src/lib/browserSoftphone.ts`
- Create `client/src/lib/browserSoftphone.test.ts`
- Create `client/src/types/ringcentral-web-phone.d.ts`
- Modify `client/src/types/index.ts`
- Modify `client/package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildBrowserSoftphoneConfig } from "./browserSoftphone.ts";

test("buildBrowserSoftphoneConfig returns a ready config when workspace and SIP profile data are complete", () => {
  const config = buildBrowserSoftphoneConfig(
    {
      available: true,
      source: "profile",
      callerId: "+17325939636",
      websocketUrl: "wss://sip.ringcentral.example/ws",
      sipDomain: "sip.ringcentral.example",
      profileId: "profile-1",
      profileLabel: "Primary",
    },
    {
      sipUri: "sip:1001@sip.ringcentral.example",
      authorizationUsername: "1001",
      authorizationPassword: "secret",
      dialPrefix: "9",
      displayName: "Rocco Sgro",
    },
  );

  assert.equal(config.available, true);
  assert.equal(config.websocketUrl, "wss://sip.ringcentral.example/ws");
  assert.equal(config.authorizationUsername, "1001");
  assert.equal(config.displayName, "Rocco Sgro");
  assert.equal(config.dialPrefix, "9");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --test src/lib/browserSoftphone.test.ts`
Expected: fail because `buildBrowserSoftphoneConfig` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function buildBrowserSoftphoneConfig(voice, session) {
  const available =
    Boolean(voice.available) &&
    Boolean(voice.websocketUrl) &&
    Boolean(voice.sipDomain) &&
    Boolean(session.authorizationUsername) &&
    Boolean(session.authorizationPassword) &&
    Boolean(session.displayName);

  return {
    available,
    source: voice.source,
    callerId: voice.callerId ?? null,
    websocketUrl: voice.websocketUrl ?? null,
    sipDomain: voice.sipDomain ?? null,
    authorizationUsername: session.authorizationUsername ?? null,
    authorizationPassword: session.authorizationPassword ?? null,
    dialPrefix: session.dialPrefix ?? null,
    displayName: session.displayName ?? null,
    profileId: voice.profileId ?? null,
    profileLabel: voice.profileLabel ?? null,
    message: available ? null : "RingCentral browser calling is not ready.",
  };
}
```

Also add the new runtime types to `client/src/types/index.ts`, including:

```ts
export type CallTransportMode = "browser_softphone" | "ringout_fallback";
export type CallLifecycleState = "idle" | "ringing" | "connected" | "ending" | "failed";
```

And extend `ActiveCall` with:

```ts
transportMode?: CallTransportMode;
lifecycleState?: CallLifecycleState;
```

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `node --experimental-strip-types --test src/lib/browserSoftphone.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/browserSoftphone.ts client/src/lib/browserSoftphone.test.ts client/src/types/ringcentral-web-phone.d.ts client/src/types/index.ts client/package.json
git commit -m "feat: add browser softphone config helpers"
```

### Task 2: Extend RingCentral status to include active telephony recovery fields

**Files:**
- Create `client/src/lib/ringcentralStatus.ts`
- Create `client/src/lib/ringcentralStatus.test.ts`
- Modify `client/src/services/ringcentral.ts`
- Modify `supabase/functions/ringcentral/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRingCentralStatus } from "./ringcentralStatus.ts";

test("normalizeRingCentralStatus preserves active telephony recovery fields", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    accountId: "acct-1",
    extensionId: "ext-1",
    selectedRingOutNumber: "+17325939636",
    availableRingOutNumbers: [],
    connectedAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:01:00.000Z",
    expiresAt: null,
    message: null,
    activeTelephonySessionId: "session-1",
    activeTelephonyPartyId: "party-1",
    activeTelephonyDirection: "Inbound",
    activeTelephonyStatusCode: "Proceeding",
    activeTelephonyUpdatedAt: "2026-05-21T00:01:30.000Z",
  });

  assert.equal(status.activeTelephonySessionId, "session-1");
  assert.equal(status.activeTelephonyPartyId, "party-1");
  assert.equal(status.activeTelephonyDirection, "Inbound");
  assert.equal(status.activeTelephonyStatusCode, "Proceeding");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --test src/lib/ringcentralStatus.test.ts`
Expected: fail because `normalizeRingCentralStatus` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function normalizeRingCentralStatus(status) {
  return {
    ...status,
    activeTelephonySessionId: status.activeTelephonySessionId ?? null,
    activeTelephonyPartyId: status.activeTelephonyPartyId ?? null,
    activeTelephonyDirection: status.activeTelephonyDirection ?? null,
    activeTelephonyStatusCode: status.activeTelephonyStatusCode ?? null,
    activeTelephonyUpdatedAt: status.activeTelephonyUpdatedAt ?? null,
  };
}
```

Update `client/src/services/ringcentral.ts` so `RingCentralIntegrationStatus` includes:

```ts
activeTelephonySessionId: string | null;
activeTelephonyPartyId: string | null;
activeTelephonyDirection: string | null;
activeTelephonyStatusCode: string | null;
activeTelephonyUpdatedAt: string | null;
```

Update `supabase/functions/ringcentral/index.ts` so `mapRingCentralStatus()` returns those values from the existing row fields:

```ts
activeTelephonySessionId: row.active_telephony_session_id ?? null,
activeTelephonyPartyId: row.active_telephony_party_id ?? null,
activeTelephonyDirection: row.active_telephony_direction ?? null,
activeTelephonyStatusCode: row.active_telephony_status_code ?? null,
activeTelephonyUpdatedAt: row.active_telephony_updated_at ?? null,
```

Also update `buildEmptyStatus()` in the same file so the disconnected shape includes the same null recovery fields:

```ts
activeTelephonySessionId: null,
activeTelephonyPartyId: null,
activeTelephonyDirection: null,
activeTelephonyStatusCode: null,
activeTelephonyUpdatedAt: null,
```

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `node --experimental-strip-types --test src/lib/ringcentralStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringcentralStatus.ts client/src/lib/ringcentralStatus.test.ts client/src/services/ringcentral.ts supabase/functions/ringcentral/index.ts
git commit -m "feat: expose ringcentral telephony recovery state"
```

### Task 3: Add the browser softphone runtime service and wire it into app state

**Files:**
- Create `client/src/services/ringcentralSoftphone.ts`
- Create `client/src/lib/callSession.ts`
- Create `client/src/lib/callSession.test.ts`
- Modify `client/src/hooks/useAppState.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createIncomingCallState,
  promoteCallToConnected,
} from "./callSession.ts";

test("promoteCallToConnected preserves the inbound call identity", () => {
  const ringing = createIncomingCallState({
    leadId: "lead-1",
    displayName: "Shadma Ali",
    dialedNumber: "+17325939636",
    startedAt: 1716240000000,
    callId: "call-1",
  });

  const connected = promoteCallToConnected(ringing);

  assert.equal(connected.status, "connected");
  assert.equal(connected.direction, "incoming");
  assert.equal(connected.callId, "call-1");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --test src/lib/callSession.test.ts`
Expected: fail because `createIncomingCallState` and `promoteCallToConnected` do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function createIncomingCallState(input) {
  return {
    leadId: input.leadId ?? null,
    dialedNumber: input.dialedNumber,
    displayName: input.displayName,
    startedAt: input.startedAt,
    status: "ringing",
    muted: false,
    recordingEnabled: false,
    direction: "incoming",
    callId: input.callId ?? null,
    transportMode: "browser_softphone",
    lifecycleState: "ringing",
  };
}

export function promoteCallToConnected(call) {
  return {
    ...call,
    status: "connected",
    lifecycleState: "connected",
  };
}
```

Implement `client/src/services/ringcentralSoftphone.ts` as the browser calling adapter:

```ts
export async function createRingCentralSoftphone(config, handlers) {
  const { WebPhone } = await import("ringcentral-web-phone");
  const client = new WebPhone({
    auth: {
      username: config.authorizationUsername,
      password: config.authorizationPassword,
    },
    wsServers: [config.websocketUrl],
  });

  client.on("incomingCall", handlers.onIncomingCall);
  client.on("connected", handlers.onConnected);
  client.on("ended", handlers.onEnded);
  client.on("failed", handlers.onFailed);

  return {
    register: () => client.register(),
    unregister: () => client.unregister(),
    placeCall: (input) => client.call(input.to),
    answer: () => client.answer(),
    reject: () => client.reject(),
    end: () => client.end(),
    dispose: () => client.dispose(),
  };
}
```

Wire `client/src/hooks/useAppState.tsx` so that:

- workspace load builds the browser softphone config from the existing voice/session data
- a ready browser client becomes the primary call transport
- `startCall()` uses the browser client first
- `answerCall()` answers the current inbound browser session
- `rejectCall()` rejects the current inbound browser session
- if the browser client is unavailable, `startCall()` falls back to the current RingOut path without changing the visible dialer flow
- `endCall()` still closes the active session and opens the disposition flow the same way it does now
- the hook owns a `softphoneClientRef` and a derived `browserSoftphoneConfig` value built with `buildBrowserSoftphoneConfig()`
- `emptyRingCentralStatus` in the hook gets the new null recovery fields so disconnected state stays aligned with the backend

Concrete hook sketch:

```ts
useEffect(() => {
  if (!browserSoftphoneConfig.available) {
    return;
  }

  const softphone = createRingCentralSoftphone(browserSoftphoneConfig, {
    onIncomingCall: (event) => {
      setActiveCall(
        createIncomingCallState({
          leadId: event.leadId ?? null,
          displayName: event.displayName,
          dialedNumber: event.number,
          startedAt: Date.now(),
          callId: event.callId ?? null,
        }),
      );
    },
    onConnected: () => {
      setActiveCall((current) => (current ? promoteCallToConnected(current) : current));
    },
    onEnded: () => {
      finishCallSession(activeCallMetaRef.current?.leadId ?? null, Date.now());
    },
    onFailed: (error) => {
      setCallError(error.message);
    },
  });

  softphoneClientRef.current = softphone;
  void softphone.register().catch(() => {
    // Keep RingOut fallback available through startCall().
  });

  return () => {
    void softphone.unregister().catch(() => undefined);
    void softphone.dispose().catch(() => undefined);
  };
}, [browserSoftphoneConfig]);
```

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `node --experimental-strip-types --test src/lib/callSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/ringcentralSoftphone.ts client/src/lib/callSession.ts client/src/lib/callSession.test.ts client/src/hooks/useAppState.tsx
git commit -m "feat: wire browser softphone into app state"
```

### Task 4: Keep the dialer UI unchanged except for inbound answer/reject actions

**Files:**
- Create `client/src/lib/callUi.ts`
- Create `client/src/lib/callUi.test.ts`
- Modify `client/src/pages/PreviewDialerPage.tsx`
- Modify `client/src/pages/ManualDialerPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getPrimaryCallActionLabel, getSecondaryCallActionLabel } from "./callUi.ts";

test("incoming ringing calls show Answer and Reject labels", () => {
  const activeCall = {
    direction: "incoming",
    status: "ringing",
  };

  assert.equal(getPrimaryCallActionLabel(activeCall), "Answer");
  assert.equal(getSecondaryCallActionLabel(activeCall), "Reject");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --test src/lib/callUi.test.ts`
Expected: fail because `getPrimaryCallActionLabel` and `getSecondaryCallActionLabel` do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function getPrimaryCallActionLabel(activeCall) {
  if (!activeCall) {
    return "Call";
  }

  if (activeCall.direction === "incoming" && activeCall.status === "ringing") {
    return "Answer";
  }

  return "End call";
}

export function getSecondaryCallActionLabel(activeCall) {
  if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
    return "Reject";
  }

  return null;
}
```

Update the dialer pages so the existing top action row keeps the same layout, but the primary button switches labels based on state:

```tsx
const primaryCallLabel = getPrimaryCallActionLabel(activeCall);
const secondaryCallLabel = getSecondaryCallActionLabel(activeCall);

const handlePrimaryCallAction = () => {
  if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
    answerCall();
    return;
  }

  if (activeCall) {
    endCall();
    return;
  }

  handleCallLead();
};

<Button onClick={handlePrimaryCallAction}>
  {primaryCallLabel}
</Button>

{secondaryCallLabel ? (
  <Button variant="secondary" onClick={rejectCall}>
    {secondaryCallLabel}
  </Button>
) : null}
```

Keep the rest of the dialer UI intact:

- do not add new sections
- do not re-layout the page
- do not surface extra call controls outside the current top action area
- only the incoming call state should introduce the `Answer` and `Reject` actions

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `node --experimental-strip-types --test src/lib/callUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/callUi.ts client/src/lib/callUi.test.ts client/src/pages/PreviewDialerPage.tsx client/src/pages/ManualDialerPage.tsx
git commit -m "feat: surface inbound call answer controls"
```

### Task 5: Verify the browser-first flow end to end

**Files:**
- None, unless a final type or test adjustment is needed in the files above

- [ ] **Step 1: Run the focused helper tests**

Run:

```bash
node --experimental-strip-types --test src/lib/browserSoftphone.test.ts src/lib/ringcentralStatus.test.ts src/lib/callSession.test.ts src/lib/callUi.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run the client build**

Run:

```bash
npm.cmd run build
```

Expected: the Vite build passes with no TypeScript errors.

- [ ] **Step 3: Check the edge function types**

Run:

```bash
deno check supabase/functions/ringcentral/index.ts
```

Expected: the RingCentral status function type-checks after the new active telephony fields are added.

- [ ] **Step 4: Smoke test the call flow in the browser**

Open the app in the Browser plugin and verify:

1. the browser softphone registers for the current user
2. outgoing calls still place from the app
3. an incoming call appears as `ringing` in the dialer
4. `Answer` connects the call
5. `Reject` clears the ringing state
6. ending the call opens the disposition flow
7. saving the disposition advances to the next lead
8. if the browser softphone is unavailable, the app still falls back to RingOut without changing the normal dialer layout

- [ ] **Step 5: Commit the final implementation**

```bash
git add client/src/lib/browserSoftphone.ts client/src/lib/browserSoftphone.test.ts client/src/types/ringcentral-web-phone.d.ts client/src/types/index.ts client/src/lib/ringcentralStatus.ts client/src/lib/ringcentralStatus.test.ts client/src/services/ringcentral.ts supabase/functions/ringcentral/index.ts client/src/services/ringcentralSoftphone.ts client/src/lib/callSession.ts client/src/lib/callSession.test.ts client/src/lib/callUi.ts client/src/lib/callUi.test.ts client/src/hooks/useAppState.tsx client/src/pages/PreviewDialerPage.tsx client/src/pages/ManualDialerPage.tsx
git commit -m "feat: add browser-first ringcentral calling"
```

## Coverage Check

- Browser-first outgoing and incoming calling: Tasks 1, 3, and 4
- Fallback to RingOut when the browser client cannot register: Task 3 and Task 5
- Minimal UI change with only answer/reject additions: Task 4
- Active telephony recovery in RingCentral status: Task 2
- Existing queue, disposition, notes, and history flow preserved: Tasks 3 and 5
