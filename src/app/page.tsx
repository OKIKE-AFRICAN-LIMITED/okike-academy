import Link from "next/link";
import { listCourses } from "@/lib/db";
import { ArrowUpRight, BookOpen, Clock, Layers, Video } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const courses = await listCourses();

  return (
    <main className="flex-1 bg-[#ffffff] text-[#0e0e0e] flex flex-col">
      {/* Swiss-Editorial Hero Section */}
      <section className="bg-[#f7f7f2] border-b border-[#d9d9d4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-4 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-[#e3ee32] border border-[#0e0e0e]" />
            <span>00 / OKIKE ACADEMY · STRUCTURED LEARNING STUDIO</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] leading-[0.95] text-[#0e0e0e] max-w-4xl mb-6">
            Turn any subject into a structured{" "}
            <span className="bg-[#e3ee32] px-2 inline-block">video course.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#595954] max-w-2xl leading-relaxed mb-9">
            Enter a course topic and Okike Academy generates the complete
            roadmap, crisp lessons, interactive quizzes, and narrated
            motion-graphics videos automatically.
          </p>

          {/* Okike Signature Split Input + Acid-Lime CTA */}
          <form
            action="/create"
            method="GET"
            className="max-w-2xl flex flex-col sm:flex-row border border-[#0e0e0e] bg-[#ffffff]"
          >
            <input
              type="text"
              name="topic"
              placeholder="What course do you want to build? (e.g. Python, UI Design, Biology...)"
              className="flex-1 px-4 py-4 bg-[#ffffff] text-[#0e0e0e] placeholder:text-[#595954] text-sm font-medium focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-[#e3ee32] hover:bg-[#d8e324] text-[#0e0e0e] font-bold text-sm border-t sm:border-t-0 sm:border-l border-[#0e0e0e] transition-colors shrink-0"
            >
              <span>Build Course</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Architectural 3-Column Hairline Process Strip */}
        <div className="border-t border-[#d9d9d4] bg-[#ffffff]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#d9d9d4]">
            <div className="px-4 sm:px-6 py-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954] mb-1">
                01 / INPUT
              </div>
              <div className="font-bold text-sm text-[#0e0e0e]">
                Give a course topic &amp; level
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954] mb-1">
                02 / CURRICULUM
              </div>
              <div className="font-bold text-sm text-[#0e0e0e]">
                Roadmap, lesson guides &amp; quizzes
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954] mb-1">
                03 / MOTION VIDEO
              </div>
              <div className="font-bold text-sm text-[#0e0e0e]">
                Synced narrated videos built in the cloud
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Course Grid */}
      <section className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#d9d9d4] mb-8">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#595954] mb-1">
              CATALOG · {String(courses.length).padStart(2, "0")} COURSES
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#0e0e0e]">
              Your Courses
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/video-studio"
              className="px-4 py-2.5 border border-[#d9d9d4] hover:border-[#0e0e0e] text-xs font-semibold text-[#0e0e0e] bg-[#f7f7f2] transition-colors"
            >
              Video Queue
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0e0e0e] hover:bg-[#222220] text-[#ffffff] text-xs font-semibold transition-colors"
            >
              <span>New Course</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#e3ee32]" />
            </Link>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="border border-[#d9d9d4] bg-[#f7f7f2] p-14 text-center">
            <BookOpen className="w-8 h-8 text-[#595954] mx-auto mb-3" />
            <h3 className="text-lg font-bold text-[#0e0e0e] mb-1">
              No courses yet
            </h3>
            <p className="text-sm text-[#595954] mb-6">
              Enter any subject above to generate your first Okike Academy
              course.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-5 py-3 bg-[#e3ee32] border border-[#0e0e0e] text-[#0e0e0e] font-bold text-sm"
            >
              Build First Course <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#d9d9d4]">
            {courses.map((course, idx) => {
              const progressPct =
                course.lessonCount > 0
                  ? Math.round(
                      (course.completedLessons / course.lessonCount) * 100
                    )
                  : 0;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group bg-[#ffffff] hover:bg-[#f7f7f2] border-r border-b border-[#d9d9d4] p-6 sm:p-7 flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className="font-mono text-[11px] uppercase tracking-widest text-[#595954]">
                        {String(idx + 1).padStart(2, "0")} / {course.level}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#595954]">
                        <Clock className="w-3 h-3" />~{course.estimatedHours}H
                      </span>
                    </div>

                    <h3 className="text-xl font-extrabold tracking-[-0.02em] leading-snug text-[#0e0e0e] mb-2.5 line-clamp-2">
                      {course.title}
                    </h3>
                    <p className="text-sm text-[#595954] line-clamp-2 mb-6 leading-relaxed">
                      {course.description}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#d9d9d4] bg-[#ffffff] text-[11px] font-medium text-[#0e0e0e]">
                        <Layers className="w-3 h-3 text-[#595954]" />
                        {course.moduleCount} modules · {course.lessonCount} lessons
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                          course.readyVideos > 0
                            ? "border-[#0e0e0e] bg-[#e3ee32] text-[#0e0e0e]"
                            : "border-[#d9ccf2] bg-[#f1ecfa] text-[#0e0e0e]"
                        }`}
                      >
                        <Video className="w-3 h-3" />
                        {course.readyVideos}/{course.lessonCount} videos
                      </span>
                    </div>

                    <div>
                      <div className="w-full h-1.5 bg-[#e6e6e0] overflow-hidden mb-2.5">
                        <div
                          className="h-full bg-[#0e0e0e] transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="font-mono text-[11px] text-[#595954]">
                          {progressPct}% COMPLETE
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#0e0e0e] group-hover:translate-x-0.5 transition-transform">
                          Open Course <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Dark Inverse Okike Footer Band */}
      <footer className="bg-[#0e0e0e] text-[#f5f5f0] border-t border-[#0e0e0e]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-extrabold tracking-[-0.04em] uppercase">
              Okike <span className="text-[#e3ee32]">Academy</span>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#80807a] mt-1">
              Structured Roadmaps · Interactive Lessons · Automated Video Studio
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-wider">
            <Link href="/" className="hover:text-[#e3ee32] transition-colors">
              Courses
            </Link>
            <Link
              href="/create"
              className="hover:text-[#e3ee32] transition-colors"
            >
              Build Course
            </Link>
            <Link
              href="/video-studio"
              className="hover:text-[#e3ee32] transition-colors"
            >
              Video Queue
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
