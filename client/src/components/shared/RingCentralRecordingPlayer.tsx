import { useEffect, useState } from "react";

import { fetchRingCentralRecordingBlob } from "../../services/ringcentral";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

interface RingCentralRecordingPlayerProps {
  callLogId: string;
  autoLoad?: boolean;
  className?: string;
  audioClassName?: string;
}

export function RingCentralRecordingPlayer({
  callLogId,
  autoLoad = false,
  className,
  audioClassName,
}: RingCentralRecordingPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
    setError(null);
    setAudioUrl((existing) => {
      if (existing) {
        URL.revokeObjectURL(existing);
      }

      return null;
    });
  }, [callLogId]);

  useEffect(() => {
    if (!autoLoad || audioUrl || loading) {
      return;
    }

    void loadRecording();
  }, [audioUrl, autoLoad, loading]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function loadRecording() {
    setLoading(true);
    setError(null);

    try {
      const blob = await fetchRingCentralRecordingBlob(callLogId);
      const nextUrl = URL.createObjectURL(blob);
      setAudioUrl((existing) => {
        if (existing) {
          URL.revokeObjectURL(existing);
        }

        return nextUrl;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the recording.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {audioUrl ? (
        <>
          <audio
            controls
            preload="none"
            src={audioUrl}
            className={cn("w-full", audioClassName)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(audioUrl, "_blank", "noopener,noreferrer")}
          >
            Open recording
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void loadRecording()}
        >
          {loading ? "Loading recording..." : "Load recording"}
        </Button>
      )}
      {error ? (
        <p className="text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
