export type MotionTemplate =
  | "host_intro"
  | "framework_triad"
  | "process_flow"
  | "stat_bars"
  | "comparison_split"
  | "code_demo"
  | "timeline_steps"
  | "host_recap"
  // Legacy compatibility
  | "title_hook"
  | "concept_cards"
  | "code_walkthrough"
  | "flow_diagram"
  | "comparison"
  | "takeaways";

export interface StatItem {
  label: string;
  percent: number;
  highlight?: boolean;
}

export interface VideoScene {
  sceneNumber: number;
  template?: MotionTemplate;
  heading?: string;
  subtitle?: string | null;
  bullets?: string[];
  codeSnippet?: string | null;
  defenseLabel?: string | null;
  stats?: StatItem[];
  narration: string;
  visualPrompt: string;
  durationSec: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export type VideoStatus = "pending" | "queued" | "processing" | "ready" | "failed";

export interface AssetLicense {
  asset_id: string;
  asset_type: string;
  file_path: string;
  alt_text: string;
  source: string;
  license: string;
  author: string;
  date: string;
  prompt?: string;
}

export interface QaReport {
  passed: boolean;
  failures: string[];
  total_duration_sec: number;
  scene_count: number;
  asset_count: number;
  pipeline_version?: string;
}

export interface SmeReview {
  reviewerName: string;
  reviewerTitle?: string;
  reviewedAt: string;
  scores: {
    hook: number;
    variety: number;
    clarity: number;
    visualFit: number;
    sync: number;
    mobileReadability: number;
    depth: number;
    accuracy: number;
  };
  averageScore: number;
  approved: boolean;
  notes?: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  orderIndex: number;
  contentMarkdown: string;
  keyTakeaways: string[];
  codeExample: string | null;
  codeLanguage: string | null;
  quiz: QuizQuestion[];
  videoStoryboard: VideoScene[];
  videoStatus: VideoStatus;
  videoUrl: string | null;
  portraitVideoUrl?: string | null;
  subtitleUrl: string | null;
  transcriptText?: string | null;
  licenses?: AssetLicense[];
  qaReport?: QaReport | null;
  smeReview?: SmeReview | null;
  videoModel: string;
  videoError: string | null;
  completed: boolean;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  orderIndex: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  topic: string;
  description: string;
  level: string;
  estimatedHours: number;
  createdAt: string;
  modules: CourseModule[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  topic: string;
  description: string;
  level: string;
  estimatedHours: number;
  createdAt: string;
  moduleCount: number;
  lessonCount: number;
  completedLessons: number;
  readyVideos: number;
}

export interface GeneratedCoursePayload {
  title: string;
  description: string;
  estimatedHours: number;
  modules: {
    title: string;
    summary: string;
    lessons: {
      title: string;
      contentMarkdown: string;
      keyTakeaways: string[];
      codeExample?: string | null;
      codeLanguage?: string | null;
      quiz: QuizQuestion[];
      videoStoryboard: VideoScene[];
    }[];
  }[];
}
