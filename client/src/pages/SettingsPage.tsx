import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { PasswordResetPanel } from "../components/auth/PasswordResetPanel";
import { formatRingCentralPhoneNumber } from "../lib/ringcentral";
import { useAppState } from "../hooks/useAppState";

type RingCentralAction = "connect" | "disconnect" | "refresh" | null;

export function SettingsPage() {
  const {
    authToken,
    ringCentralStatus,
    connectRingCentral,
    disconnectRingCentral,
    setRingCentralCallerIdNumber,
    refreshRingCentralStatus,
  } = useAppState();
  const [ringCentralActionMessage, setRingCentralActionMessage] = useState<string | null>(null);
  const [ringCentralAction, setRingCentralAction] = useState<RingCentralAction>(null);
  const [selectedCallerIdNumber, setSelectedCallerIdNumber] = useState(
    ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber ?? "",
  );

  useEffect(() => {
    setSelectedCallerIdNumber(
      ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber ?? "",
    );
  }, [ringCentralStatus.accountMainNumber, ringCentralStatus.selectedCallerIdNumber]);

  const options = useMemo(
    () => ringCentralStatus.availableCallerIdNumbers,
    [ringCentralStatus.availableCallerIdNumbers],
  );
  const displayedCallerIdNumber = ringCentralStatus.selectedCallerIdNumber ?? ringCentralStatus.accountMainNumber;
  const canSaveCallerIdNumber =
    ringCentralStatus.connected &&
    selectedCallerIdNumber !== (displayedCallerIdNumber ?? "");

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
      await refreshRingCentralStatus({ force: true }, authToken);
    } catch (error) {
      setRingCentralActionMessage(
        error instanceof Error ? error.message : "Unable to start RingCentral connection.",
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
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshRingCentralStatus}
                disabled={ringCentralAction !== null}
              >
                <RotateCcw size={14} />
                {ringCentralAction === "refresh" ? "Refreshing..." : "Refresh"}
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
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnectRingCentral}
                  disabled={ringCentralAction !== null}
                >
                  {ringCentralAction === "connect" ? "Connecting..." : "Connect RingCentral"}
                </Button>
              )}
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
                Caller ID
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
                  {options.map((number) => (
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
                  {options.length > 0
                    ? `${options.length} caller ID number${options.length === 1 ? "" : "s"} available`
                    : "No caller ID numbers were returned."}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
