// Centralized, reusable language-display logic for database-sourced content
// (course names, skill names) whose underlying DB row only ever stores a
// single, fixed-language string. This is a temporary frontend mitigation —
// the durable fix is a schema change (e.g. title_en/title_ar columns),
// which is explicitly out of scope until a migration is separately approved.
//
// This module only resolves raw stored values to translation keys and
// defers to LanguageContext's t() for the actual text — it is not a
// second translation dictionary. No Arabic/English literal strings are
// stored here as *output* values, only as *lookup keys* matching what may
// already be stored in the database.
//
// Any lookup miss falls back to the raw stored value and logs a warning,
// so coverage gaps are visible instead of silently wrong.

const COURSE_ID_TO_KEY: Record<string, string> = {
  "455159fc-0c91-445e-a3b3-650d0727f1f7": "course.qudurat_verbal",
  "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f": "course.qudurat_quantitative",
  "9127a8c4-1d22-4d29-a5e9-3530ded07534": "course.tahseeli_math",
  "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf": "course.tahseeli_physics",
  "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9": "course.tahseeli_chemistry",
  "f8f8a675-09ea-4179-b4f8-b32a2b232fbc": "course.tahseeli_biology",
  "a1b2c3d4-0001-0001-0001-000000000001": "course.tahseeli_geography",
  "a1b2c3d4-0002-0002-0002-000000000002": "course.tahseeli_arabic",
  "a1b2c3d4-0003-0003-0003-000000000003": "course.tahseeli_islamic",
  "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864": "course.ccna",
  "84c82536-ff63-4663-9fa4-7f3818f48e1b": "course.security_plus",
  "28ce9f52-455c-431d-9e5a-caa107a97fa5": "course.aws_ccp",
  "304a9f8b-a018-4d8e-a0ff-9889e4b4b635": "course.pmp",
};

// Secondary lookup by the raw stored title, for defense-in-depth when a
// caller doesn't have the course id at hand.
const COURSE_TITLE_TO_KEY: Record<string, string> = {
  "Qudurat - Verbal": "course.qudurat_verbal",
  "Qudurat - Quantitative": "course.qudurat_quantitative",
  "Tahseeli - Mathematics": "course.tahseeli_math",
  "Tahseeli - Physics": "course.tahseeli_physics",
  "Tahseeli - Chemistry": "course.tahseeli_chemistry",
  "Tahseeli - Biology": "course.tahseeli_biology",
  "Tahseeli - Geography": "course.tahseeli_geography",
  "Tahseeli - Arabic Language": "course.tahseeli_arabic",
  "Tahseeli - Islamic Studies": "course.tahseeli_islamic",
  "CCNA": "course.ccna",
  "CompTIA Security+": "course.security_plus",
  "AWS Cloud Practitioner": "course.aws_ccp",
  "PMP": "course.pmp",
};

// Same id/title -> key mapping as above, but pointing at each course's
// "_desc" translation key instead of its name key.
const COURSE_ID_TO_DESC_KEY: Record<string, string> = {
  "455159fc-0c91-445e-a3b3-650d0727f1f7": "course.qudurat_verbal_desc",
  "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f": "course.qudurat_quantitative_desc",
  "9127a8c4-1d22-4d29-a5e9-3530ded07534": "course.tahseeli_math_desc",
  "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf": "course.tahseeli_physics_desc",
  "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9": "course.tahseeli_chemistry_desc",
  "f8f8a675-09ea-4179-b4f8-b32a2b232fbc": "course.tahseeli_biology_desc",
  "a1b2c3d4-0001-0001-0001-000000000001": "course.tahseeli_geography_desc",
  "a1b2c3d4-0002-0002-0002-000000000002": "course.tahseeli_arabic_desc",
  "a1b2c3d4-0003-0003-0003-000000000003": "course.tahseeli_islamic_desc",
  "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864": "course.ccna_desc",
  "84c82536-ff63-4663-9fa4-7f3818f48e1b": "course.security_plus_desc",
  "28ce9f52-455c-431d-9e5a-caa107a97fa5": "course.aws_ccp_desc",
  "304a9f8b-a018-4d8e-a0ff-9889e4b4b635": "course.pmp_desc",
};

const COURSE_TITLE_TO_DESC_KEY: Record<string, string> = {
  "Qudurat - Verbal": "course.qudurat_verbal_desc",
  "Qudurat - Quantitative": "course.qudurat_quantitative_desc",
  "Tahseeli - Mathematics": "course.tahseeli_math_desc",
  "Tahseeli - Physics": "course.tahseeli_physics_desc",
  "Tahseeli - Chemistry": "course.tahseeli_chemistry_desc",
  "Tahseeli - Biology": "course.tahseeli_biology_desc",
  "Tahseeli - Geography": "course.tahseeli_geography_desc",
  "Tahseeli - Arabic Language": "course.tahseeli_arabic_desc",
  "Tahseeli - Islamic Studies": "course.tahseeli_islamic_desc",
  "CCNA": "course.ccna_desc",
  "CompTIA Security+": "course.security_plus_desc",
  "AWS Cloud Practitioner": "course.aws_ccp_desc",
  "PMP": "course.pmp_desc",
};

