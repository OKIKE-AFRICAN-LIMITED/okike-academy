"use client";

import { useState } from "react";
import type { Lesson, SmeReview } from "@/lib/types";
import {
  CheckCircle2,
  Download,
  FileText,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";

interface Props {
  lesson: Lesson;
  onReviewSaved: (review: SmeReview) => void;
}

const RUBRIC_FIELDS: { key: keyof SmeReview["scores"]; label: string }[] = [
  { key: "hook", label: "Hook Strength (first 5s)" },
  { key: "variety", label: "Scene & Visual Variety" },
  { key: "clarity", label: "Clarity of Single Objective" },
  { key: "visualFit", label: "Visual Fit to Subject" },
  { key: "sync", label: "Audio / Caption Sync" },
  { key: "mobileReadability", label: "Mobile Readability (9:16 / 360px)" },
  { key: "depth", label: "Pedagogical Depth" },
  { key: "accuracy", label: "Factual & Source Accuracy" },
];

export function InstitutionalCompliancePanel({ lesson, onReviewSaved }: Props) {
  const existing = lesson.smeReview;
  const [reviewerName, setReviewerName] = useState(existing?.reviewerName || "");
  const [reviewerTitle, setReviewerTitle] = useState(
    existing?.reviewerTitle || "Subject-Matter Expert"
  );
  const [notes, setNotes] = useState(existing?.notes || "");
  const [scores, setScores] = useState<SmeReview["scores"]>(
    existing?.scores || {
      hook: 4,
      variety: 4,
      clarity: 5,
      visualFit: 4,
      sync: 5,
      mobileReadability: 4,
      depth: 4,
      accuracy: 5,
    }
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const avg = (
    Object.values(scores).reduce((a, b) => a + b, 0) / 8
  ).toFixed(2);

  function downloadTranscript() {
    const text =
      lesson.transcriptText ||
      `# ${lesson.title}\n\n${lesson.contentMarkdown}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewerName.trim()) {
      setFeedback("Please enter the reviewer's full name.");
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: reviewerName.trim(),
          reviewerTitle: reviewerTitle.trim(),
          scores,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save review");
      onReviewSaved(data.smeReview);
      setFeedback(
        data.smeReview.approved
          ? `Approved for Institutional Use (Avg ${data.smeReview.averageScore}/5.0).`
          : `Saved (Avg ${data.smeReview.averageScore}/5.0 — minimum 4.0 required for approval).`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not save review");
    } finally {
      setSaving(false);
    }
  }

  const licenses = lesson.licenses || [];
  const qa = lesson.qaReport;

  return (
    <div className="space-y-8">
      {/* Top Institutional Status Banner */}
      <div className="p-5 bg-[#f7f7f2] border border-[#0e0e0e] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="font-mono text-[11px] uppercase tracking-widest text-[#595954] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0e0e0e]" />
            INSTITUTIONAL VETTING &amp; ACCESSIBILITY LEDGER
          </div>
          <h3 className="text-lg font-extrabold text-[#0e0e0e]">
            {existing?.approved
              ? `Approved by ${existing.reviewerName} (${existing.averageScore}/5.0)`
              : "Pending Subject-Matter Expert Sign-Off"}
          </h3>
          {existing?.reviewedAt && (
            <p className="text-xs text-[#595954]">
              {existing.reviewerTitle} · Signed{" "}
              {new Date(existing.reviewedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <span
          className={`font-mono text-xs uppercase font-bold px-3.5 py-1.5 border ${
            existing?.approved
              ? "bg-[#e3ee32] text-[#0e0e0e] border-[#0e0e0e]"
              : "bg-[#f1ecfa] text-[#0e0e0e] border-[#c4b0f0]"
          }`}
        >
          {existing?.approved ? "✓ Institutionally Approved" : "Awaiting SME Review"}
        </span>
      </div>

      {/* Automated QA Gate & Accessibility Downloads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 border border-[#d9d9d4] bg-[#ffffff] space-y-3">
          <div className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#0e0e0e]">
            01 / Automated QA Gate
          </div>
          {qa ? (
            <div className="space-y-2 text-xs text-[#0e0e0e]">
              <div className="flex justify-between py-1 border-b border-[#ecece7]">
                <span className="text-[#595954]">QA Gate Status</span>
                <span className="font-bold">
                  {qa.passed ? "✓ PASSED" : "✕ BLOCKED"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#ecece7]">
                <span className="text-[#595954]">Measured Duration</span>
                <span className="font-mono font-semibold">
                  {qa.total_duration_sec}s ({qa.scene_count} scenes)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#ecece7]">
                <span className="text-[#595954]">Audio Loudness Standard</span>
                <span className="font-mono font-semibold">-16 LUFS / -1 dBTP</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#595954]">Verified Visual Assets</span>
                <span className="font-mono font-semibold">{qa.asset_count} logged</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#595954]">
              Automated QA metrics populate automatically after the 7-stage Colab worker renders this lesson.
            </p>
          )}
        </div>

        <div className="p-5 border border-[#d9d9d4] bg-[#ffffff] space-y-3">
          <div className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#0e0e0e]">
            02 / Accessibility &amp; Mobile Formats
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTranscript}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0e0e0e] text-[#ffffff] text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5 text-[#e3ee32]" />
              Download Transcript (.txt)
            </button>
            {lesson.subtitleUrl && (
              <a
                href={lesson.subtitleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#0e0e0e] bg-[#ffffff] text-[#0e0e0e] text-xs font-bold"
              >
                <FileText className="w-3.5 h-3.5" />
                WebVTT Captions (.vtt)
              </a>
            )}
            {lesson.portraitVideoUrl && (
              <a
                href={lesson.portraitVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#0e0e0e] bg-[#e3ee32] text-[#0e0e0e] text-xs font-bold"
              >
                <Smartphone className="w-3.5 h-3.5" />
                9:16 Mobile Portrait MP4
              </a>
            )}
          </div>
          {lesson.transcriptText && (
            <pre className="max-h-36 overflow-y-auto p-3 bg-[#f7f7f2] border border-[#d9d9d4] text-[11px] text-[#0e0e0e] whitespace-pre-wrap font-mono">
              {lesson.transcriptText}
            </pre>
          )}
        </div>
      </div>

      {/* Asset Licenses & Source Provenance Table */}
      <div className="p-5 border border-[#d9d9d4] bg-[#ffffff] space-y-3">
        <div className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#0e0e0e]">
          03 / Asset Provenance &amp; Licenses Ledger ({licenses.length})
        </div>
        {licenses.length === 0 ? (
          <p className="text-xs text-[#595954]">
            No external or AI-generated visual assets logged yet for this lesson.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#0e0e0e] font-mono text-[10px] uppercase text-[#595954]">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Alt-Text Description</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2">License</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((a) => (
                  <tr key={a.asset_id} className="border-b border-[#ecece7]">
                    <td className="py-2 pr-3 font-mono font-semibold text-[#0e0e0e]">
                      {a.asset_type}
                    </td>
                    <td className="py-2 pr-3 text-[#0e0e0e]">{a.alt_text}</td>
                    <td className="py-2 pr-3 text-[#595954]">{a.source}</td>
                    <td className="py-2 font-mono text-[11px] text-[#0e0e0e]">
                      {a.license}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SME 8-Criterion Human Review Rubric */}
      <form
        onSubmit={submitReview}
        className="p-5 border border-[#0e0e0e] bg-[#f7f7f2] space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#0e0e0e]">
              04 / Subject-Matter Expert Review Rubric (Min 4.0 to Approve)
            </div>
            <p className="text-xs text-[#595954]">
              Score each institutional quality criterion from 1 (Weak) to 5 (Broadcast Standard).
            </p>
          </div>
          <div className="font-mono text-sm font-extrabold px-3 py-1 bg-[#ffffff] border border-[#0e0e0e]">
            AVG: {avg} / 5.0
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Reviewer Full Name (e.g. Dr. A. Okafor)"
            className="px-3 py-2 bg-[#ffffff] border border-[#d9d9d4] text-xs text-[#0e0e0e]"
          />
          <input
            type="text"
            value={reviewerTitle}
            onChange={(e) => setReviewerTitle(e.target.value)}
            placeholder="Title / Institution (e.g. Curriculum Director)"
            className="px-3 py-2 bg-[#ffffff] border border-[#d9d9d4] text-xs text-[#0e0e0e]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RUBRIC_FIELDS.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-3 p-2.5 bg-[#ffffff] border border-[#d9d9d4]"
            >
              <span className="text-xs font-semibold text-[#0e0e0e]">
                {f.label}
              </span>
              <select
                value={scores[f.key]}
                onChange={(e) =>
                  setScores((prev) => ({
                    ...prev,
                    [f.key]: Number(e.target.value),
                  }))
                }
                className="font-mono text-xs font-bold px-2 py-1 border border-[#0e0e0e] bg-[#f7f7f2]"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional vetting notes or revision guidance..."
          className="w-full px-3 py-2 bg-[#ffffff] border border-[#d9d9d4] text-xs text-[#0e0e0e]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#e3ee32] hover:bg-[#d8e324] disabled:opacity-60 border border-[#0e0e0e] text-[#0e0e0e] text-xs font-bold uppercase tracking-wider"
          >
            {saving ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            Record SME Sign-Off
          </button>
          {feedback && (
            <span className="text-xs font-semibold text-[#0e0e0e]">
              {feedback}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
