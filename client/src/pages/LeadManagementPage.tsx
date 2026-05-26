import {
  ArrowRight,
  FileUp,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { ImportTemplateCard } from "../components/import/ImportTemplateCard";
import { useAppState } from "../hooks/useAppState";
import { parseLeadFile } from "../lib/csv";
import { formatDateTime, getLeadStatusTone, getPriorityTone } from "../lib/utils";
import type { Campaign, LeadStatus } from "../types";

const bulkStatuses: LeadStatus[] = [
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
  "closed_won",
  "closed_lost",
  "invalid",
];

type LeadViewFilter = "all" | "hot" | "untouched" | "callbacks" | "duplicates" | "stale";
type CampaignStatusFilter = "all" | "active" | "inactive";

interface CampaignEditorState {
  name: string;
  assignedUserId: string;
  isActive: boolean;
  allowAutoDial: boolean;
}

function normalizeCampaignSourceKey(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized || "uncategorized";
}

function buildDefaultCampaignSourceKey(name: string) {
  return normalizeCampaignSourceKey(name);
}

function leadSearchText(lead: {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  altPhone: string;
  source: string;
  assignedAgentName: string;
}) {
  return [
    lead.fullName,
    lead.company,
    lead.email,
    lead.phone,
    lead.altPhone,
    lead.source,
    lead.assignedAgentName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function LeadManagementPage() {
  const {
    currentUser,
    leads,
    users,
    campaigns,
    analytics,
    uploadLeads,
    assignLead,
    bulkUpdateLeadStatus,
    deleteLeads,
    createCampaign,
    updateCampaign,
    assignCampaign,
    deleteCampaign,
    workspaceLoading,
  } = useAppState();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [viewFilter, setViewFilter] = useState<LeadViewFilter>("all");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<CampaignStatusFilter>("all");
  const [selectedCampaignKey, setSelectedCampaignKey] = useState<string | "all">("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("follow_up");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadTone, setUploadTone] = useState<"success" | "error">("success");
  const [isBusy, setIsBusy] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignSourceKey, setNewCampaignSourceKey] = useState("");
  const [newCampaignAssignedUserId, setNewCampaignAssignedUserId] = useState("");
  const [newCampaignAllowAutoDial, setNewCampaignAllowAutoDial] = useState(true);
  const [newCampaignIsActive, setNewCampaignIsActive] = useState(true);
  const [campaignEditor, setCampaignEditor] = useState<CampaignEditorState>({
    name: "",
    assignedUserId: "",
    isActive: true,
    allowAutoDial: true,
  });

  const agents = users.filter((user) => user.role === "agent");
  const duplicateLeadIds = new Set(analytics.duplicateInsights.flatMap((group) => group.leadIds));
  const isAdmin = currentUser?.role === "admin";

  const selectedCampaign =
    selectedCampaignKey === "all"
      ? null
      : campaigns.find((campaign) => campaign.sourceKey === selectedCampaignKey) ?? null;

  const campaignLeads = useMemo(() => {
    if (selectedCampaignKey === "all") {
      return leads;
    }

    return leads.filter(
      (lead) => normalizeCampaignSourceKey(lead.source) === selectedCampaignKey,
    );
  }, [leads, selectedCampaignKey]);

  const filteredLeads = useMemo(() => {
    const query = search.toLowerCase();

    return campaignLeads.filter((lead) => {
      const matchesSearch = leadSearchText(lead).includes(query);
      const matchesStatus = statusFilter === "all" ? true : lead.status === statusFilter;
      const freshnessHours = Math.floor(
        (Date.now() - new Date(lead.lastContacted || lead.updatedAt || lead.createdAt).getTime()) /
          (1000 * 60 * 60),
      );
      const matchesView =
        viewFilter === "all"
          ? true
          : viewFilter === "hot"
            ? lead.priority === "Urgent" || lead.priority === "High" || lead.leadScore >= 75
            : viewFilter === "untouched"
              ? lead.callHistory.length === 0 && lead.notesHistory.length === 0 && !lead.lastContacted
              : viewFilter === "callbacks"
                ? Boolean(lead.callbackTime)
                : viewFilter === "duplicates"
                  ? duplicateLeadIds.has(lead.id)
                  : freshnessHours >= 48;

      return matchesSearch && matchesStatus && matchesView;
    });
  }, [campaignLeads, duplicateLeadIds, search, statusFilter, viewFilter]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      if (campaignStatusFilter === "active") {
        return campaign.isActive;
      }
      if (campaignStatusFilter === "inactive") {
        return !campaign.isActive;
      }

      return true;
    });
  }, [campaignStatusFilter, campaigns]);

  const selectedCampaignMetrics = useMemo(() => {
    const callbacks = campaignLeads.filter((lead) => Boolean(lead.callbackTime)).length;
    const untouched = campaignLeads.filter(
      (lead) => lead.callHistory.length === 0 && lead.notesHistory.length === 0 && !lead.lastContacted,
    ).length;
    const stale = campaignLeads.filter((lead) => {
      const freshnessHours = Math.floor(
        (Date.now() - new Date(lead.lastContacted || lead.updatedAt || lead.createdAt).getTime()) /
          (1000 * 60 * 60),
      );
      return freshnessHours >= 48;
    }).length;

    return {
      total: campaignLeads.length,
      callbacks,
      untouched,
      stale,
    };
  }, [campaignLeads]);

  useEffect(() => {
    if (selectedCampaignKey === "all") {
      setCampaignEditor({
        name: "",
        assignedUserId: "",
        isActive: true,
        allowAutoDial: true,
      });
      return;
    }

    if (!selectedCampaign) {
      return;
    }

    setCampaignEditor({
      name: selectedCampaign.name,
      assignedUserId: selectedCampaign.assignedUserId ?? "",
      isActive: selectedCampaign.isActive,
      allowAutoDial: selectedCampaign.allowAutoDial,
    });
  }, [selectedCampaign, selectedCampaignKey]);

  useEffect(() => {
    if (selectedCampaignKey !== "all" && !campaigns.some((campaign) => campaign.sourceKey === selectedCampaignKey)) {
      setSelectedCampaignKey("all");
    }
  }, [campaigns, selectedCampaignKey]);

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((existing) =>
      existing.includes(leadId)
        ? existing.filter((id) => id !== leadId)
        : [...existing, leadId],
    );
  };

  const handleSpreadsheetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    try {
      const parsed = await parseLeadFile(file);
      const result = await uploadLeads(parsed.rows);
      setUploadTone("success");
      setUploadMessage(
        `Imported ${result.added} leads. ${result.duplicates} duplicates skipped. ${parsed.invalidRows + result.invalidRows} invalid rows ignored.`,
      );
      toast.success("Lead import completed.");
    } catch (error) {
      setUploadTone("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Unable to import that spreadsheet.",
      );
      toast.error(
        error instanceof Error ? error.message : "Unable to import that spreadsheet.",
      );
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const handleCreateCampaign = async () => {
    const name = newCampaignName.trim() || newCampaignSourceKey.trim();
    const sourceKey = buildDefaultCampaignSourceKey(newCampaignSourceKey || newCampaignName);

    if (!name) {
      toast.error("Campaign name is required.");
      return;
    }

    setIsBusy(true);
    try {
      await createCampaign({
        name,
        sourceKey,
        assignedUserId: newCampaignAssignedUserId || null,
        isActive: isAdmin ? newCampaignIsActive : undefined,
        allowAutoDial: newCampaignAllowAutoDial,
      });
      setNewCampaignName("");
      setNewCampaignSourceKey("");
      setNewCampaignAssignedUserId("");
      setNewCampaignAllowAutoDial(true);
      setNewCampaignIsActive(true);
      toast.success("Campaign created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the campaign.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveCampaign = async () => {
    if (!selectedCampaign) {
      return;
    }

    const nextName = campaignEditor.name.trim() || selectedCampaign.name;
    const nextAssignedUserId = campaignEditor.assignedUserId || null;
    const isOwnerChanged = nextAssignedUserId !== selectedCampaign.assignedUserId;
    const isNameChanged = nextName !== selectedCampaign.name;
    const isDialChanged = campaignEditor.allowAutoDial !== selectedCampaign.allowAutoDial;
    const isActiveChanged = isAdmin && campaignEditor.isActive !== selectedCampaign.isActive;

    setIsBusy(true);
    try {
      if (isNameChanged || isDialChanged || isActiveChanged) {
        await updateCampaign(selectedCampaign.id, {
          name: isNameChanged ? nextName : undefined,
          isActive: isActiveChanged ? campaignEditor.isActive : undefined,
          allowAutoDial: isDialChanged ? campaignEditor.allowAutoDial : undefined,
        });
      }

      if (isOwnerChanged) {
        await assignCampaign(selectedCampaign.id, nextAssignedUserId);
      }

      toast.success("Campaign updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the campaign.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign) {
      return;
    }

    setIsBusy(true);
    try {
      await deleteCampaign(selectedCampaign.id);
      setSelectedCampaignKey("all");
      toast.success("Campaign deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete the campaign.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin Controls"
        title="Campaign dashboard"
        description="Upload leads, manage queue ownership, and keep each campaign queue on one clear track."
        actions={
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#3b91c3] px-4 py-3 text-sm font-medium text-white dark:bg-white dark:text-slate-900">
              <FileUp size={16} />
              {isBusy ? "Uploading..." : "Upload CSV / Excel"}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleSpreadsheetUpload}
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => setSelectedCampaignKey("all")}
            >
              <Plus size={16} />
              New campaign
            </Button>
          </>
        }
      />

      {uploadMessage ? (
        <AlertBanner
          title={uploadTone === "success" ? "Import status" : "Import failed"}
          description={uploadMessage}
          tone={uploadTone === "success" ? "success" : "error"}
        />
      ) : null}

      <div className="grid gap-3 xl:grid-cols-4">
        <MetricCard
          label="Campaign queues"
          value={campaigns.length}
          hint="All campaign groups tracked in the workspace."
          icon={Layers3}
        />
        <MetricCard
          label="Active queues"
          value={campaigns.filter((campaign) => campaign.isActive).length}
          hint="Campaign queues currently open for dialing."
          icon={ShieldCheck}
        />
        <MetricCard
          label="Assigned queues"
          value={campaigns.filter((campaign) => Boolean(campaign.assignedUserId)).length}
          hint="Queues already assigned to an owner."
          icon={UserRoundPlus}
        />
        <MetricCard
          label={selectedCampaign ? `${selectedCampaign.name} leads` : "All queue leads"}
          value={selectedCampaignMetrics.total}
          hint="Leads currently visible in the selected queue."
          icon={Search}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-semibold text-slate-950 dark:text-white">
                Lead upload
              </h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                Keep the import layout aligned with the dialer workbook so the queue stays clean.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <FileUp size={14} />
              Upload spreadsheet
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleSpreadsheetUpload}
              />
            </label>
          </div>

          <ImportTemplateCard compact className="shadow-none" />
        </Card>

        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-semibold text-slate-950 dark:text-white">
                {selectedCampaign ? "Edit campaign" : "Create campaign"}
              </h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                Assign a queue owner, keep auto-dial settings attached, and toggle active queues for admins only.
              </p>
            </div>
            {selectedCampaign ? (
              <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                {selectedCampaign.sourceKey}
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                New queue
              </Badge>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                Campaign name
              </span>
              <input
                value={selectedCampaign ? campaignEditor.name : newCampaignName}
                onChange={(event) =>
                  selectedCampaign
                    ? setCampaignEditor((current) => ({ ...current, name: event.target.value }))
                    : setNewCampaignName(event.target.value)
                }
                placeholder="Q2 plumbing prospects"
                className="crm-input py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                Source key
              </span>
              <input
                value={
                  selectedCampaign
                    ? selectedCampaign.sourceKey
                    : newCampaignSourceKey
                }
                onChange={(event) => setNewCampaignSourceKey(event.target.value)}
                placeholder="q2-plumbing-prospects"
                className="crm-input py-3"
                readOnly={Boolean(selectedCampaign)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                Queue owner
              </span>
              <select
                value={selectedCampaign ? campaignEditor.assignedUserId : newCampaignAssignedUserId}
                onChange={(event) =>
                  selectedCampaign
                    ? setCampaignEditor((current) => ({
                        ...current,
                        assignedUserId: event.target.value,
                      }))
                    : setNewCampaignAssignedUserId(event.target.value)
                }
                className="crm-input py-3"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.role}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                Dialing behavior
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    selectedCampaign
                      ? setCampaignEditor((current) => ({
                          ...current,
                          allowAutoDial: !current.allowAutoDial,
                        }))
                      : setNewCampaignAllowAutoDial((current) => !current)
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {selectedCampaign ? campaignEditor.allowAutoDial : newCampaignAllowAutoDial ? "Auto-dial on" : "Auto-dial off"}
                  {selectedCampaign
                    ? campaignEditor.allowAutoDial
                      ? <ToggleRight size={16} />
                      : <ToggleLeft size={16} />
                    : newCampaignAllowAutoDial
                      ? <ToggleRight size={16} />
                      : <ToggleLeft size={16} />}
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() =>
                      selectedCampaign
                        ? setCampaignEditor((current) => ({
                            ...current,
                            isActive: !current.isActive,
                          }))
                        : setNewCampaignIsActive((current) => !current)
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {selectedCampaign ? (campaignEditor.isActive ? "Active" : "Paused") : newCampaignIsActive ? "Active" : "Paused"}
                    {selectedCampaign
                      ? campaignEditor.isActive
                        ? <ToggleRight size={16} />
                        : <ToggleLeft size={16} />
                      : newCampaignIsActive
                        ? <ToggleRight size={16} />
                        : <ToggleLeft size={16} />}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedCampaign ? (
              <>
                <Button onClick={handleSaveCampaign} disabled={isBusy}>
                  <ArrowRight size={16} />
                  Save changes
                </Button>
                <Button variant="danger" onClick={handleDeleteCampaign} disabled={isBusy}>
                  <Trash2 size={16} />
                  Delete queue
                </Button>
              </>
            ) : (
              <Button onClick={handleCreateCampaign} disabled={isBusy}>
                <Plus size={16} />
                Create campaign
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-slate-950 dark:text-white">
              Campaign queues
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              Each campaign acts like its own queue. Pick one to view the leads beneath it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All queues"],
              ["active", "Active"],
              ["inactive", "Paused"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCampaignStatusFilter(value)}
                className={
                  value === campaignStatusFilter
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-slate-900"
                    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredCampaigns.length ? (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filteredCampaigns.map((campaign) => {
              const activeTone = campaign.isActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
              const isSelected = selectedCampaignKey === campaign.sourceKey;

              return (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedCampaignKey(campaign.sourceKey)}
                  className={
                    isSelected
                      ? "rounded-[20px] border border-sky-300 bg-sky-50 p-4 text-left shadow-[0_8px_24px_rgba(59,130,246,0.08)] dark:border-sky-700/60 dark:bg-sky-950/20"
                      : "rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900/80"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[16px] font-semibold text-slate-950 dark:text-white">
                          {campaign.name}
                        </h3>
                        <Badge className={activeTone}>
                          {campaign.isActive ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-slate-500 dark:text-slate-400">
                        {campaign.sourceKey}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {campaign.leadCount} leads
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {campaign.callbackCount} callbacks
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {campaign.untouchedCount} untouched
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {campaign.assignedUserName}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      Last lead: {formatDateTime(campaign.recentLeadAt) || "No lead activity yet"}
                    </span>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={async (event) => {
                          event.stopPropagation();
                          try {
                            await updateCampaign(campaign.id, {
                              isActive: !campaign.isActive,
                            });
                            toast.success(
                              campaign.isActive ? "Campaign paused." : "Campaign activated.",
                            );
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Unable to update queue state.",
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {campaign.isActive ? "Pause" : "Activate"}
                        {campaign.isActive ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                      </button>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Layers3}
            title="No campaign queues found"
            description="Use the editor above to create a queue or switch to another queue filter."
          />
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-slate-950 dark:text-white">
              {selectedCampaign ? `${selectedCampaign.name} leads` : "All campaign leads"}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              Search by lead name or number, then update status, assignment, or queue membership from one table.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["hot", "Hot"],
              ["untouched", "Untouched"],
              ["callbacks", "Callbacks"],
              ["duplicates", "Duplicates"],
              ["stale", "Stale"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewFilter(value as LeadViewFilter)}
                className={
                  value === viewFilter
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-slate-900"
                    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.7fr_0.7fr_0.8fr_auto_auto]">
          <label className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, email, or number"
              className="crm-input py-3 pl-11"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | LeadStatus)}
            className="crm-input"
          >
            <option value="all">All statuses</option>
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}
            className="crm-input"
          >
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                Bulk to {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await bulkUpdateLeadStatus(selectedLeadIds, bulkStatus);
                toast.success("Lead statuses updated.");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Unable to update the selected leads.",
                );
              }
            }}
            disabled={!selectedLeadIds.length || isBusy}
          >
            Update selected
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setSelectedLeadIds(
                selectedLeadIds.length === filteredLeads.length
                  ? []
                  : filteredLeads.map((lead) => lead.id),
              )
            }
          >
            {selectedLeadIds.length === filteredLeads.length ? "Clear" : "Select all"}
          </Button>
        </div>
      </Card>

      {filteredLeads.length ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={
                        filteredLeads.length > 0 &&
                        selectedLeadIds.length === filteredLeads.length
                      }
                      onChange={() =>
                        setSelectedLeadIds(
                          selectedLeadIds.length === filteredLeads.length
                            ? []
                            : filteredLeads.map((lead) => lead.id),
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-4">Lead</th>
                  <th className="px-4 py-4">Interest</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Priority</th>
                  <th className="px-4 py-4">Assigned Agent</th>
                  <th className="px-4 py-4">Last Contacted</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-t border-slate-200/80 dark:border-slate-800"
                  >
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {lead.fullName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {duplicateLeadIds.has(lead.id) ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            duplicate
                          </Badge>
                        ) : null}
                        {lead.callbackTime ? (
                          <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                            callback set
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {lead.company} - {lead.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {lead.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        Next step:{" "}
                        {lead.callbackTime
                          ? `Callback on ${formatDateTime(lead.callbackTime)}`
                          : lead.callHistory[0]?.outcomeSummary || "No next action captured"}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top text-slate-600 dark:text-slate-300">
                      <p>{lead.interest}</p>
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        Score {lead.leadScore}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge className={getLeadStatusTone(lead.status)}>
                        {lead.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-3">
                        <UserRoundPlus size={16} className="text-slate-400" />
                        <select
                          value={lead.assignedAgentId}
                          onChange={async (event) => {
                            try {
                              await assignLead(lead.id, event.target.value);
                              toast.success("Lead assignment updated.");
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to assign this lead.",
                              );
                            }
                          }}
                          className="rounded-md border border-slate-200 bg-white px-4 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-slate-500 dark:text-slate-400">
                      {formatDateTime(lead.lastContacted)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Search}
          title={leads.length ? "No leads match this view" : workspaceLoading ? "Loading leads" : "No leads in the workspace"}
          description={
            leads.length
              ? "Adjust the filters or clear the search to see more lead records."
              : workspaceLoading
                ? "The CRM is loading lead records."
                : "Import a CSV or Excel file to start assigning leads."
          }
          action={
            leads.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setViewFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
