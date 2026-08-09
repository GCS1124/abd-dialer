import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MessageSquare,
  PhoneCall,
  RefreshCcw,
  Search,
  Plus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { findLeadForDialNumber } from "../lib/dialerNumbers";
import { isRingCentralSmsSenderNumber } from "../lib/ringcentral";
import { cn, formatDateTime, formatPhone, formatRelativeAge, getInitials } from "../lib/utils";
import { supabase } from "../lib/supabase";
import {
  loadRingCentralSmsMessages,
  sendRingCentralSms,
  type RingCentralSmsMessage,
} from "../services/ringcentral";

interface SmsThread {
  key: string;
  conversationId: string | null;
  peerPhoneNumber: string | null;
  peerName: string | null;
  leadId: string | null;
  leadName: string | null;
  title: string;
  snippet: string;
  unreadCount: number;
  messages: RingCentralSmsMessage[];
  latestMessage: RingCentralSmsMessage;
}

function parseMessageTimestamp(message: RingCentralSmsMessage) {
  return Date.parse(message.lastModifiedTime ?? message.creationTime ?? "") || 0;
}

function buildThreadKey(message: RingCentralSmsMessage) {
  if (message.conversationId) {
    return `conversation:${message.conversationId}`;
  }

  if (message.peerPhoneNumber) {
    return `peer:${message.peerPhoneNumber}`;
  }

  return [
    "message",
    message.id ?? "",
    message.creationTime ?? "",
    message.fromPhoneNumber ?? "",
    message.toPhoneNumbers.join(","),
    message.subject ?? "",
  ].join(":");
}

function buildThreadTitle(
  peerPhoneNumber: string | null,
  peerName: string | null,
  leadName: string | null,
) {
  const title = leadName || peerName || (peerPhoneNumber ? formatPhone(peerPhoneNumber) : "");
  return title || "Unknown number";
}

function formatSmsDisplayNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return formatPhone(`+${digits}`);
  }

  if (digits.length === 10) {
    return formatPhone(`+1${digits}`);
  }

  return formatPhone(value);
}

