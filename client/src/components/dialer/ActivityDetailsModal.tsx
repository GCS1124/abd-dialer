import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { EmployeeActivityCalendarDay } from "../../lib/employeeActivityCalendar.ts";
import {
  cn,
  formatDuration,
  formatPhone,
  getCallStatusTone,
  getDispositionTone,
} from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { TimecardSummaryGrid } from "./TimecardSummaryGrid";

interface ActivityDetailsModalProps {
  open: boolean;
  employeeName: string;
  day: EmployeeActivityCalendarDay | null;
  monthLabel: string;
  filterLabel: string;
  onClose: () => void;
}

function getFocusableElements(container: HTMLDivElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

export function ActivityDetailsModal({
  open,
  employeeName,
  day,
  monthLabel,
  filterLabel,
  onClose,
}: ActivityDetailsModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(containerRef.current);
      if (!focusable.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const headerLabel = useMemo(() => {
    if (!day) {
      return monthLabel;
    }

    return new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${day.date}T00:00:00`));
  }, [day, monthLabel]);

  if (!open || !day) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-5 sm:py-6">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-calendar-modal-title"
        className={cn(
          "flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.24)] dark:border-slate-800 dark:bg-slate-950",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Activity details
            </p>
            <h3
              id="employee-calendar-modal-title"
              className="mt-2 truncate text-[20px] font-semibold text-slate-900 dark:text-white"
            >
              {headerLabel}
            </h3>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              {employeeName} · {filterLabel}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close activity details"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
          <TimecardSummaryGrid summary={day.timecardSummary} variant="day" />
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {day.totalCalls} total
            </Badge>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              {day.connectedCalls} connected
            </Badge>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              {day.interested} interested
            </Badge>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              {day.notInterested} not interested
            </Badge>
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              {day.disposedCompleted} completed
            </Badge>
            <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {day.failed} failed
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Avg {day.averageDuration}
            </Badge>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {day.records.length ? (
            <div className="space-y-3">
              {day.records.map((record) => (
                <div
                  key={`${day.date}-${record.time}-${record.customerName}-${record.phone}`}
                  className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                        {record.customerName}
                      </p>
                      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                        {formatPhone(record.phone)}
                      </p>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                        {record.time}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("px-2.5 py-1 text-[10px] font-medium", getCallStatusTone(record.callStatus))}>
                        {record.callStatus.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-medium",
                          getDispositionTone(record.disposition),
                        )}
                      >
                        {record.disposition}
                      </Badge>
                      <Badge className="bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {formatDuration(record.durationSeconds)}
                      </Badge>
                    </div>
                  </div>

                  {record.notes ? (
                    <p className="mt-3 rounded-[14px] bg-white px-3 py-2 text-[12px] leading-6 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                      {record.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-[14px] font-medium text-slate-700 dark:text-slate-200">
                No records match this view.
              </p>
              <p className="mt-2 text-[12px] leading-6 text-slate-500 dark:text-slate-400">
                This date has no records for the current filter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
