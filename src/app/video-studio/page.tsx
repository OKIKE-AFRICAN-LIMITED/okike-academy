"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VideoJobItem } from "@/lib/db";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";

export default function VideoStudioPage() {
  const [jobs, setJobs] = useState<VideoJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ready" | "active" | "pending">(
    "all"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadJobs(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/worker/jobs", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setJobs(data.jobs || []);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  const hasActive = jobs.some(
    (j) => j.videoStatus === "queued" || j.videoStatus === "processing"
  );

  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => loadJobs(true), 8000);
    return () => clearInterval(t);
  }, [hasActive]);

  async function queueLesson(lessonId: string) {
    setBusyId(lessonId);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoStatus: "queued", videoError: null }),
      });
      if (res.ok) {
        setToast(
          "Lesson queued — Colab will render and publish it automatically."
        );
        await loadJobs(true);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function resetStuckLesson(lessonId: string) {
    setBusyId(lessonId);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoStatus: "pending", videoError: null }),
      });
      if (res.ok) {
        setToast("Reset stuck job — click Generate Video to render again.");
        await loadJobs(true);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function queueAllPending() {
    const pending = jobs.filter(
      (j) => j.videoStatus === "pending" || j.videoStatus === "failed"
    );
    if (pending.length === 0) return;
    setBusyId("all");
    try {
      await Promise.all(
        pending.map((j) =>
          fetch(`/api/lessons/${j.lessonId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoStatus: "queued", videoError: null }),
          })
        )
      );
      setToast(
        `Queued ${pending.length} lesson(s) for automatic video rendering.`
      );
      await loadJobs(true);
    } finally {
      setBusyId(null);
    }
  }

  async function quickUploadMp4(lessonId: string, file: File) {
    setBusyId(lessonId);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch(`/api/lessons/${lessonId}/video`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setToast("Video uploaded and ready to play!");
        await loadJobs(true);
      }
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    total: jobs.length,
    ready: jobs.filter((j) => j.videoStatus === "ready").length,
    processing: jobs.filter((j) => j.videoStatus === "processing").length,
    queued: jobs.filter((j) => j.videoStatus === "queued").length,
    pending: jobs.filter(
      (j) => j.videoStatus === "pending" || j.videoStatus === "failed"
    ).length,
  };

  const filteredJobs = jobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "ready") return j.videoStatus === "ready";
    if (filter === "active")
      return j.videoStatus === "queued" || j.videoStatus === "processing";
    return j.videoStatus === "pending" || j.videoStatus === "failed";
  });

  return (
    <main className="flex-1 bg-[#f7f7f2] py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#d9d9d4]">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-1">
              OKIKE ACADEMY · VIDEO QUEUE
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#0e0e0e]">
              Video Studio
            </h1>
            <p className="text-sm text-[#595954] mt-1">
              Track automatic lesson video rendering in real time.{" "}
              {hasActive && (
                <span className="font-mono text-xs text-[#0e0e0e] bg-[#e3ee32] px-2 py-0.5 ml-1 font-bold">
                  LIVE SYNC · 8S
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadJobs()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-[#d9d9d4] hover:border-[#0e0e0e] bg-[#ffffff] text-xs font-semibold text-[#0e0e0e]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              type="button"
              disabled={busyId === "all" || counts.pending === 0}
              onClick={queueAllPending}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-50 border border-[#0e0e0e] text-[#0e0e0e] text-xs font-bold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate All Remaining ({counts.pending})
            </button>
          </div>
        </div>

        {/* Architectural 4-Column Hairline Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#d9d9d4] bg-[#ffffff] divide-y sm:divide-y-0 sm:divide-x divide-[#d9d9d4]">
          <div className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954]">
              01 / Ready
            </div>
            <div className="text-3xl font-extrabold text-[#0e0e0e] mt-1">
              {counts.ready}
            </div>
          </div>
          <div className="p-5 bg-[#f1ecfa]/50">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954]">
              02 / Rendering
            </div>
            <div className="text-3xl font-extrabold text-[#0e0e0e] mt-1">
              {counts.processing}
            </div>
          </div>
          <div className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954]">
              03 / In Queue
            </div>
            <div className="text-3xl font-extrabold text-[#0e0e0e] mt-1">
              {counts.queued}
            </div>
          </div>
          <div className="p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954]">
              04 / Pending
            </div>
            <div className="text-3xl font-extrabold text-[#595954] mt-1">
              {counts.pending}
            </div>
          </div>
        </div>

        {toast && (
          <div className="px-4 py-3 bg-[#e3ee32] border border-[#0e0e0e] text-[#0e0e0e] text-xs font-bold flex items-center justify-between">
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="underline font-mono uppercase"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", `All (${counts.total})`],
              ["ready", `Ready (${counts.ready})`],
              [
                "active",
                `Rendering / Queued (${counts.processing + counts.queued})`,
              ],
              ["pending", `Not Started (${counts.pending})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === key
                  ? "bg-[#0e0e0e] text-[#e3ee32] border-[#0e0e0e]"
                  : "bg-[#ffffff] text-[#0e0e0e] border-[#d9d9d4] hover:border-[#0e0e0e]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Lessons List */}
        <div className="bg-[#ffffff] border border-[#d9d9d4]">
          {loading ? (
            <div className="p-12 text-center text-[#595954] flex items-center justify-center gap-2 text-sm font-mono">
              <Loader2 className="w-4 h-4 animate-spin" /> LOADING QUEUE...
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-12 text-center text-[#595954] text-sm">
              No lessons in this category.
            </div>
          ) : (
            <div className="divide-y divide-[#d9d9d4]">
              {filteredJobs.map((job) => (
                <div
                  key={job.lessonId}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f7f7f2]"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-[#595954] mb-0.5">
                      {job.courseTitle}
                    </div>
                    <Link
                      href={`/courses/${job.courseId}`}
                      className="font-bold text-sm text-[#0e0e0e] hover:underline inline-flex items-center gap-1"
                    >
                      {job.lessonTitle}
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#595954]" />
                    </Link>
                    {job.videoError && (
                      <p className="text-xs text-[#b31f1f] mt-1">
                        {job.videoError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {job.videoStatus === "ready" ? (
                      <Link
                        href={`/courses/${job.courseId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#0e0e0e] bg-[#e3ee32] text-[#0e0e0e] text-xs font-bold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Watch Video
                      </Link>
                    ) : job.videoStatus === "processing" ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#c4b0f0] bg-[#f1ecfa] text-[#0e0e0e] text-xs font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                          Rendering...
                        </span>
                        <button
                          type="button"
                          disabled={busyId === job.lessonId}
                          onClick={() => resetStuckLesson(job.lessonId)}
                          title="Reset if Colab disconnected mid-render"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#d9d9d4] hover:border-[#b31f1f] hover:text-[#b31f1f] bg-[#ffffff] text-[#595954] text-xs font-semibold"
                        >
                          Reset
                        </button>
                      </>
                    ) : job.videoStatus === "queued" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#80807a] bg-[#f7f7f2] text-[#0e0e0e] text-xs font-semibold">
                        <Clock className="w-3.5 h-3.5" /> In Queue
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === job.lessonId}
                        onClick={() => queueLesson(job.lessonId)}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#0e0e0e] text-[#e3ee32] text-xs font-bold"
                      >
                        <PlayCircle className="w-3.5 h-3.5" /> Generate Video
                      </button>
                    )}

                    <label className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#d9d9d4] hover:border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e] text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" /> Upload MP4
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) quickUploadMp4(job.lessonId, file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
