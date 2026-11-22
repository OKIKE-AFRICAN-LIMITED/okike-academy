"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  FileText,
  Film,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";

const SUGGESTED_TOPICS = [
  "Fundamentals of Cybersecurity",
  "Data Analysis Mastery",
  "Python for Beginners",
  "UI/UX Design Essentials",
  "Digital Marketing Fundamentals",
  "Personal Finance & Investing",
];

const SIZE_PRESETS = [
  {
    id: "quick",
    label: "Quick Course",
    desc: "2 modules · 4 classes",
    modules: 2,
    lessons: 2,
  },
  {
    id: "standard",
    label: "Standard Course",
    desc: "3 modules · 6 classes",
    modules: 3,
    lessons: 2,
  },
  {
    id: "full",
    label: "Extended Course",
    desc: "4 modules · 8 classes",
    modules: 4,
    lessons: 2,
  },
] as const;

const SYLLABUS_PLACEHOLDER = `Module 1: Foundations of Cybersecurity
1. What is Cybersecurity & The CIA Triad
2. Understanding Threats, Vulnerabilities & Risk
3. Common Attack Vectors Explained

Module 2: Network & Identity Defense
1. Firewalls, VPNs & Zero Trust
2. Passwords & Multi-Factor Authentication (MFA)
3. Spotting Phishing & Social Engineering`;

function CreateCourseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [builderMode, setBuilderMode] = useState<"quick" | "large">("quick");
  const [largeSource, setLargeSource] = useState<"ai" | "syllabus">("ai");

  const [topic, setTopic] = useState(searchParams.get("topic") || "");
  const [level, setLevel] = useState("Beginner");
  const [sizeId, setSizeId] = useState<"quick" | "standard" | "full">(
    "standard"
  );
  const [largeModules, setLargeModules] = useState(13);
  const [largeLessonsPerMod, setLargeLessonsPerMod] = useState(7);
  const [customSyllabus, setCustomSyllabus] = useState("");
  const [hostModel, setHostModel] = useState<
    "okike-v5-female" | "okike-v5-male"
  >("okike-v5-female");
  const [autoQueueVideos, setAutoQueueVideos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusStep, setStatusStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedSize =
    SIZE_PRESETS.find((s) => s.id === sizeId) || SIZE_PRESETS[1];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      setError("Please enter a course topic.");
      return;
    }
    if (
      builderMode === "large" &&
      largeSource === "syllabus" &&
      !customSyllabus.trim()
    ) {
      setError("Please paste your module & lesson syllabus.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (builderMode === "large") {
        setStatusStep(
          largeSource === "syllabus"
            ? "Parsing your custom syllabus & saving roadmap to Turso..."
            : `Generating ${largeModules}-module (${
                largeModules * largeLessonsPerMod
              } classes) roadmap outline...`
        );
        const res = await fetch("/api/courses/roadmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            level,
            videoModel: hostModel,
            moduleCount: largeModules,
            lessonsPerModule: largeLessonsPerMod,
            customSyllabus:
              largeSource === "syllabus" ? customSyllabus.trim() : "",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to create large roadmap");
        }
        router.push(`/courses/${data.course.id}`);
        return;
      }

      setStatusStep("Designing roadmap, writing lessons & v5 video scripts...");
      const res = await fetch("/api/courses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          level,
          moduleCount: selectedSize.modules,
          lessonsPerModule: selectedSize.lessons,
          videoModel: hostModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate course");
      }

      if (autoQueueVideos && data.course?.id) {
        setStatusStep(
          "Queueing lesson videos for automatic cloud rendering..."
        );
        await fetch(`/api/courses/${data.course.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "queue-videos",
            videoModel: hostModel,
          }),
        });
      }

      router.push(`/courses/${data.course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      setStatusStep("");
    }
  }

  return (
    <main className="flex-1 bg-[#f7f7f2] py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-7">
          <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-2">
            OKIKE ACADEMY · COURSE BUILDER
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#0e0e0e] mb-2">
            Create a New Course
          </h1>
          <p className="text-[#595954] text-sm">
            Build a quick 4–8 class course immediately, or create a full{" "}
            <strong className="text-[#0e0e0e]">
              13+ module / 96+ class curriculum
            </strong>{" "}
            and generate lessons module-by-module with zero timeouts.
          </p>
        </div>

        {/* Builder Mode Tabs */}
        <div className="grid grid-cols-2 border border-[#0e0e0e] bg-[#ffffff] mb-6 divide-x divide-[#0e0e0e]">
          <button
            type="button"
            disabled={loading}
            onClick={() => setBuilderMode("quick")}
            className={`py-3.5 px-4 text-left transition-colors ${
              builderMode === "quick"
                ? "bg-[#0e0e0e] text-[#e3ee32]"
                : "bg-[#ffffff] text-[#0e0e0e] hover:bg-[#f7f7f2]"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">
              MODE 01 · INSTANT
            </div>
            <div className="font-bold text-sm mt-0.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Quick Course (4–8 classes)
            </div>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => setBuilderMode("large")}
            className={`py-3.5 px-4 text-left transition-colors ${
              builderMode === "large"
                ? "bg-[#0e0e0e] text-[#e3ee32]"
                : "bg-[#ffffff] text-[#0e0e0e] hover:bg-[#f7f7f2]"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">
              MODE 02 · TWO-STAGE
            </div>
            <div className="font-bold text-sm mt-0.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Large Curriculum (Up to 150
              classes)
            </div>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#ffffff] border border-[#d9d9d4] p-6 sm:p-8 space-y-7"
        >
          {/* 01 / Topic */}
          <div>
            <label
              htmlFor="topic"
              className="block font-mono text-xs uppercase tracking-widest text-[#595954] mb-2"
            >
              01 / Course Title or Topic
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Complete Cybersecurity Bootcamp, Data Analysis Mastery..."
              className="w-full px-4 py-3.5 border border-[#80807a] focus:border-[#0e0e0e] focus:outline-none text-[#0e0e0e] text-sm bg-[#ffffff]"
              disabled={loading}
            />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SUGGESTED_TOPICS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTopic(item)}
                  disabled={loading}
                  className="text-xs px-3 py-1 rounded-full bg-[#f7f7f2] hover:bg-[#e3ee32] text-[#0e0e0e] border border-[#d9d9d4] hover:border-[#0e0e0e] transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* 02 / Student Level */}
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-2">
              02 / Student Level
            </div>
            <div className="grid grid-cols-3 border border-[#d9d9d4] divide-x divide-[#d9d9d4]">
              {["Beginner", "Intermediate", "Advanced"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={loading}
                  onClick={() => setLevel(lvl)}
                  className={`py-3 px-3 text-sm font-semibold transition-colors ${
                    level === lvl
                      ? "bg-[#0e0e0e] text-[#e3ee32]"
                      : "bg-[#ffffff] text-[#0e0e0e] hover:bg-[#f7f7f2]"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* 03 / Structure (Quick vs Large Two-Stage) */}
          {builderMode === "quick" ? (
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-2">
                03 / Course Length
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={loading}
                    onClick={() => setSizeId(preset.id)}
                    className={`text-left p-4 border transition-colors ${
                      sizeId === preset.id
                        ? "border-[#0e0e0e] bg-[#f1ecfa]"
                        : "border-[#d9d9d4] bg-[#ffffff] hover:bg-[#f7f7f2]"
                    }`}
                  >
                    <div className="font-bold text-sm text-[#0e0e0e]">
                      {preset.label}
                    </div>
                    <div className="font-mono text-[11px] text-[#595954] mt-1">
                      {preset.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="font-mono text-xs uppercase tracking-widest text-[#595954]">
                03 / Roadmap Source (Stage 1 — Fast Outline)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setLargeSource("ai")}
                  className={`p-3.5 border text-left transition-colors ${
                    largeSource === "ai"
                      ? "border-[#0e0e0e] bg-[#f1ecfa]"
                      : "border-[#d9d9d4] bg-[#ffffff]"
                  }`}
                >
                  <div className="font-bold text-sm text-[#0e0e0e] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> AI Full Roadmap
                  </div>
                  <div className="text-xs text-[#595954] mt-0.5">
                    Gemini designs all modules &amp; class titles
                  </div>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setLargeSource("syllabus")}
                  className={`p-3.5 border text-left transition-colors ${
                    largeSource === "syllabus"
                      ? "border-[#0e0e0e] bg-[#f1ecfa]"
                      : "border-[#d9d9d4] bg-[#ffffff]"
                  }`}
                >
                  <div className="font-bold text-sm text-[#0e0e0e] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Paste My Syllabus
                  </div>
                  <div className="text-xs text-[#595954] mt-0.5">
                    Import your own 13-module / 96-class outline
                  </div>
                </button>
              </div>

              {largeSource === "ai" ? (
                <div className="grid grid-cols-2 gap-4 p-4 bg-[#f7f7f2] border border-[#d9d9d4]">
                  <div>
                    <label className="block font-mono text-[11px] uppercase text-[#595954] mb-1">
                      Modules (2–20)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={largeModules}
                      onChange={(e) =>
                        setLargeModules(
                          Math.min(20, Math.max(2, Number(e.target.value) || 2))
                        )
                      }
                      className="w-full px-3 py-2 border border-[#80807a] bg-[#ffffff] text-sm font-bold text-[#0e0e0e]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[11px] uppercase text-[#595954] mb-1">
                      Classes / Module (2–12)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={largeLessonsPerMod}
                      onChange={(e) =>
                        setLargeLessonsPerMod(
                          Math.min(12, Math.max(2, Number(e.target.value) || 2))
                        )
                      }
                      className="w-full px-3 py-2 border border-[#80807a] bg-[#ffffff] text-sm font-bold text-[#0e0e0e]"
                    />
                  </div>
                  <div className="col-span-2 font-mono text-xs text-[#0e0e0e]">
                    Total roadmap size:{" "}
                    <strong className="bg-[#e3ee32] px-1.5 py-0.5">
                      {largeModules} modules ·{" "}
                      {largeModules * largeLessonsPerMod} classes
                    </strong>{" "}
                    (generated module-by-module in Stage 2!)
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={8}
                    value={customSyllabus}
                    onChange={(e) => setCustomSyllabus(e.target.value)}
                    placeholder={SYLLABUS_PLACEHOLDER}
                    className="w-full p-3.5 border border-[#80807a] focus:border-[#0e0e0e] focus:outline-none font-mono text-xs text-[#0e0e0e] bg-[#ffffff]"
                    disabled={loading}
                  />
                  <p className="text-[11px] text-[#595954] mt-1">
                    Start each module line with <code>Module 1: ...</code> or{" "}
                    <code>## ...</code>, followed by each class title on its own
                    line.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 04 / Okike Studio Host */}
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-2">
              04 / Okike Studio Host
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => setHostModel("okike-v5-female")}
                className={`flex items-center gap-3.5 p-3 border text-left transition-colors ${
                  hostModel === "okike-v5-female"
                    ? "border-[#0e0e0e] bg-[#e3ee32]/25"
                    : "border-[#d9d9d4] bg-[#ffffff] hover:bg-[#f7f7f2]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mascots/okike_host_female.jpg"
                  alt="Amara Okike Host"
                  className="w-12 h-12 object-cover border border-[#0e0e0e] shrink-0"
                />
                <div>
                  <div className="font-bold text-sm text-[#0e0e0e]">
                    Amara (Female)
                  </div>
                  <div className="font-mono text-[11px] text-[#595954]">
                    Warm Studio Voice · v5
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setHostModel("okike-v5-male")}
                className={`flex items-center gap-3.5 p-3 border text-left transition-colors ${
                  hostModel === "okike-v5-male"
                    ? "border-[#0e0e0e] bg-[#e3ee32]/25"
                    : "border-[#d9d9d4] bg-[#ffffff] hover:bg-[#f7f7f2]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mascots/okike_host_male.jpg"
                  alt="Tunde Okike Host"
                  className="w-12 h-12 object-cover border border-[#0e0e0e] shrink-0"
                />
                <div>
                  <div className="font-bold text-sm text-[#0e0e0e]">
                    Tunde (Male)
                  </div>
                  <div className="font-mono text-[11px] text-[#595954]">
                    Studio Mentor Voice · v5
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 05 / Auto Video Queue (Quick Mode) */}
          {builderMode === "quick" && (
            <label className="flex items-start gap-3 p-4 bg-[#f7f7f2] border border-[#d9d9d4] cursor-pointer">
              <input
                type="checkbox"
                checked={autoQueueVideos}
                onChange={(e) => setAutoQueueVideos(e.target.checked)}
                disabled={loading}
                className="mt-1 w-4 h-4 accent-[#0e0e0e]"
              />
              <div>
                <div className="text-sm font-bold text-[#0e0e0e] flex items-center gap-1.5">
                  <Film className="w-4 h-4" />
                  Automatically generate lesson videos
                </div>
                <p className="text-xs text-[#595954] mt-0.5">
                  Queues all {selectedSize.modules * selectedSize.lessons}{" "}
                  lessons for your cloud video worker immediately.
                </p>
              </div>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3.5 bg-[#fff5f5] border border-[#b31f1f] text-[#b31f1f] text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-60 text-[#0e0e0e] font-bold text-sm border border-[#0e0e0e] transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {statusStep || "Building your course..."}
              </>
            ) : builderMode === "large" ? (
              <>
                <span>Create Full Roadmap (Stage 1)</span>
                <ArrowUpRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Build Course &amp; Roadmap</span>
                <ArrowUpRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function CreateCoursePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-10 text-[#595954] text-sm font-mono">
          LOADING COURSE BUILDER...
        </div>
      }
    >
      <CreateCourseForm />
    </Suspense>
  );
}
