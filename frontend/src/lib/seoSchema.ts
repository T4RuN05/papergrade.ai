export const SITE_URL = "https://www.papergradeai.in";
export const SITE_NAME = "PaperGrade AI";
export const SITE_EMAIL = "support@papergradeai.in";

export interface FaqEntry {
  question: string;
  answer: string;
}

export const PUBLIC_FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "What is PaperGrade AI?",
    answer:
      "PaperGrade AI is a handwritten answer sheet evaluation and academic workflow platform built for coaching institutes and schools. Students write subjective tests on paper and submit scanned scripts, while AI evaluates answers strictly against teacher-locked rubrics with bounding-box citations for fast faculty verification.",
  },
  {
    question: "How does AI grade handwritten subjective exams accurately?",
    answer:
      "Every evaluation follows an approved rubric locked by faculty before grading starts. Each criterion specifies exact point weights, model answers, accepted alternatives, and step-marking rules, and every awarded or deducted mark is mapped back to a visual bounding box on the student's scanned sheet.",
  },
  {
    question: "Do teachers keep final authority over scores and appeals?",
    answer:
      "Yes. Evaluated papers remain unpublished until faculty reviews flagged items, adjusts bounding boxes or criterion scores if needed, and clicks Publish Results. After publication, students can request question-level revaluation directly with cropped handwriting and audit trails.",
  },
  {
    question: "Which subjects and exam formats does PaperGrade AI support?",
    answer:
      "PaperGrade AI handles multi-page handwritten descriptive papers across Physics, Chemistry, Mathematics, Biology, and general board or competitive subjective exams—including equations, derivations, labeled diagrams, and optional best-of-N question sections.",
  },
  {
    question: "How do students submit answer sheets and view graded papers?",
    answer:
      "Students sign in to the PaperGrade Student Portal on their phone or browser, capture or upload their answer pages as a PDF during a timed submission window, and later inspect published annotated scripts, question breakdowns, class rankings, and subject trajectories.",
  },
  {
    question: "Can PaperGrade AI manage multiple coaching branches and batches?",
    answer:
      "Yes. PaperGrade supports multi-institute and multi-branch isolation with Role-Based Access for Institute Directors, Branch Managers, and Students, batch roster CSV imports, ranked standings exports, and optional personal Google Drive backup for graded student PDFs.",
  },
];

export function buildRootJsonLdGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        email: SITE_EMAIL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/icon-512.png`,
          width: 512,
          height: 512,
        },
        description:
          "AI-assisted handwritten subjective answer sheet grading and academic examination workflow platform for coaching institutes.",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en-IN",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web, iOS PWA, Android PWA",
        publisher: { "@id": `${SITE_URL}/#organization` },
        description:
          "Handwritten subjective answer sheet grading platform with teacher-locked rubrics, visual bounding-box citations, timed exam submission windows, multi-branch batch management, and audited student revaluation.",
        featureList: [
          "Handwritten subjective answer sheet evaluation",
          "Teacher-locked step-marking rubrics with best-of-N section rules",
          "Visual bounding-box score annotations per question on scanned PDFs",
          "Timed student mobile PWA scan-to-PDF submission windows",
          "Teacher-controlled revaluation and mark override audit trails",
          "Multi-branch coaching institute & batch roster management",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: PUBLIC_FAQ_ENTRIES.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
