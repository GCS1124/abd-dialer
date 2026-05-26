import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Radio } from "lucide-react";

import type { Campaign } from "../../types";
import { cn } from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";

interface CampaignQueueChooserModalProps {
  open: boolean;
  campaigns: Campaign[];
  selectedCampaignKey: string | null;
  onSelectCampaign: (campaignKey: string) => void;
}

export function CampaignQueueChooserModal({
  open,
  campaigns,
  selectedCampaignKey,
  onSelectCampaign,
}: CampaignQueueChooserModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-queue-chooser-title"
        className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            Campaign queue
          </p>
          <h3
            id="campaign-queue-chooser-title"
            className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white"
          >
            Choose which campaign queue to load
          </h3>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500 dark:text-slate-400">
            Select one active campaign. The chosen queue will load in Dialer and every other active
            campaign remains paused in the dialer path until you switch again.
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          {campaigns.map((campaign) => {
            const isSelected = campaign.sourceKey === selectedCampaignKey;

            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => onSelectCampaign(campaign.sourceKey)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-[20px] border px-4 py-4 text-left transition",
                  isSelected
                    ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(8,145,178,0.06)] dark:border-cyan-500/40 dark:bg-cyan-950/20"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700 dark:hover:bg-slate-900",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      isSelected
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-200",
                    )}
                  >
                    {isSelected ? <CheckCircle2 size={18} /> : <Radio size={18} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[16px] font-semibold text-slate-900 dark:text-white">
                        {campaign.name}
                      </p>
                      <Badge
                        className={cn(
                          "px-2 py-1 text-[10px] font-medium",
                          campaign.allowAutoDial
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        )}
                      >
                        {campaign.allowAutoDial ? "Auto-dial on" : "Auto-dial off"}
                      </Badge>
                      <Badge className="bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {campaign.leadCount} leads
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                      Assigned to {campaign.assignedUserName || "Unassigned"}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                  Load queue
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
            The dialer will stay anchored to the selected campaign until you change it from this
            chooser or Campaigns.
          </p>
          <Button type="button" variant="secondary" size="sm" disabled>
            <span className="text-[12px]">Selection required</span>
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