// Maps a raw skill.name value, as it may currently be stored in either
// language, to the single translation key that resolves it correctly in
// both languages via LanguageContext's t().
const SKILL_NAME_TO_KEY: Record<string, string> = {
  // Actual stored skill.name values (lowercase subject + " Fundamentals"),
  // confirmed against the live skills table - this is the primary set that
  // real requests hit.
  "arabic Fundamentals": "skill.arabic_fundamentals",
  "aws Fundamentals": "skill.cloud_fundamentals",
  "biology Fundamentals": "skill.biology_fundamentals",
  "ccna Fundamentals": "skill.network_fundamentals",
  "chemistry Fundamentals": "skill.chemistry_fundamentals",
  "english Fundamentals": "skill.english_fundamentals",
  "geography Fundamentals": "skill.geography_fundamentals",
  "history Fundamentals": "skill.history_fundamentals",
  "islamic Fundamentals": "skill.islamic_fundamentals",
  "mathematics Fundamentals": "skill.mathematics_fundamentals",
  "physics Fundamentals": "skill.physics_fundamentals",
  "pmp Fundamentals": "skill.project_management",
  "quantitative Fundamentals": "skill.quantitative_reasoning",
  "security Fundamentals": "skill.security_fundamentals",
  "sociology Fundamentals": "skill.sociology_fundamentals",
  "verbal Fundamentals": "skill.verbal_reasoning",
  "Unknown": "skill.unknown",

  // Older/alternate forms kept for defense-in-depth in case any legacy row
  // or seed script still writes one of these instead of the form above.
  "Verbal Reasoning": "skill.verbal_reasoning",
  "التفكير اللفظي": "skill.verbal_reasoning",
  "Quantitative Reasoning": "skill.quantitative_reasoning",
  "التفكير الكمي": "skill.quantitative_reasoning",
  "Mathematics Fundamentals": "skill.mathematics_fundamentals",
  "أساسيات الرياضيات": "skill.mathematics_fundamentals",
  "Physics Fundamentals": "skill.physics_fundamentals",
  "أساسيات الفيزياء": "skill.physics_fundamentals",
  "Chemistry Fundamentals": "skill.chemistry_fundamentals",
  "أساسيات الكيمياء": "skill.chemistry_fundamentals",
  "Biology Fundamentals": "skill.biology_fundamentals",
  "أساسيات الأحياء": "skill.biology_fundamentals",
  "Network Fundamentals": "skill.network_fundamentals",
  "أساسيات الشبكات": "skill.network_fundamentals",
  "Security Fundamentals": "skill.security_fundamentals",
  "أساسيات الأمن السيبراني": "skill.security_fundamentals",
  "Cloud Fundamentals": "skill.cloud_fundamentals",
  "أساسيات الحوسبة السحابية": "skill.cloud_fundamentals",
  "Project Management": "skill.project_management",
  "إدارة المشاريع": "skill.project_management",
};

type Translate = (key: string) => string;

export function getLocalizedCourseName(
  course: { id?: string; title?: string | null },
  t: Translate
): string {
  const key =
    (course.id && COURSE_ID_TO_KEY[course.id]) ||
    (course.title && COURSE_TITLE_TO_KEY[course.title]);
  if (key) return t(key);
  if (course.title) {
    console.warn(`contentLocalization: no translation mapping for course "${course.title}" (id: ${course.id ?? "unknown"}) - showing as stored.`);
    return course.title;
  }
  return course.id ?? "";
}

export function getLocalizedCourseDescription(
  course: { id?: string; title?: string | null; description?: string | null },
  t: Translate
): string {
  const key =
    (course.id && COURSE_ID_TO_DESC_KEY[course.id]) ||
    (course.title && COURSE_TITLE_TO_DESC_KEY[course.title]);
  if (key) return t(key);
  if (course.description) {
    console.warn(`contentLocalization: no description translation mapping for course "${course.title}" (id: ${course.id ?? "unknown"}) - showing as stored.`);
    return course.description;
  }
  return "";
}

export function getLocalizedSkillName(rawName: string | null | undefined, t: Translate): string {
  if (!rawName) return "";
  const key = SKILL_NAME_TO_KEY[rawName];
  if (key) return t(key);
  console.warn(`contentLocalization: no translation mapping for skill "${rawName}" - showing as stored.`);
  return rawName;
}
