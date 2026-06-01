import { Download, Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRingCentralRecordingBlob } from "../../services/ringcentral";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

type RingCentralRecordingPlayerMode = "full" | "compact";

interface RingCentralRecordingPlayerProps {
  callLogId: string;
  autoLoad?: boolean;
  className?: string;
  audioClassName?: string;
  mode?: RingCentralRecordingPlayerMode;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error
      ? error.name === "AbortError" || error.message.toLowerCase().includes("aborted")
      : false;
}

function useRingCentralRecording(callLogId: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadPromiseRef = useRef<Promise<string | null> | null>(null);
  const loadVersionRef = useRef(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    loadVersionRef.current += 1;
    loadPromiseRef.current = null;
    setLoading(false);
    setError(null);
    setIsPlaying(false);

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }

    setAudioUrl(null);
  }, [callLogId]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const loadRecording = useCallback(async () => {
    if (audioUrl) {
      return audioUrl;
    }

    if (loadPromiseRef.current) {
      return await loadPromiseRef.current;
    }

    const versionAtStart = loadVersionRef.current;
    const loadPromise = (async () => {
      setLoading(true);
      setError(null);

      try {
        const blob = await fetchRingCentralRecordingBlob(callLogId);
        const nextUrl = URL.createObjectURL(blob);

        if (loadVersionRef.current !== versionAtStart) {
          URL.revokeObjectURL(nextUrl);
          return null;
        }

        setAudioUrl((existing) => {
          if (existing) {
            URL.revokeObjectURL(existing);
          }

          return nextUrl;
        });

        const audio = audioRef.current;
        if (audio) {
          audio.src = nextUrl;
          audio.load();
        }

        return nextUrl;
      } catch (loadError) {
        if (isAbortError(loadError)) {
          return null;
        }

        if (loadVersionRef.current === versionAtStart) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the recording.");
        }

        return null;
      } finally {
        if (loadVersionRef.current === versionAtStart) {
          setLoading(false);
          loadPromiseRef.current = null;
        }
      }
    })();

    loadPromiseRef.current = loadPromise;
    return await loadPromise;
  }, [audioUrl, callLogId]);

  const downloadRecording = useCallback(async () => {
    const nextUrl = await loadRecording();
    if (!nextUrl) {
      return;
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = nextUrl;
    downloadLink.download = `ringcentral-recording-${callLogId}`;
    downloadLink.rel = "noopener noreferrer";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  }, [callLogId, loadRecording]);

  const togglePlayback = useCallback(async () => {
    if (loading) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    const nextUrl = await loadRecording();
    if (!nextUrl) {
      return;
    }

    try {
      audio.src = nextUrl;
      audio.load();
      await audio.play();
      setIsPlaying(true);
    } catch (playError) {
      if (isAbortError(playError)) {
        setIsPlaying(false);
        return;
      }

      setIsPlaying(false);
      setError(playError instanceof Error ? playError.message : "Unable to play the recording.");
    }
  }, [isPlaying, loadRecording, loading]);

  return {
    audioRef,
    audioUrl,
    loading,
    error,
    isPlaying,
    loadRecording,
    downloadRecording,
    togglePlayback,
    setIsPlaying,
  };
}

export function RingCentralRecordingPlayer({
  callLogId,
  autoLoad = false,
  className,
  audioClassName,
  mode = "full",
}: RingCentralRecordingPlayerProps) {
  const {
    audioRef,
    audioUrl,
    loading,
    error,
    isPlaying,
    loadRecording,
    downloadRecording,
    togglePlayback,
    setIsPlaying,
  } = useRingCentralRecording(callLogId);

  useEffect(() => {
    if (mode === "compact" || !autoLoad || audioUrl || loading) {
      return;
    }

    void loadRecording();
  }, [audioUrl, autoLoad, loading, loadRecording, mode]);

  if (mode === "compact") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <audio
          ref={audioRef}
          preload="none"
          src={audioUrl ?? undefined}
          className="sr-only"
          onEnded={() => setIsPlaying(false)}
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              void togglePlayback();
            }}
            aria-label={isPlaying ? "Pause recording" : "Play recording"}
            title={isPlaying ? "Pause recording" : "Play recording"}
            className="h-12 w-12 px-0"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={16} />
            ) : (
              <Play size={16} />
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              void downloadRecording();
            }}
            aria-label="Download recording"
            title="Download recording"
            className="h-12 w-12 px-0"
          >
            <Download size={16} />
          </Button>
        </div>
        {error ? (
          <p className="text-right text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
        ) : null}
      </div>
    );
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
            ref={audioRef}
            onEnded={() => setIsPlaying(false)}
          />
          <Button variant="secondary" size="sm" onClick={() => void downloadRecording()}>
            <Download size={13} />
            Download recording
          </Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" disabled={loading} onClick={() => void loadRecording()}>
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Loading recording...
            </>
          ) : (
            "Load recording"
          )}
        </Button>
      )}
      {error ? <p className="text-[11px] text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
