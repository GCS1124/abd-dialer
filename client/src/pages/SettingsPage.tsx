import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { PasswordResetPanel } from "../components/auth/PasswordResetPanel";
import { formatRingCentralPhoneNumber, isRingCentralSmsSenderNumber } from "../lib/ringcentral";
import { useAppState } from "../hooks/useAppState";

type RingCentralAction = "connect" | "authorize" | "disconnect" | "refresh" | null;

export function SettingsPage() {
  const {
    authToken,
    ringCentralStatus,
    connectRingCentral,
    authorizeRingCentral,
    disconnectRingCentral,
    setRingCentralCallerIdNumber,
    setRingCentralSmsSender,
    refreshRingCentralStatus,
  } = useAppState();
  const [ringCentralActionMessage, setRingCentralActionMessage] = useState<string | null>(null);
  const [ringCentralAction, setRingCentralAction] = useState<RingCentralAction>(null);
  const [selectedCallerIdNumber, setSelectedCallerIdNumber] = useState(
    ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber ?? "",
  );
  const [selectedSmsSenderNumber, setSelectedSmsSenderNumber] = useState(
    ringCentralStatus.selectedSmsSenderNumber ?? "",
  );

  useEffect(() => {
    setSelectedCallerIdNumber(
      ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber ?? "",
    );
  }, [ringCentralStatus.accountMainNumber, ringCentralStatus.selectedCallerIdNumber]);

  const smsOptions = useMemo(
    () => ringCentralStatus.availableCallerIdNumbers.filter(isRingCentralSmsSenderNumber),
    [ringCentralStatus.availableCallerIdNumbers],
  );
  const callerIdOptions = ringCentralStatus.availableCallerIdNumbers;
  const selectedSmsOption = smsOptions.find((number) => number.phoneNumber === selectedSmsSenderNumber) ?? null;
  const displayedCallerIdNumber = ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber;
  const displayedSmsSenderNumber = ringCentralStatus.selectedSmsSenderNumber;
  const canSaveCallerIdNumber =
    ringCentralStatus.connected &&
    selectedCallerIdNumber !== (displayedCallerIdNumber ?? "");
  const canSaveSmsSender =
    ringCentralStatus.connected &&
    selectedSmsSenderNumber !== (displayedSmsSenderNumber ?? "") &&
    Boolean(selectedSmsOption);

  useEffect(() => {
    setSelectedSmsSenderNumber(ringCentralStatus.selectedSmsSenderNumber ?? "");
  }, [ringCentralStatus.selectedSmsSenderNumber]);

  const handleRefreshRingCentralStatus = async () => {
    try {
      setRingCentralActionMessage(null);
      setRingCentralAction("refresh");
      await refreshRingCentralStatus({ force: true }, authToken);
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to refresh RingCentral status.",
      );
    } finally {
      setRingCentralAction(null);
    }
  };

  const handleConnectRingCentral = async () => {
    try {
      setRingCentralActionMessage(null);
      setRingCentralAction("connect");
      await connectRingCentral();
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to start RingCentral connection.",
      );
    } finally {
      setRingCentralAction(null);
    }
  };

  const handleAuthorizeRingCentral = async () => {
    try {
      setRingCentralActionMessage(null);
      setRingCentralAction("authorize");
      await authorizeRingCentral();
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to start RingCentral authorization.",
      );
    } finally {
      setRingCentralAction(null);
    }
  };

  const handleSaveCallerIdNumber = async () => {
    try {
      setRingCentralActionMessage(null);
      await setRingCentralCallerIdNumber(selectedCallerIdNumber || null);
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to save that caller ID number.",
      );
    }
  };

  const handleSaveSmsSender = async () => {
    const selectedSmsOption = smsOptions.find((number) => number.phoneNumber === selectedSmsSenderNumber);
    const extensionId = selectedSmsOption?.extensionId ?? ringCentralStatus.extensionId;
    if (!selectedSmsOption || !extensionId) {
      setRingCentralActionMessage("RingCentral did not return the owning extension for this SMS number.");
      return;
    }

    try {
      setRingCentralActionMessage(null);
      await setRingCentralSmsSender(extensionId, selectedSmsOption.phoneNumber);
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to save the SMS sender.",
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      setRingCentralActionMessage(null);
      setRingCentralAction("disconnect");
      await disconnectRingCentral();
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to disconnect RingCentral.",
      );
    } finally {
      setRingCentralAction(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
      />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4 p-5">
          <PasswordResetPanel mode="settings" />
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">
                RingCentral connection
              </h3>
              <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                Connect with the workspace JWT for the configured RingCentral extension, or authorize a different user when SMS needs another extension&apos;s permission.
              </p>
              <p className="mt-2 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                JWT is non-interactive and cannot switch extensions. A different JWT user must be configured server-side; the authorization button uses OAuth for that user permission.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshRingCentralStatus}
                disabled={ringCentralAction !== null}
              >
                <RotateCcw size={14} />
                {ringCentralAction === "refresh" ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnectRingCentral}
                disabled={ringCentralAction !== null}
              >
                {ringCentralAction === "connect"
                  ? "Connecting..."
                  : ringCentralStatus.connected
                    ? "Reconnect with JWT"
                    : "Connect with JWT"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAuthorizeRingCentral}
                disabled={ringCentralAction !== null}
              >
                {ringCentralAction === "authorize" ? "Opening RingCentral..." : "Authorize another user (OAuth)"}
              </Button>
              {ringCentralStatus.connected ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={ringCentralAction !== null}
                >
                  {ringCentralAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="crm-subtle-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Status
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                {ringCentralStatus.connected ? "Connected" : "Not connected"}
              </p>
            </div>
            <div className="crm-subtle-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Selected number
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                {displayedCallerIdNumber
                  ? formatRingCentralPhoneNumber(displayedCallerIdNumber)
                  : "No caller ID selected"}
              </p>
            </div>
          </div>

          <div className="crm-subtle-card space-y-3 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Caller ID for calls
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="sr-only">RingCentral caller ID number</span>
                <select
                  className="h-10 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  value={selectedCallerIdNumber}
                  onChange={(event) => setSelectedCallerIdNumber(event.target.value)}
                  disabled={!ringCentralStatus.connected}
                >
                  {callerIdOptions.map((number) => (
                    <option key={number.phoneNumber} value={number.phoneNumber}>
                      {formatRingCentralPhoneNumber(number.phoneNumber)}
                      {number.label ? ` · ${number.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="secondary"
                onClick={handleSaveCallerIdNumber}
                disabled={!canSaveCallerIdNumber || ringCentralAction !== null}
              >
                Save caller ID
              </Button>
            </div>

            {ringCentralStatus.message ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {ringCentralStatus.message}
              </div>
            ) : null}

            {ringCentralActionMessage ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {ringCentralActionMessage}
              </div>
            ) : null}

            {ringCentralStatus.connectedAt ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  Connected at {new Date(ringCentralStatus.connectedAt).toLocaleString()}
                </div>
                <div className="crm-subtle-card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  {callerIdOptions.length > 0
                    ? `${callerIdOptions.length} caller ID number${callerIdOptions.length === 1 ? "" : "s"} available`
                    : "No caller ID numbers were returned."}
                </div>
              </div>
            ) : null}
          </div>

          <div className="crm-subtle-card space-y-3 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                SMS sender
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Independent from the caller ID used for voice calls. Select Keith Show here to read and send from extension 102.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="sr-only">RingCentral SMS sender number</span>
                <select
                  className="h-10 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  value={selectedSmsSenderNumber}
                  onChange={(event) => setSelectedSmsSenderNumber(event.target.value)}
                  disabled={!ringCentralStatus.connected || smsOptions.length === 0}
                >
                  {smsOptions.map((number) => (
                    <option key={`${number.phoneNumber}-${number.extensionId ?? "current"}`} value={number.phoneNumber}>
                      {formatRingCentralPhoneNumber(number.phoneNumber)}
                      {number.label ? ` · ${number.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="secondary"
                onClick={handleSaveSmsSender}
                disabled={!canSaveSmsSender || ringCentralAction !== null}
              >
                Save SMS sender
              </Button>
            </div>

            {smsOptions.length === 0 ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                No SMS-capable RingCentral numbers were returned for this connection.
              </div>
            ) : selectedSmsOption?.extensionId && selectedSmsOption.extensionId !== ringCentralStatus.extensionId ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                This sender belongs to another RingCentral extension. Reading may work with the current token, but sending requires RingCentral permission for that extension or a Keith Show connection.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
