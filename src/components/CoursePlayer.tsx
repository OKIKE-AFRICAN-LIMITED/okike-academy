"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Course, Lesson, SmeReview, VideoStatus } from "@/lib/types";
import { InstitutionalCompliancePanel } from "@/components/InstitutionalCompliancePanel";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Download,
  Film,
  HelpCircle,
  Link as LinkIcon,
  Loader2,
  Menu,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";

interface CoursePlayerProps {
  initialCourse: Course;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
  } catch {
    return null;
  }
  return null;
}

function StatusPill({ status }: { status: VideoStatus }) {
  const map: Record<VideoStatus, { cls: string; label: string }> = {
    ready: {
      cls: "bg-[#e3ee32] text-[#0e0e0e] border-[#0e0e0e]",
      label: "Video Ready",
    },
    processing: {
      cls: "bg-[#f1ecfa] text-[#0e0e0e] border-[#c4b0f0]",
      label: "Rendering Video...",
    },
    queued: {
      cls: "bg-[#f7f7f2] text-[#0e0e0e] border-[#80807a]",
      label: "In Video Queue",
    },
    failed: {
      cls: "bg-[#fff5f5] text-[#b31f1f] border-[#b31f1f]",
      label: "Retry Video",
    },
    pending: {
      cls: "bg-[#f7f7f2] text-[#595954] border-[#d9d9d4]",
      label: "No Video Yet",
    },
  };
  const item = map[status];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border ${item.cls}`}
    >
      {item.label}
    </span>
  );
}

export function CoursePlayer({ initialCourse }: CoursePlayerProps) {
  const [course, setCourse] = useState<Course>(initialCourse);
  const allLessons = useMemo(
    () =>
      course.modules.flatMap((mod) =>
        mod.lessons.map((lesson) => ({ ...lesson, moduleTitle: mod.title }))
      ),
    [course]
  );

  const [activeLessonId, setActiveLessonId] = useState<string>(
    allLessons[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<"lesson" | "quiz" | "tools" | "qa">(
    "lesson"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [copiedCode, setCopiedCode] = useState(false);
  const [editableCode, setEditableCode] = useState<Record<string, string>>({});
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [quizSelections, setQuizSelections] = useState<
    Record<string, Record<number, number>>
  >({});

  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const [generatingModuleId, setGeneratingModuleId] = useState<string | null>(
    null
  );
  const [moduleGenError, setModuleGenError] = useState<string | null>(null);

  const activeIndex = allLessons.findIndex((l) => l.id === activeLessonId);
  const activeLesson = allLessons[activeIndex] || allLessons[0];
  const prevLesson = activeIndex > 0 ? allLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < allLessons.length - 1
      ? allLessons[activeIndex + 1]
      : null;

  const completedCount = allLessons.filter((l) => l.completed).length;
  const readyVideosCount = allLessons.filter(
    (l) => l.videoStatus === "ready"
  ).length;
  const pendingVideosCount = allLessons.filter(
    (l) => l.videoStatus === "pending" || l.videoStatus === "failed"
  ).length;
  const hasActiveRender = allLessons.some(
    (l) => l.videoStatus === "queued" || l.videoStatus === "processing"
  );

  const progressPct =
    allLessons.length > 0
      ? Math.round((completedCount / allLessons.length) * 100)
      : 0;

  useEffect(() => {
    if (!hasActiveRender) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/courses/${course.id}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.course) setCourse(data.course);
        }
      } catch {
        // ignore transient poll failures
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [hasActiveRender, course.id]);

  function patchLessonInState(updated: Lesson) {
    setCourse((prev) => ({
      ...prev,
      modules: prev.modules.map((mod) => ({
        ...mod,
        lessons: mod.lessons.map((l) => (l.id === updated.id ? updated : l)),
      })),
    }));
  }

  async function toggleCompleted(lesson: Lesson) {
    const nextVal = !lesson.completed;
    patchLessonInState({ ...lesson, completed: nextVal });
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: nextVal }),
    });
  }

  async function handleQueueVideo(lesson: Lesson) {
    setQueueing(true);
    setVideoFeedback(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoStatus: "queued", videoError: null }),
      });
      const data = await res.json();
      if (res.ok && data.lesson) {
        patchLessonInState(data.lesson);
      }
    } finally {
      setQueueing(false);
    }
  }

  async function handleGenerateModule(
    moduleId: string,
    autoQueueVideos = true
  ) {
    setGeneratingModuleId(moduleId);
    setModuleGenError(null);
    try {
      const res = await fetch(`/api/modules/${moduleId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoQueueVideos }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate module");
      }
      if (data.course) {
        setCourse(data.course);
      }
    } catch (err) {
      setModuleGenError(
        err instanceof Error ? err.message : "Module generation failed"
      );
    } finally {
      setGeneratingModuleId(null);
    }
  }

  async function handleQueueAllCourseVideos() {
    setQueueingAll(true);
    try {
      await fetch(`/api/courses/${course.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue-videos",
          videoModel: "manim-kokoro",
        }),
      });
      const res = await fetch(`/api/courses/${course.id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.course) setCourse(data.course);
      }
    } finally {
      setQueueingAll(false);
    }
  }

  function handleDownloadStoryboard(lesson: Lesson) {
    const payload = {
      lessonId: lesson.id,
      courseTitle: course.title,
      lessonTitle: lesson.title,
      videoModel: lesson.videoModel || "manim-kokoro",
      videoStoryboard: lesson.videoStoryboard,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboard-${lesson.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileUpload(
    lesson: Lesson,
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const videoFile = formData.get("video");
    if (!(videoFile instanceof File) || videoFile.size === 0) {
      setVideoFeedback("Please choose an .mp4 or .webm file first.");
      return;
    }

    setUploadingVideo(true);
    setVideoFeedback(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}/video`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      patchLessonInState(data.lesson);
      setVideoFeedback("Video uploaded and ready to play!");
      form.reset();
    } catch (err) {
      setVideoFeedback(
        err instanceof Error ? err.message : "Failed to upload video"
      );
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleAttachUrl(lesson: Lesson) {
    if (!videoUrlInput.trim()) return;
    setUploadingVideo(true);
    setVideoFeedback(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to attach URL");
      patchLessonInState(data.lesson);
      setVideoUrlInput("");
      setVideoFeedback("Video link attached!");
    } catch (err) {
      setVideoFeedback(
        err instanceof Error ? err.message : "Failed to attach URL"
      );
    } finally {
      setUploadingVideo(false);
    }
  }

  function selectLesson(id: string) {
    setActiveLessonId(id);
    setActiveTab("lesson");
    setSidebarOpen(false);
    setVideoFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!activeLesson) {
    return (
      <div className="p-10 text-center text-[#595954]">
        This course has no lessons yet.
      </div>
    );
  }

  const currentCode =
    editableCode[activeLesson.id] ?? activeLesson.codeExample ?? "";
  const isHtmlPreviewable =
    activeLesson.codeLanguage?.toLowerCase() === "html" &&
    Boolean(activeLesson.codeExample);
  const ytEmbed = activeLesson.videoUrl
    ? getYouTubeEmbedUrl(activeLesson.videoUrl)
    : null;

  return (
    <div className="flex-1 flex flex-col bg-[#ffffff]">
      {/* Architectural Course Sub-Header */}
      <div className="bg-[#f7f7f2] border-b border-[#d9d9d4] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden p-2 border border-[#d9d9d4] bg-[#ffffff] text-[#0e0e0e]"
            aria-label="Toggle Course Roadmap"
          >
            {sidebarOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
          <div className="min-w-0">
            <h1 className="font-extrabold tracking-[-0.02em] text-[#0e0e0e] truncate text-base sm:text-lg">
              {course.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#595954]">
              <span>{course.level}</span>
              <span>/</span>
              <span>
                {completedCount}/{allLessons.length} DONE ({progressPct}%)
              </span>
              <span>/</span>
              <span className="text-[#0e0e0e] font-semibold">
                {readyVideosCount}/{allLessons.length} VIDEOS READY
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingVideosCount > 0 && (
            <button
              type="button"
              disabled={queueingAll}
              onClick={handleQueueAllCourseVideos}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-60 text-[#0e0e0e] border border-[#0e0e0e] text-xs font-bold transition-colors"
            >
              {queueingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generate All Videos ({pendingVideosCount})
            </button>
          )}
          <Link
            href="/video-studio"
            className="text-xs font-semibold px-3.5 py-2 border border-[#d9d9d4] hover:border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e] inline-flex items-center gap-1.5"
          >
            <Film className="w-3.5 h-3.5" />
            Video Queue
          </Link>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex-1 flex relative max-w-[1560px] w-full mx-auto">
        {/* Left Roadmap Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "fixed inset-y-16 left-0 z-30 block shadow-2xl" : "hidden"
          } lg:static lg:block w-76 shrink-0 bg-[#f7f7f2] border-r border-[#d9d9d4] overflow-y-auto`}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#595954]">
                Course Roadmap
              </span>
              <span className="font-mono text-[11px] font-bold text-[#0e0e0e]">
                {progressPct}%
              </span>
            </div>

            <div className="w-full h-1.5 bg-[#e6e6e0] overflow-hidden mb-5">
              <div
                className="h-full bg-[#0e0e0e] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="space-y-6">
              {course.modules.map((mod, mIdx) => {
                const isStubModule = mod.lessons.some(
                  (l) => !l.contentMarkdown.trim()
                );
                return (
                <div key={mod.id}>
                  <div className="text-xs font-extrabold text-[#0e0e0e] mb-2 px-1 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-[#595954] mt-0.5 shrink-0">
                        {String(mIdx + 1).padStart(2, "0")}
                      </span>
                      <span className="leading-snug uppercase tracking-tight">
                        {mod.title}
                      </span>
                    </div>
                    {isStubModule && (
                      <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-[#f1ecfa] border border-[#c4b0f0] text-[#0e0e0e] shrink-0">
                        Outline
                      </span>
                    )}
                  </div>
                  <ul className="border-t border-[#d9d9d4]">
                    {mod.lessons.map((lesson) => {
                      const isActive = lesson.id === activeLesson.id;
                      return (
                        <li
                          key={lesson.id}
                          className="border-b border-[#d9d9d4]"
                        >
                          <button
                            type="button"
                            onClick={() => selectLesson(lesson.id)}
                            className={`w-full text-left px-3 py-3 text-sm flex items-start gap-2.5 transition-colors ${
                              isActive
                                ? "bg-[#0e0e0e] text-[#ffffff] font-semibold"
                                : "bg-[#ffffff] text-[#0e0e0e] hover:bg-[#f1ecfa]"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">
                              {lesson.completed ? (
                                <CheckCircle2
                                  className={`w-4 h-4 ${
                                    isActive
                                      ? "text-[#e3ee32]"
                                      : "text-[#0e0e0e]"
                                  }`}
                                />
                              ) : (
                                <Circle
                                  className={`w-4 h-4 ${
                                    isActive
                                      ? "text-[#80807a]"
                                      : "text-[#c7c7bf]"
                                  }`}
                                />
                              )}
                            </span>
                            <span className="flex-1 leading-snug text-[13px]">
                              {lesson.title}
                            </span>
                            {lesson.videoStatus === "ready" ? (
                              <Play
                                className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                                  isActive
                                    ? "text-[#e3ee32]"
                                    : "text-[#0e0e0e]"
                                }`}
                              />
                            ) : lesson.videoStatus === "processing" ||
                              lesson.videoStatus === "queued" ? (
                              <Loader2
                                className={`w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin ${
                                  isActive
                                    ? "text-[#e3ee32]"
                                    : "text-[#595954]"
                                }`}
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
              })}
            </div>
          </div>
        </aside>

        {/* Main Lesson Pane */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-8 bg-[#ffffff]">
          <div className="max-w-4xl mx-auto space-y-7">
            {/* Lesson Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#d9d9d4]">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-[#595954]">
                    {activeLesson.moduleTitle}
                  </span>
                  <StatusPill status={activeLesson.videoStatus} />
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#0e0e0e] leading-tight">
                  {activeLesson.title}
                </h2>
              </div>

              <div className="flex items-center border border-[#0e0e0e] divide-x divide-[#0e0e0e]">
                <button
                  type="button"
                  disabled={!prevLesson}
                  onClick={() => prevLesson && selectLesson(prevLesson.id)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-bold bg-[#ffffff] hover:bg-[#f7f7f2] disabled:opacity-35 text-[#0e0e0e]"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  type="button"
                  disabled={!nextLesson}
                  onClick={() => nextLesson && selectLesson(nextLesson.id)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-bold bg-[#e3ee32] hover:bg-[#d8e324] disabled:bg-[#f7f7f2] disabled:text-[#80807a] text-[#0e0e0e]"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Clean 16:9 Video Frame */}
            <section className="overflow-hidden bg-[#0e0e0e] border border-[#0e0e0e]">
              {activeLesson.videoUrl ? (
                ytEmbed ? (
                  <div className="aspect-video w-full">
                    <iframe
                      src={ytEmbed}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={activeLesson.title}
                    />
                  </div>
                ) : (
                  <video
                    key={activeLesson.videoUrl}
                    src={activeLesson.videoUrl}
                    controls
                    className="w-full aspect-video bg-[#0e0e0e]"
                  >
                    {activeLesson.subtitleUrl && (
                      <track
                        kind="subtitles"
                        src={activeLesson.subtitleUrl}
                        srcLang="en"
                        label="English"
                        default
                      />
                    )}
                  </video>
                )
              ) : activeLesson.videoStatus === "processing" ||
                activeLesson.videoStatus === "queued" ? (
                <div className="px-6 py-14 text-center text-[#f5f5f0] flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-[#1c1c1a] border border-[#e3ee32] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#e3ee32] animate-spin" />
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight">
                    {activeLesson.videoStatus === "processing"
                      ? "Rendering Your Lesson Video..."
                      : "Waiting in Cloud Video Queue..."}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#a6a69e] max-w-md">
                    Your Okike Academy video is rendering automatically (~35s)
                    and will appear here as soon as it’s ready. You can read the
                    lesson below while it finishes.
                  </p>
                </div>
              ) : (
                <div className="px-6 py-12 text-center text-[#f5f5f0] flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-[#1c1c1a] border border-[#595954] flex items-center justify-center">
                    <Video className="w-6 h-6 text-[#e3ee32]" />
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight">
                    Generate Video for This Lesson
                  </h3>
                  <p className="text-xs sm:text-sm text-[#a6a69e] max-w-md">
                    Create a narrated motion-graphics video synced directly to
                    this lesson.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={queueing}
                      onClick={() => handleQueueVideo(activeLesson)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-60 text-[#0e0e0e] text-sm font-bold transition-colors"
                    >
                      {queueing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Generate Lesson Video
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("tools")}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#1c1c1a] hover:bg-[#2a2a27] border border-[#595954] text-[#f5f5f0] text-xs font-semibold"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload Own MP4
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Architectural 3-Tab Panel */}
            <div className="border border-[#d9d9d4] bg-[#ffffff]">
              <div className="flex flex-wrap items-center border-b border-[#d9d9d4] bg-[#f7f7f2]">
                <button
                  type="button"
                  onClick={() => setActiveTab("lesson")}
                  className={`inline-flex items-center gap-2 px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "lesson"
                      ? "border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e]"
                      : "border-transparent text-[#595954] hover:text-[#0e0e0e]"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" /> 01 / Lesson Guide
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("quiz")}
                  className={`inline-flex items-center gap-2 px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "quiz"
                      ? "border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e]"
                      : "border-transparent text-[#595954] hover:text-[#0e0e0e]"
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> 02 / Quick Quiz
                  {activeLesson.quiz.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#f1ecfa] border border-[#c4b0f0] text-[#0e0e0e] text-[10px]">
                      {activeLesson.quiz.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("tools")}
                  className={`inline-flex items-center gap-2 px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "tools"
                      ? "border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e]"
                      : "border-transparent text-[#595954] hover:text-[#0e0e0e]"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> 03 / Video Script
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("qa")}
                  className={`inline-flex items-center gap-2 px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "qa"
                      ? "border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e]"
                      : "border-transparent text-[#595954] hover:text-[#0e0e0e]"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> 04 / QA &amp; Governance
                  {activeLesson.smeReview?.approved && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#e3ee32] border border-[#0e0e0e] text-[#0e0e0e] text-[10px]">
                      ✓
                    </span>
                  )}
                </button>
              </div>

              <div className="p-6 sm:p-8">
                {/* TAB 1: LESSON GUIDE */}
                {activeTab === "lesson" && (
                  <div className="space-y-8">
                    {!activeLesson.contentMarkdown.trim() ? (
                      <div className="p-8 bg-[#f7f7f2] border border-[#0e0e0e] text-center space-y-4">
                        <div className="font-mono text-xs uppercase tracking-widest text-[#595954]">
                          STAGE 2 · MODULE GENERATOR
                        </div>
                        <h3 className="text-xl font-extrabold text-[#0e0e0e]">
                          Generate Lessons &amp; Video Scripts for This Module
                        </h3>
                        <p className="text-sm text-[#595954] max-w-lg mx-auto">
                          This module is currently a roadmap outline. Click
                          below to generate all full lesson guides, quizzes, and
                          5-scene v5 video scripts for{" "}
                          <strong className="text-[#0e0e0e]">
                            {activeLesson.moduleTitle}
                          </strong>{" "}
                          (and automatically queue their videos for Colab →
                          Cloudinary).
                        </p>
                        {moduleGenError && (
                          <div className="p-3 bg-[#fff5f5] border border-[#b31f1f] text-[#b31f1f] text-xs font-semibold max-w-md mx-auto">
                            {moduleGenError}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                          <button
                            type="button"
                            disabled={generatingModuleId === activeLesson.moduleId}
                            onClick={() =>
                              handleGenerateModule(activeLesson.moduleId, true)
                            }
                            className="inline-flex items-center gap-2 px-6 py-3 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-60 border border-[#0e0e0e] text-[#0e0e0e] font-bold text-sm"
                          >
                            {generatingModuleId === activeLesson.moduleId ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating Module Content (~15s)...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Generate Module &amp; Queue Videos
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={generatingModuleId === activeLesson.moduleId}
                            onClick={() =>
                              handleGenerateModule(activeLesson.moduleId, false)
                            }
                            className="inline-flex items-center gap-2 px-4 py-3 bg-[#ffffff] hover:bg-[#f1ecfa] border border-[#d9d9d4] text-[#0e0e0e] font-semibold text-xs"
                          >
                            Generate Text Only (Queue Videos Later)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <article className="lesson-prose">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {activeLesson.contentMarkdown}
                        </ReactMarkdown>
                      </article>
                    )}

                    {/* Try It Yourself Code Sandbox */}
                    {activeLesson.codeExample && (
                      <section className="border border-[#d9d9d4] bg-[#f7f7f2] p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <h3 className="font-mono text-xs uppercase tracking-wider font-bold text-[#0e0e0e] flex items-center gap-2">
                            <Code2 className="w-4 h-4" />
                            Try It Yourself ({activeLesson.codeLanguage || "code"})
                          </h3>
                          <div className="flex items-center gap-2">
                            {isHtmlPreviewable && (
                              <button
                                type="button"
                                onClick={() => setShowLivePreview((v) => !v)}
                                className="text-xs font-bold px-3 py-1.5 bg-[#e3ee32] border border-[#0e0e0e] text-[#0e0e0e]"
                              >
                                {showLivePreview ? "Hide Preview" : "Live Preview"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(currentCode);
                                setCopiedCode(true);
                                setTimeout(() => setCopiedCode(false), 1800);
                              }}
                              className="text-xs font-semibold px-3 py-1.5 bg-[#ffffff] border border-[#d9d9d4] hover:border-[#0e0e0e] text-[#0e0e0e] inline-flex items-center gap-1"
                            >
                              {copiedCode ? (
                                <>
                                  <Check className="w-3.5 h-3.5" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div
                          className={`grid gap-3 ${
                            isHtmlPreviewable && showLivePreview
                              ? "grid-cols-1 lg:grid-cols-2"
                              : "grid-cols-1"
                          }`}
                        >
                          <textarea
                            value={currentCode}
                            onChange={(e) =>
                              setEditableCode((prev) => ({
                                ...prev,
                                [activeLesson.id]: e.target.value,
                              }))
                            }
                            spellCheck={false}
                            rows={10}
                            className="w-full font-mono text-xs sm:text-sm p-4 bg-[#0e0e0e] text-[#f5f5f0] border border-[#0e0e0e] focus:outline-none"
                          />
                          {isHtmlPreviewable && showLivePreview && (
                            <iframe
                              title="Live HTML Preview"
                              sandbox="allow-scripts"
                              srcDoc={currentCode}
                              className="w-full min-h-[240px] bg-[#ffffff] border border-[#d9d9d4]"
                            />
                          )}
                        </div>
                      </section>
                    )}

                    {/* Key Takeaways */}
                    {activeLesson.keyTakeaways.length > 0 && (
                      <section className="bg-[#f1ecfa] border border-[#c4b0f0] p-5">
                        <div className="font-mono text-xs uppercase tracking-widest font-bold text-[#0e0e0e] mb-3">
                          Key Takeaways
                        </div>
                        <ul className="space-y-2.5">
                          {activeLesson.keyTakeaways.map((point, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2.5 text-sm text-[#0e0e0e]"
                            >
                              <span className="font-mono text-xs font-bold bg-[#e3ee32] border border-[#0e0e0e] px-1.5 py-0.5 shrink-0">
                                0{idx + 1}
                              </span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}

                {/* TAB 2: QUICK QUIZ */}
                {activeTab === "quiz" && (
                  <div className="space-y-7">
                    {activeLesson.quiz.length === 0 ? (
                      <p className="text-sm text-[#595954]">
                        No quiz questions for this lesson.
                      </p>
                    ) : (
                      activeLesson.quiz.map((q, qIdx) => {
                        const selected = quizSelections[activeLesson.id]?.[qIdx];
                        const answered = selected !== undefined;
                        const isCorrect = selected === q.correctIndex;
                        return (
                          <div key={qIdx} className="space-y-3">
                            <p className="font-bold text-base text-[#0e0e0e]">
                              <span className="font-mono text-xs text-[#595954] mr-2">
                                0{qIdx + 1} /
                              </span>
                              {q.question}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {q.options.map((opt, oIdx) => {
                                let btnClass =
                                  "border-[#d9d9d4] hover:border-[#0e0e0e] bg-[#f7f7f2] text-[#0e0e0e]";
                                if (answered) {
                                  if (oIdx === q.correctIndex) {
                                    btnClass =
                                      "border-[#0e0e0e] bg-[#e3ee32] text-[#0e0e0e] font-bold";
                                  } else if (oIdx === selected) {
                                    btnClass =
                                      "border-[#b31f1f] bg-[#fff5f5] text-[#b31f1f]";
                                  }
                                }
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() =>
                                      setQuizSelections((prev) => ({
                                        ...prev,
                                        [activeLesson.id]: {
                                          ...(prev[activeLesson.id] || {}),
                                          [qIdx]: oIdx,
                                        },
                                      }))
                                    }
                                    className={`text-left px-4 py-3 border text-sm transition-colors ${btnClass}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                            {answered && (
                              <p
                                className={`text-xs p-3.5 border ${
                                  isCorrect
                                    ? "bg-[#f7f7f2] text-[#0e0e0e] border-[#0e0e0e]"
                                    : "bg-[#f1ecfa] text-[#0e0e0e] border-[#c4b0f0]"
                                }`}
                              >
                                <strong>
                                  {isCorrect ? "Correct — " : "Explanation — "}
                                </strong>
                                {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB 3: VIDEO SCRIPT & UPLOAD */}
                {activeTab === "tools" && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-sm text-[#0e0e0e]">
                          Lesson Video Script ({activeLesson.videoStoryboard.length}{" "}
                          scenes)
                        </h3>
                        <p className="text-xs text-[#595954]">
                          Synced narration &amp; motion-graphics beats for this
                          lesson.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadStoryboard(activeLesson)}
                          className="text-xs font-semibold px-3 py-2 border border-[#d9d9d4] hover:border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e] inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> Export JSON
                        </button>
                        <button
                          type="button"
                          disabled={queueing}
                          onClick={() => handleQueueVideo(activeLesson)}
                          className="text-xs font-bold px-3.5 py-2 bg-[#e3ee32] hover:bg-[#d8e324] border border-[#0e0e0e] text-[#0e0e0e] inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Re-Generate Video
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[#d9d9d4]">
                      {activeLesson.videoStoryboard.map((scene) => (
                        <div
                          key={scene.sceneNumber}
                          className="p-4 border-b border-[#d9d9d4] bg-[#f7f7f2] text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between font-mono font-bold text-[#0e0e0e]">
                            <span>
                              0{scene.sceneNumber} /{" "}
                              {scene.heading || "Scene"}
                            </span>
                            {scene.template && (
                              <span className="px-2 py-0.5 rounded-full bg-[#f1ecfa] border border-[#c4b0f0] text-[#0e0e0e] text-[10px] uppercase">
                                {scene.template.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <p className="text-[#2b2b28]">
                            &ldquo;{scene.narration}&rdquo;
                          </p>
                          {scene.bullets && scene.bullets.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {scene.bullets.map((b, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-full bg-[#ffffff] border border-[#d9d9d4] text-[#595954] text-[11px]"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <form
                        onSubmit={(e) => handleFileUpload(activeLesson, e)}
                        className="space-y-3 p-4 bg-[#f7f7f2] border border-[#d9d9d4]"
                      >
                        <div className="font-mono text-xs uppercase font-bold text-[#0e0e0e]">
                          Upload Custom Video (.mp4)
                        </div>
                        <input
                          type="file"
                          name="video"
                          accept="video/mp4,video/webm"
                          className="block w-full text-xs text-[#595954] file:mr-3 file:py-1.5 file:px-3 file:border file:border-[#0e0e0e] file:bg-[#e3ee32] file:text-[#0e0e0e] file:font-bold"
                        />
                        <input
                          type="file"
                          name="subtitles"
                          accept=".vtt,text/vtt"
                          className="block w-full text-xs text-[#595954] file:mr-3 file:py-1.5 file:px-3 file:border file:border-[#d9d9d4] file:bg-[#ffffff] file:text-[#0e0e0e] file:font-semibold"
                        />
                        <button
                          type="submit"
                          disabled={uploadingVideo}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0e0e0e] text-[#ffffff] text-xs font-bold"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#e3ee32]" />{" "}
                          Upload MP4
                        </button>
                      </form>

                      <div className="space-y-3 p-4 bg-[#f7f7f2] border border-[#d9d9d4]">
                        <div className="font-mono text-xs uppercase font-bold text-[#0e0e0e]">
                          Attach YouTube or Video URL
                        </div>
                        <input
                          type="url"
                          value={videoUrlInput}
                          onChange={(e) => setVideoUrlInput(e.target.value)}
                          placeholder="https://youtu.be/... or https://.../video.mp4"
                          className="w-full px-3 py-2 bg-[#ffffff] border border-[#80807a] focus:border-[#0e0e0e] text-xs text-[#0e0e0e] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={uploadingVideo}
                          onClick={() => handleAttachUrl(activeLesson)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0e0e0e] text-[#ffffff] text-xs font-bold"
                        >
                          <LinkIcon className="w-3.5 h-3.5 text-[#e3ee32]" />{" "}
                          Attach URL
                        </button>
                      </div>
                    </div>

                    {videoFeedback && (
                      <div className="p-3 bg-[#f1ecfa] border border-[#c4b0f0] text-[#0e0e0e] text-xs font-semibold">
                        {videoFeedback}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: INSTITUTIONAL QA, ACCESSIBILITY & SME SIGN-OFF */}
                {activeTab === "qa" && (
                  <InstitutionalCompliancePanel
                    lesson={activeLesson}
                    onReviewSaved={(smeReview: SmeReview) =>
                      patchLessonInState({ ...activeLesson, smeReview })
                    }
                  />
                )}
              </div>
            </div>

            {/* Bottom Complete + Next Lesson Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleCompleted(activeLesson)}
                className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                  activeLesson.completed
                    ? "bg-[#0e0e0e] border-[#0e0e0e] text-[#e3ee32]"
                    : "bg-[#ffffff] border-[#0e0e0e] text-[#0e0e0e] hover:bg-[#f7f7f2]"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {activeLesson.completed ? "Lesson Completed" : "Mark Complete"}
              </button>

              {nextLesson && (
                <button
                  type="button"
                  onClick={() => {
                    if (!activeLesson.completed) toggleCompleted(activeLesson);
                    selectLesson(nextLesson.id);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#e3ee32] hover:bg-[#d8e324] border border-[#0e0e0e] text-[#0e0e0e] text-sm font-bold transition-colors"
                >
                  Next: {nextLesson.title} <ArrowUpRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
