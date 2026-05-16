const RINGCENTRAL_EMBEDDABLE_BASE_URL =
  "https://apps.ringcentral.com/integration/ringcentral-embeddable/latest";
const RINGCENTRAL_EMBEDDABLE_SCRIPT_ID = "ringcentral-embeddable-adapter";
const RINGCENTRAL_EMBEDDABLE_FRAME_ID = "rc-widget-adapter-frame";
const RINGCENTRAL_DEFAULT_SERVER_URL = "https://platform.ringcentral.com";

export interface RingCentralBrowserPhoneConfig {
  clientId: string;
  clientSecret: string;
  jwt: string;
  serverUrl: string;
}

export interface RingCentralBrowserPhoneCallSnapshot {
  callId: string | null;
  direction: string | null;
  telephonyStatus: string | null;
  fromPhoneNumber: string | null;
  toPhoneNumber: string | null;
  fromName: string | null;
  toName: string | null;
}

export interface RingCentralBrowserPhoneMessage {
  type: string;
  call: RingCentralBrowserPhoneCallSnapshot | null;
  connectionStatus: string | null;
  ready: boolean | null;
  callWith: string | null;
  fromNumbers: string[] | null;
  raw: unknown;
}

interface RingCentralAdapterWindow extends Window {
  RCAdapter?: {
    clickToCall?: (phoneNumber: string, toCall?: boolean) => void;
    setMinimized?: (value: boolean) => void;
    setClosed?: (value: boolean) => void;
    popupWindow?: () => void;
    dispose?: () => void;
  };
  RCAdapterInit?: () => void;
  RCAdapterDispose?: () => void;
  RC_EMBEDDABLE_ADAPTER_MANUAL_INIT?: boolean;
}

let loadPromise: Promise<void> | null = null;
let initPromise: Promise<void> | null = null;

function getWindow() {
  if (typeof window === "undefined") {
    throw new Error("RingCentral browser phone is only available in the browser.");
  }

  return window as RingCentralAdapterWindow;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPhoneNumber(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = readOptionalRecord(value);
  if (!record) {
    return "";
  }

  return readString(record.phoneNumber) || readString(record.number) || readString(record.value);
}

function readFromNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value
    .map((entry) => readPhoneNumber(entry))
    .filter((entry) => entry.length > 0);

  return numbers.length ? numbers : null;
}

function readCallSnapshot(value: unknown): RingCentralBrowserPhoneCallSnapshot | null {
  const record = readOptionalRecord(value);
  if (!record) {
    return null;
  }

  const callRecord = readOptionalRecord(record.call) ?? record;
  const fromRecord = readOptionalRecord(callRecord.from);
  const toRecord = readOptionalRecord(callRecord.to);

  const callId =
    readString(callRecord.id) ||
    readString(callRecord.callId) ||
    readString(callRecord.telephonySessionId) ||
    readString(callRecord.sessionId) ||
    null;

  return {
    callId,
    direction: readString(callRecord.direction) || null,
    telephonyStatus:
      readString(callRecord.telephonyStatus) ||
      readString(callRecord.status) ||
      readString(callRecord.state) ||
      null,
    fromPhoneNumber: readPhoneNumber(fromRecord?.phoneNumber ?? callRecord.fromPhoneNumber ?? callRecord.from),
    toPhoneNumber: readPhoneNumber(toRecord?.phoneNumber ?? callRecord.toPhoneNumber ?? callRecord.to),
    fromName: readString(fromRecord?.name ?? callRecord.fromName) || null,
    toName: readString(toRecord?.name ?? callRecord.toName) || null,
  };
}

function readNestedCallValue(record: Record<string, unknown>, key: "body" | "data" | "detail") {
  const nestedRecord = readOptionalRecord(record[key]);
  return nestedRecord?.call ?? null;
}

export function getRingCentralBrowserPhoneConfig(): RingCentralBrowserPhoneConfig | null {
  const clientId = import.meta.env.VITE_RINGCENTRAL_EMBEDDABLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = import.meta.env.VITE_RINGCENTRAL_EMBEDDABLE_CLIENT_SECRET?.trim() ?? "";
  const jwt = import.meta.env.VITE_RINGCENTRAL_EMBEDDABLE_JWT?.trim() ?? "";
  const serverUrl = import.meta.env.VITE_RINGCENTRAL_EMBEDDABLE_SERVER_URL?.trim() ||
    RINGCENTRAL_DEFAULT_SERVER_URL;

  if (!clientId || !clientSecret || !jwt) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    jwt,
    serverUrl,
  };
}