export function SmsPage() {
  const {
    currentUser,
    leads,
    authToken,
    ringCentralStatus,
    connectRingCentral,
  } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();

  const [smsMessages, setSmsMessages] = useState<RingCentralSmsMessage[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [draftByThread, setDraftByThread] = useState<Record<string, string>>({});
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeToPhoneNumber, setComposeToPhoneNumber] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeLeadId, setComposeLeadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const smsCapableNumbers = useMemo(
    () => ringCentralStatus.availableCallerIdNumbers.filter(isRingCentralSmsSenderNumber),
    [ringCentralStatus.availableCallerIdNumbers],
  );
  const selectedSmsCapableNumber = useMemo(
    () =>
      smsCapableNumbers.find((number) => number.phoneNumber === ringCentralStatus.selectedSmsSenderNumber) ??
      null,
    [ringCentralStatus.selectedSmsSenderNumber, smsCapableNumbers],
  );
  const selectedSmsDisplayNumber = useMemo(
    () => formatSmsDisplayNumber(selectedSmsCapableNumber?.phoneNumber ?? ringCentralStatus.selectedSmsSenderNumber),
    [ringCentralStatus.selectedSmsSenderNumber, selectedSmsCapableNumber],
  );

  const loadMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!authToken || !ringCentralStatus.connected) {
        setSmsMessages([]);
        setSelectedThreadKey(null);
        setSmsError(null);
        setLastSyncedAt(null);
        setSmsLoading(false);
        return [] as RingCentralSmsMessage[];
      }

      if (!options?.silent) {
        setSmsLoading(true);
      }

      try {
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const messages = await loadRingCentralSmsMessages(
          {
            dateFrom,
            maxPages: 4,
            perPage: 100,
          },
          authToken,
        );
        setSmsMessages(messages);
        setLastSyncedAt(new Date().toISOString());
        setSmsError(null);
        return messages;
      } catch (error) {
        setSmsError(error instanceof Error ? error.message : "Unable to load SMS messages.");
        return [];
      } finally {
        if (!options?.silent) {
          setSmsLoading(false);
        }
      }
    },
    [authToken, ringCentralStatus.connected],
  );

  useEffect(() => {
    if (!authToken || !ringCentralStatus.connected) {
      setSmsMessages([]);
      setSelectedThreadKey(null);
      setSmsError(null);
      setLastSyncedAt(null);
      setSmsLoading(false);
      return;
    }

    const timer = window.setInterval(() => {
      void loadMessages({ silent: true });
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authToken, loadMessages, ringCentralStatus.connected]);

  useEffect(() => {
    const client = supabase;
    if (!authToken || !ringCentralStatus.connected || !currentUser?.id || !client) {
      return;
    }

    client.realtime.setAuth(authToken);
    const channel = client
      .channel(`crm-sms-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ringcentral_sms_messages",
          filter: `app_user_id=eq.${currentUser.id}`,
        },
        () => {
          void loadMessages({ silent: true });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [authToken, currentUser?.id, loadMessages, ringCentralStatus.connected]);

  useEffect(() => {
    if (!authToken || !ringCentralStatus.connected) {
      return;
    }

    void loadMessages();
  }, [authToken, loadMessages, ringCentralStatus.connected, ringCentralStatus.selectedSmsSenderNumber]);

  useEffect(() => {
    const compose = searchParams.get("compose");
    if (compose !== "1") {
      return;
    }

    setComposeOpen(true);
    setComposeToPhoneNumber(searchParams.get("to") ?? "");
    setComposeLeadId(searchParams.get("leadId") || null);
    setComposeMessage("");
  }, [searchParams]);

  const threads = useMemo<SmsThread[]>(() => {
    const groupedMessages = new Map<string, RingCentralSmsMessage[]>();

    for (const message of smsMessages) {
      const key = buildThreadKey(message);
      const existing = groupedMessages.get(key);
      if (existing) {
        existing.push(message);
      } else {
        groupedMessages.set(key, [message]);
      }
    }

    return [...groupedMessages.entries()]
      .map(([key, messages]) => {
        const sortedMessages = [...messages].sort(
          (left, right) => parseMessageTimestamp(left) - parseMessageTimestamp(right),
        );
        const latestMessage = sortedMessages[sortedMessages.length - 1];
        const peerPhoneNumber = latestMessage.peerPhoneNumber;
        const peerLead = peerPhoneNumber ? findLeadForDialNumber(leads, peerPhoneNumber) : null;
        const leadId = latestMessage.leadId ?? peerLead?.lead.id ?? null;
        const leadName = leadId ? leads.find((lead) => lead.id === leadId)?.fullName ?? peerLead?.lead.fullName ?? null : peerLead?.lead.fullName ?? null;
        const title = buildThreadTitle(peerPhoneNumber, latestMessage.peerName, leadName);
        const unreadCount = sortedMessages.filter(
          (message) =>
            message.direction === "Inbound" &&
            (message.readStatus ?? "").toLowerCase() !== "read",
        ).length;

        return {
          key,
          conversationId: latestMessage.conversationId,
          peerPhoneNumber,
          peerName: latestMessage.peerName,
          leadId,
          leadName,
          title,
          snippet: latestMessage.text || latestMessage.subject || "No message text",
          unreadCount,
          messages: sortedMessages,
          latestMessage,
        };
      })
      .sort((left, right) => parseMessageTimestamp(right.latestMessage) - parseMessageTimestamp(left.latestMessage));
  }, [leads, smsMessages]);

  const composeMatchedLead = useMemo(() => {
    if (!composeToPhoneNumber.trim()) {
      return null;
    }

    return findLeadForDialNumber(leads, composeToPhoneNumber);
  }, [composeToPhoneNumber, leads]);
  const composeLead = composeLeadId
    ? leads.find((lead) => lead.id === composeLeadId) ?? composeMatchedLead?.lead ?? null
    : composeMatchedLead?.lead ?? null;

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredThreads = useMemo(() => {
    if (!normalizedSearch) {
      return threads;
    }

    return threads.filter((thread) => {
      const haystacks = [
        thread.title,
        thread.peerName ?? "",
        thread.peerPhoneNumber ?? "",
        thread.leadName ?? "",
        thread.snippet,
        thread.latestMessage.text,
        thread.latestMessage.subject ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystacks.includes(normalizedSearch);
    });
  }, [normalizedSearch, threads]);

  useEffect(() => {
    if (!filteredThreads.length) {
      setSelectedThreadKey(null);
      return;
    }

    if (!selectedThreadKey || !filteredThreads.some((thread) => thread.key === selectedThreadKey)) {
      setSelectedThreadKey(filteredThreads[0].key);
    }
  }, [filteredThreads, selectedThreadKey]);

  const selectedThread = useMemo(
    () => filteredThreads.find((thread) => thread.key === selectedThreadKey) ?? null,
    [filteredThreads, selectedThreadKey],
  );

  const selectedDraft = selectedThread ? draftByThread[selectedThread.key] ?? "" : "";

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [selectedThread?.key, selectedThread?.messages.length]);

  const updateDraft = (threadKey: string, value: string) => {
    setDraftByThread((current) => ({
      ...current,
      [threadKey]: value,
    }));
  };

  const handleConnectRingCentral = async () => {
    try {
      await connectRingCentral();
      toast.success("RingCentral connected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to connect RingCentral.");
    }
  };

  const findThreadKeyForPhoneNumber = (messages: RingCentralSmsMessage[], phoneNumber: string) => {
    const targetDigits = phoneNumber.replace(/[^\d]/g, "");
    if (!targetDigits) {
      return null;
    }

    const match = messages.find((message) => {
      const peerDigits = (message.peerPhoneNumber ?? "").replace(/[^\d]/g, "");
      if (peerDigits && peerDigits === targetDigits) {
        return true;
      }

      return message.toPhoneNumbers.some((toPhoneNumber) => toPhoneNumber.replace(/[^\d]/g, "") === targetDigits);
    });

    return match ? buildThreadKey(match) : null;
  };

  const sendSmsMessage = async (input: {
    leadId?: string | null;
    toPhoneNumber: string;
    message: string;
    onSuccess?: (messages: RingCentralSmsMessage[]) => void;
  }) => {
    const message = input.message.trim();
    const toPhoneNumber = input.toPhoneNumber.trim();

    if (!toPhoneNumber || !message) {
      return;
    }

    if (!selectedSmsCapableNumber) {
      toast.error("Choose an SMS-capable RingCentral number in Settings first.");
      return;
    }

    try {
      setSending(true);
      const sms = await sendRingCentralSms(
        {
          leadId: input.leadId ?? undefined,
          toPhoneNumber,
          message,
        },
        authToken,
      );
      const refreshedMessages = await loadMessages({ silent: true });
      const threadKey = findThreadKeyForPhoneNumber(refreshedMessages, sms.toPhoneNumber ?? toPhoneNumber);
      if (threadKey) {
        setSelectedThreadKey(threadKey);
      }
      input.onSuccess?.(refreshedMessages);
      toast.success("SMS sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send the SMS.");
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedThread?.peerPhoneNumber) {
      toast.error("No destination phone number is available for this thread.");
      return;
    }

    await sendSmsMessage({
      leadId: selectedThread.leadId,
      toPhoneNumber: selectedThread.peerPhoneNumber,
      message: selectedDraft,
      onSuccess: () => {
        updateDraft(selectedThread.key, "");
      },
    });
  };

  const handleSendNewMessage = async () => {
    await sendSmsMessage({
      leadId: composeLead?.id ?? null,
      toPhoneNumber: composeToPhoneNumber,
      message: composeMessage,
      onSuccess: () => {
        setComposeOpen(false);
        setComposeToPhoneNumber("");
        setComposeMessage("");
        setComposeLeadId(null);
        setSearchParams({});
      },
    });
  };

  const openNewMessageComposer = () => {
    setComposeOpen(true);
    setComposeToPhoneNumber("");
    setComposeMessage("");
    setComposeLeadId(null);
    setSearchParams({});
  };

  const closeNewMessageComposer = () => {
    setComposeOpen(false);
    setComposeToPhoneNumber("");
    setComposeMessage("");
    setComposeLeadId(null);
    setSearchParams({});
  };

  if (!currentUser) {
    return null;
  }

  const hasRingCentralConnection = ringCentralStatus.connected;
  const hasSmsSupport = Boolean(selectedSmsCapableNumber);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="SMS"
        title="RingCentral inbox"
        description="Read inbound and outbound SMS conversations for the selected RingCentral number, then reply or start a new message."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadMessages()}
              disabled={smsLoading || !hasRingCentralConnection}
            >
              <RefreshCcw size={14} />
              {smsLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="secondary"
              onClick={openNewMessageComposer}
              disabled={!hasRingCentralConnection || !hasSmsSupport}
            >
              <Plus size={14} />
              New Message
            </Button>
            {!hasRingCentralConnection ? (
              <Button onClick={() => void handleConnectRingCentral()}>
                Connect RingCentral
              </Button>
            ) : null}
          </div>
        }
      />

      {smsError ? (
        <Card className="border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {smsError}
        </Card>
      ) : null}

      {hasRingCentralConnection && !hasSmsSupport ? (
        <Card className="border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          RingCentral is connected, but the selected number in Settings does not support SMS. Choose an SMS-capable number to send or view texts.
        </Card>
      ) : null}

      {composeOpen && hasRingCentralConnection ? (
        <Card className="border border-sky-200 bg-white/90 p-4 shadow-sm dark:border-sky-900/40 dark:bg-slate-950/80">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                New message
              </p>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                Start a text from the selected RingCentral number
              </h3>
              <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                Messages sent here use the number saved in Settings. If the recipient matches a lead, the thread will stay linked.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedSmsDisplayNumber ? (
                <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                  From {selectedSmsDisplayNumber}
                </Badge>
              ) : null}
              <Button variant="secondary" size="sm" onClick={closeNewMessageComposer}>
                <X size={14} />
                Close
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="space-y-3">
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  To
                </span>
                <input
                  value={composeToPhoneNumber}
                  onChange={(event) => {
                    setComposeToPhoneNumber(event.target.value);
                    setComposeLeadId(null);
                  }}
                  placeholder="Enter phone number"
                  inputMode="tel"
                  className="crm-input"
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  Lead link
                </p>
                <p className="mt-1">
                  {composeLead ? `Linked to ${composeLead.fullName}` : "No lead linked yet"}
                </p>
              </div>
            </div>

            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Message
              </span>
              <textarea
                value={composeMessage}
                onChange={(event) => setComposeMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleSendNewMessage();
                  }
                }}
                placeholder="Type your message..."
                className="crm-input min-h-[140px] resize-none py-3"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Press <span className="font-semibold">Ctrl</span> + <span className="font-semibold">Enter</span> to send.
            </p>
            <Button
              onClick={() => void handleSendNewMessage()}
              disabled={sending || !composeToPhoneNumber.trim() || !composeMessage.trim() || !hasSmsSupport}
            >
              <Send size={14} />
              {sending ? "Sending..." : "Send message"}
            </Button>
          </div>
        </Card>
      ) : null}

      {!hasRingCentralConnection ? (
        <EmptyState
          icon={MessageSquare}
          title="Connect RingCentral to open SMS"
          description="Once RingCentral is connected and an SMS-capable number is selected, this tab will load your SMS history and let you reply or start a new message."
          action={
            <Button onClick={() => void handleConnectRingCentral()}>
              <MessageSquare size={14} />
              Connect RingCentral
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex min-h-[680px] flex-col gap-4 p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="crm-section-label">Conversations</p>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">
                    {threads.length ? `${threads.length} threads` : "No recent SMS threads"}
                  </p>
                </div>
                <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {lastSyncedAt ? `Updated ${formatRelativeAge(lastSyncedAt)}` : "Not synced yet"}
                </Badge>
              </div>

              <label className="relative block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search SMS by name or number"
                  className="crm-input pl-10"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {smsLoading && !smsMessages.length ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="crm-subtle-card h-24 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredThreads.length ? (
                <div className="space-y-2">
                  {filteredThreads.map((thread) => {
                    const isSelected = thread.key === selectedThread?.key;
                    const avatarLabel = thread.title || thread.peerPhoneNumber || "SMS";

                    return (
                      <button
                        key={thread.key}
                        type="button"
                        onClick={() => setSelectedThreadKey(thread.key)}
                        className={cn(
                          "w-full rounded-[16px] border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-sky-300 bg-sky-50 shadow-[0_10px_24px_rgba(31,125,179,0.08)] dark:border-sky-800 dark:bg-sky-950/30"
                            : "border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-800 dark:hover:bg-slate-900/80",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                            {getInitials(avatarLabel)}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-slate-950 dark:text-white">
                                  {thread.title}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {thread.peerPhoneNumber ? formatPhone(thread.peerPhoneNumber) : "No phone number"}
                                </p>
                              </div>
                              {thread.unreadCount > 0 ? (
                                <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                  {thread.unreadCount}
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {thread.latestMessage.direction}
                                </Badge>
                              )}
                            </div>
                            <p className="line-clamp-2 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                              {thread.snippet}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatRelativeAge(thread.latestMessage.lastModifiedTime ?? thread.latestMessage.creationTime)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title={searchValue.trim() ? "No matching conversations" : "No SMS conversations yet"}
                  description={
                    searchValue.trim()
                      ? "Try a different lead name or phone number."
                      : "Send or receive an SMS from the selected RingCentral number to populate this inbox."
                  }
                />
              )}
            </div>
          </Card>

          <Card className="flex min-h-[680px] flex-col overflow-hidden p-0">
            {selectedThread ? (
              <>
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[18px] font-semibold text-slate-950 dark:text-white">
                          {selectedThread.title}
                        </h2>
                        {selectedThread.leadId ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Linked lead
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            Unlinked number
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                        <span>{selectedThread.peerPhoneNumber ? formatPhone(selectedThread.peerPhoneNumber) : "Unknown number"}</span>
                        <span>•</span>
                        <span>{selectedThread.messages.length} messages</span>
                        <span>•</span>
                        <span>Last updated {formatRelativeAge(selectedThread.latestMessage.lastModifiedTime ?? selectedThread.latestMessage.creationTime)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {selectedThread.latestMessage.direction}
                      </Badge>
                      {lastSyncedAt ? (
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                          Synced {formatRelativeAge(lastSyncedAt)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  ref={messageListRef}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(244,248,252,0.9),rgba(255,255,255,0.98))] px-5 py-5 dark:bg-[linear-gradient(180deg,rgba(2,6,23,1),rgba(15,23,42,1))]"
                >
                  {selectedThread.messages.map((message) => {
                    const outbound = message.direction === "Outbound";
                    return (
                      <div
                        key={message.id ?? `${message.conversationId ?? selectedThread.key}-${message.creationTime}`}
                        className={cn("flex", outbound ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[82%] rounded-[22px] px-4 py-3 shadow-sm",
                            outbound
                              ? "bg-sky-600 text-white"
                              : "border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white",
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] opacity-80">
                            <span className="font-semibold">{outbound ? "You" : selectedThread.title}</span>
                            <span>•</span>
                            <span>{formatDateTime(message.creationTime)}</span>
                            {message.messageStatus ? (
                              <>
                                <span>•</span>
                                <span>{message.messageStatus}</span>
                              </>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-6">
                            {message.text || message.subject || "No text available"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          Reply
                        </p>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">
                          {selectedThread.peerPhoneNumber
                            ? "Replies use the selected RingCentral number from Settings and stay attached to this conversation."
                            : "This thread does not have a destination number yet."}
                        </p>
                      </div>
                      {selectedSmsDisplayNumber ? (
                        <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          From {selectedSmsDisplayNumber}
                        </Badge>
                      ) : null}
                    </div>
                    <textarea
                      value={selectedDraft}
                      onChange={(event) => updateDraft(selectedThread.key, event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          event.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      placeholder="Type a reply..."
                      className="crm-input min-h-[126px] resize-none py-3"
                      disabled={!hasSmsSupport || !selectedThread.peerPhoneNumber}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] text-slate-400 dark:text-slate-500">
                        Press <span className="font-semibold">Ctrl</span> + <span className="font-semibold">Enter</span> to send.
                      </p>
                      <Button
                        onClick={() => void handleSendMessage()}
                        disabled={sending || !hasSmsSupport || !selectedThread.peerPhoneNumber || !selectedDraft.trim()}
                      >
                        <Send size={14} />
                        {sending ? "Sending..." : "Send SMS"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[680px] items-center justify-center p-6">
                <EmptyState
                  icon={PhoneCall}
                  title="Select a conversation"
                  description="Choose an SMS thread from the left panel to review messages and send a reply."
                />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