export function hasRingCentralBrowserPhoneConfig() {
  return Boolean(getRingCentralBrowserPhoneConfig());
}

export function buildRingCentralBrowserPhoneScriptUrl(config = getRingCentralBrowserPhoneConfig()) {
  if (!config) {
    throw new Error("RingCentral browser phone is not configured.");
  }

  const url = new URL(`${RINGCENTRAL_EMBEDDABLE_BASE_URL}/adapter.js`);
  url.searchParams.set("clientId", config.clientId);
  url.searchParams.set("clientSecret", config.clientSecret);
  url.searchParams.set("jwt", config.jwt);
  url.searchParams.set("appServer", config.serverUrl);
  url.searchParams.set("defaultCallWith", "browser");
  url.searchParams.set("enableFromNumberSetting", "1");
  url.searchParams.set("disableInactiveTabCallEvent", "1");
  return url.toString();
}

function getAdapterFrame() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById(RINGCENTRAL_EMBEDDABLE_FRAME_ID) as HTMLIFrameElement | null;
}

function postMessageToAdapter(message: Record<string, unknown>) {
  const frame = getAdapterFrame();
  if (!frame?.contentWindow) {
    return false;
  }

  frame.contentWindow.postMessage(message, "*");
  return true;
}

async function waitForAdapterReady(timeoutMs = 15000) {
  const win = getWindow();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (win.RCAdapter?.clickToCall && getAdapterFrame()?.contentWindow) {
      return;
    }

    await new Promise((resolve) => win.setTimeout(resolve, 100));
  }

  throw new Error("RingCentral browser phone did not finish loading.");
}

async function ensureLoaded() {
  const config = getRingCentralBrowserPhoneConfig();
  if (!config) {
    throw new Error("RingCentral browser phone is not configured.");
  }

  const win = getWindow();
  win.RC_EMBEDDABLE_ADAPTER_MANUAL_INIT = true;

  if (win.RCAdapter?.clickToCall && getAdapterFrame()?.contentWindow) {
    return;
  }

  if (!loadPromise) {
    loadPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById(RINGCENTRAL_EMBEDDABLE_SCRIPT_ID) as
        | HTMLScriptElement
        | null;

      if (existingScript) {
        if (existingScript.dataset.ringcentralLoaded === "true") {
          try {
            win.RCAdapterInit?.();
            resolve();
          } catch (error) {
            reject(error);
          }
          return;
        }

        existingScript.addEventListener("load", () => {
          try {
            existingScript.dataset.ringcentralLoaded = "true";
            win.RCAdapterInit?.();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        existingScript.addEventListener("error", () => {
          reject(new Error("RingCentral browser phone failed to load."));
        });
        return;
      }

      const script = document.createElement("script");
      script.id = RINGCENTRAL_EMBEDDABLE_SCRIPT_ID;
      script.async = true;
      script.src = buildRingCentralBrowserPhoneScriptUrl(config);
      script.addEventListener("load", () => {
        try {
          script.dataset.ringcentralLoaded = "true";
          win.RCAdapterInit?.();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      script.addEventListener("error", () => {
        reject(new Error("RingCentral browser phone failed to load."));
      });

      const referenceNode = document.getElementsByTagName("script")[0];
      if (referenceNode?.parentNode) {
        referenceNode.parentNode.insertBefore(script, referenceNode);
      } else {
        document.head.appendChild(script);
      }
    }).finally(() => {
      loadPromise = null;
    });
  }

  await loadPromise;

  if (!initPromise) {
    initPromise = waitForAdapterReady().finally(() => {
      initPromise = null;
    });
  }

  await initPromise;
}

export async function loadRingCentralBrowserPhone() {
  await ensureLoaded();
}

export function disposeRingCentralBrowserPhone() {
  const win = typeof window === "undefined" ? null : (window as RingCentralAdapterWindow);
  if (win?.RCAdapterDispose) {
    try {
      win.RCAdapterDispose();
    } catch {
      // Ignore widget disposal failures during cleanup.
    }
  } else if (win?.RCAdapter?.dispose) {
    try {
      win.RCAdapter.dispose();
    } catch {
      // Ignore widget disposal failures during cleanup.
    }
  }

  const script = typeof document === "undefined"
    ? null
    : (document.getElementById(RINGCENTRAL_EMBEDDABLE_SCRIPT_ID) as HTMLScriptElement | null);
  if (script) {
    script.remove();
  }
}

export async function clickToCallRingCentralBrowserPhone(phoneNumber: string) {
  await ensureLoaded();
  const win = getWindow();
  const normalizedPhoneNumber = phoneNumber.trim();
  if (!normalizedPhoneNumber) {
    throw new Error("A phone number is required.");
  }

  if (typeof win.RCAdapter?.clickToCall === "function") {
    win.RCAdapter.clickToCall(normalizedPhoneNumber, true);
    return;
  }

  const sent = postMessageToAdapter({
    type: "rc-adapter-new-call",
    phoneNumber: normalizedPhoneNumber,
    toCall: true,
  });

  if (!sent) {
    throw new Error("RingCentral browser phone is not ready.");
  }
}

export async function syncRingCentralBrowserPhoneCallingSettings(fromNumber: string | null) {
  await ensureLoaded();
  const payload: Record<string, unknown> = {
    type: "rc-calling-settings-update",
    callWith: "browser",
  };

  if (fromNumber && fromNumber.trim()) {
    payload.fromNumber = fromNumber.trim();
  }

  if (!postMessageToAdapter(payload)) {
    throw new Error("RingCentral browser phone is not ready.");
  }
}

export function sendRingCentralBrowserPhoneCallAction(
  callAction: "answer" | "reject" | "toVoicemail" | "hangup" | "hold" | "unhold" | "mute" | "unmute",
  callId?: string | null,
) {
  const payload: Record<string, unknown> = {
    type: "rc-adapter-control-call",
    callAction,
  };

  if (callId?.trim()) {
    payload.callId = callId.trim();
  }

  if (!postMessageToAdapter(payload)) {
    throw new Error("RingCentral browser phone is not ready.");
  }
}

export function minimizeRingCentralBrowserPhone() {
  const win = typeof window === "undefined" ? null : (window as RingCentralAdapterWindow);
  win?.RCAdapter?.setMinimized?.(true);
}

export function openRingCentralBrowserPhone() {
  const win = typeof window === "undefined" ? null : (window as RingCentralAdapterWindow);
  win?.RCAdapter?.setClosed?.(false);
  win?.RCAdapter?.setMinimized?.(false);
}

export function hideRingCentralBrowserPhone() {
  const win = typeof window === "undefined" ? null : (window as RingCentralAdapterWindow);
  win?.RCAdapter?.setClosed?.(true);
}

export function popupRingCentralBrowserPhone() {
  const win = typeof window === "undefined" ? null : (window as RingCentralAdapterWindow);
  win?.RCAdapter?.popupWindow?.();
}

export function parseRingCentralBrowserPhoneMessage(eventData: unknown): RingCentralBrowserPhoneMessage | null {
  const record = readOptionalRecord(eventData);
  if (!record) {
    return null;
  }

  const type =
    readString(record.type) ||
    readString(record.event) ||
    readString(record.name) ||
    readString(record.action);
  if (!type) {
    return null;
  }

  const call =
    readCallSnapshot(record.call) ??
    readCallSnapshot(readNestedCallValue(record, "body")) ??
    readCallSnapshot(readNestedCallValue(record, "data")) ??
    readCallSnapshot(readNestedCallValue(record, "detail"));
  const connectionStatus =
    readString(record.connectionStatus) ||
    readString(record.status) ||
    readString(record.webphoneStatus) ||
    null;
  const ready = typeof record.ready === "boolean" ? record.ready : null;
  const callWith = readString(record.callWith) || null;
  const fromNumbers =
    readFromNumbers(record.fromNumbers) ??
    readFromNumbers(readOptionalRecord(record.body)?.fromNumbers) ??
    readFromNumbers(readOptionalRecord(record.data)?.fromNumbers);

  return {
    type,
    call,
    connectionStatus,
    ready,
    callWith,
    fromNumbers,
    raw: eventData,
  };
}

export function readRingCentralBrowserPhoneCallId(call: RingCentralBrowserPhoneCallSnapshot | null) {
  return call?.callId ?? null;
}

export function readRingCentralBrowserPhonePhoneNumber(
  call: RingCentralBrowserPhoneCallSnapshot | null,
  direction: "from" | "to" = "from",
) {
  if (!call) {
    return null;
  }

  return direction === "from" ? call.fromPhoneNumber : call.toPhoneNumber;
}
