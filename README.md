# QUIZORA

Quizora is an AI-powered adaptive learning platform designed to help students prepare for Saudi standardized exams and professional certifications through personalized practice questions and intelligent difficulty adjustment using Bayesian Knowledge Tracing (BKT).

The platform focuses on:
- **Qudurat** — General Aptitude Test (Verbal & Quantitative)
- **Tahseeli** — Achievement Test (Chemistry, Biology)
- **Professional Certifications** — CCNA, CompTIA Security+, AWS Cloud Practitioner, PMP

---

## Demo

### 🌐 Live Application
[https://quizora-five.vercel.app](https://quizora-five.vercel.app)
Try the platform yourself, including the Policy Scenario Analysis feature.

### 🎥 Video Walkthrough
[Watch on YouTube](https://youtu.be/tnIiUh0Z9hs)
A guided walkthrough of QUIZORA and the AI Readiness Assessment Assistant.

### 📚 Knowledge Base
[View archive](https://github.com/SajaALfahmi/QUIZORA/blob/0112bdb47854ea1d84de71459335264ed4ab9d96/KnowledgeBase%20(compressed).zip) — the 12 authentic policy/standards documents used by the AI Readiness Assessment Assistant.

---

## Features

### Adaptive Learning Engine (BKT)
Quizora uses Bayesian Knowledge Tracing to:
- Track user mastery levels per skill
- Analyze correct/incorrect answers after every response
- Adjust question difficulty dynamically (Easy → Medium → Hard)
- Personalize each learning session based on accumulated performance

### AI Question Generation
The system integrates with OpenAI GPT-4o-mini to:
- Generate multiple-choice questions in Arabic and English
- Create detailed educational explanations per question
- Produce questions across three difficulty levels
- Avoid duplicate questions using a 50-question threshold per course

### AI Chatbot Assistant
- Real-time conversational support during learning sessions
- Supports both Arabic and English
- Powered by OpenAI GPT-4o-mini via Supabase Edge Functions

### Performance Analytics
- Detailed reports per course and skill
- Visual progress charts
- Strength and weakness identification

### Policy Scenario Analysis (AI Readiness Assessment)
- Lets an institutional user describe an AI-use-case scenario and receive a readiness assessment grounded in a 12-document Knowledge Base (ITU, UNESCO, SDAIA, ETEC, OECD, NDMO)
- Mapped to the ITU-T Y.3172 pipeline, with cited policy gaps and recommendations
- RAG-based: pgvector semantic search over the Knowledge Base + GPT-4o-mini synthesis via the `analyze-scenario` Edge Function

---

## Tech Stack

### Frontend
- React 18
- TypeScript
- Tailwind CSS + shadcn/ui (Radix UI)
- Vite

### Backend
- Supabase (PostgreSQL + Auth + Edge Functions)
- Deno runtime for Edge Functions
- JWT-based authentication with Google OAuth support

### AI Integration
- OpenAI API — GPT-4o-mini

### Deployment
- Frontend: Vercel
- Backend: Supabase Cloud

---

## Project Structure

```
QUIZORA-main/
│
├── public/                        # Static assets (logo, robots.txt)
│
├── src/
│   ├── App.tsx                    # Root component and route definitions
│   ├── main.tsx                   # App entry point
│   │
│   ├── components/                # All UI pages and components
│   │   ├── LandingPage.tsx        # Public landing/home page
│   │   ├── AuthPage.tsx           # Login and registration
│   │   ├── ResetPasswordPage.tsx  # Password reset flow
│   │   ├── Dashboard.tsx          # User dashboard with stats
│   │   ├── CoursesPage.tsx        # Browse available courses
│   │   ├── CourseDetailPage.tsx   # Course detail and skill breakdown
│   │   ├── QuestionsPage.tsx      # Active quiz/question session
│   │   ├── EvaluationPage.tsx     # Post-quiz evaluation and feedback
│   │   ├── ContinueLearningPage.tsx # Resume previous sessions
│   │   ├── ReportsPage.tsx        # Performance reports and analytics
│   │   ├── ProfilePage.tsx        # User profile management
│   │   ├── SettingsPage.tsx       # App settings (language, theme)
│   │   ├── ScenarioAnalysisPage.tsx # Policy Scenario Analysis UI
│   │   ├── ChatBot.tsx            # Floating AI chatbot widget
│   │   ├── ProtectedRoute.tsx     # Auth guard for protected routes
│   │   │
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      # Main authenticated layout wrapper
│   │   │   ├── AppSidebar.tsx     # Navigation sidebar
│   │   │   └── AppTopbar.tsx      # Top navigation bar
│   │   │
│   │   └── ui/                    # shadcn/ui reusable components
│   │       └── (button, card, dialog, table, chart, ...)
│   │
│   ├── pages/
│   │   ├── Index.tsx              # Root page redirect
│   │   └── NotFound.tsx           # 404 page
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Global auth state (user session)
│   │   └── LanguageContext.tsx    # Arabic/English language toggle
│   │
│   ├── hooks/
│   │   ├── useUserStats.ts        # Hook for fetching user stats
│   │   ├── use-toast.ts           # Toast notification hook
│   │   └── use-mobile.tsx         # Responsive breakpoint hook
│   │
│   ├── services/
│   │   └── adaptiveEngine.ts      # Client-side calls to adaptive-engine Edge Function
│   │
│   └── integrations/
│       └── supabase/
│           ├── client.ts          # Supabase client initialization
│           └── types.ts           # Auto-generated database types
│
├── supabase/
│   ├── config.toml                # Supabase project configuration
│   │
│   ├── functions/
│   │   ├── adaptive-engine/       # Main BKT engine: start session, submit answer,
│   │   │   └── index.ts           #   next question, end session, AI question generation
│   │   ├── generate-questions/    # On-demand question generation for a specific skill
│   │   │   └── index.ts
│   │   ├── generate-explanation/  # Generate or regenerate AI explanation for a question
│   │   │   └── index.ts
│   │   ├── review-questions/      # Batch AI review and difficulty correction of questions
│   │   │   └── index.ts
│   │   └── analyze-scenario/      # RAG-based scenario analysis (pgvector retrieval + GPT-4o-mini)
│   │       └── index.ts
│   │
│   └── migrations/
│       ├── ..._seed_initial_data.sql   # Database schema and initial seed data
│       └── ...                         # Additional migrations
│
├── scripts/                       # Knowledge Base ingestion pipeline
│   ├── ingest-knowledge-base.mjs  # Embeds and loads KB chunks into pgvector
│   ├── validate-knowledge-base.mjs # Validates KB chunk structure before ingestion
│   └── verify-ingestion.mjs       # Verifies ingested chunk counts/integrity
│
├── data/
│   └── quizora_kb_chunks.jsonl    # Knowledge Base dataset (719 chunks, 12 documents)
│
├── .env                           # Environment variables (not committed)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Prerequisites

Before running the project, make sure you have:

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Supabase** project — [supabase.com](https://supabase.com)
- An **OpenAI API key** — [platform.openai.com](https://platform.openai.com)
- **Supabase CLI** (for deploying Edge Functions) — install via:
  ```bash
  npm install -g supabase
  ```

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

> **Note:** `OPENAI_API_KEY` is used inside Supabase Edge Functions, not the frontend. Set it as a Supabase secret (see Deployment section).

---

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/SajaALfahmi/QUIZORA.git
cd QUIZORA
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
# Then fill in your Supabase URL and anon key
```

### 4. Apply database migrations

```bash
supabase login
supabase link --project-ref your_project_ref
supabase db push
```

### 5. Deploy Edge Functions

```bash
supabase functions deploy adaptive-engine
supabase functions deploy generate-questions
supabase functions deploy generate-explanation
supabase functions deploy review-questions
supabase functions deploy analyze-scenario
```

### 6. Set Edge Function secrets

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
```

### 7. Run the development server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

---

## Supported Courses

### Qudurat (General Aptitude Test)
| Sub-category | Description |
|---|---|
| Verbal | Verbal reasoning questions |
| Quantitative | Quantitative/numerical reasoning |

### Tahseeli (Achievement Test)
| Sub-category | Description |
|---|---|
| Chemistry | High school chemistry |
| Biology | High school biology |

### Professional Certifications
| Certification | Description |
|---|---|
| CCNA | Cisco Certified Network Associate |
| CompTIA Security+ | Cybersecurity fundamentals |
| AWS Cloud Practitioner | AWS cloud concepts |
| PMP | Project Management Professional |

---

## Adaptive Difficulty Logic (BKT)

Difficulty is selected based on the user's mastery level, updated after every answer:

| Mastery Level | Assigned Difficulty |
|---|---|
| ≥ 0.7 | Hard |
| 0.4 – 0.69 | Medium |
| < 0.4 | Easy |

**BKT Parameters used:**

| Parameter | Value | Description |
|---|---|---|
| P_L0 | 0.3 | Initial knowledge probability |
| P_T | 0.15 | Learning transition probability |
| P_G | 0.2 | Guess probability |
| P_S | 0.1 | Slip probability |

New questions are AI-generated automatically when the question pool for a course **falls below 50 questions**, with 25 questions generated per difficulty level.

---

## Deployment

### Frontend (Vercel)

1. Push your code to GitHub
2. Connect the repository to [Vercel](https://vercel.com)
3. Add the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in Vercel project settings
4. Deploy

### Backend (Supabase)

Edge Functions are deployed via the Supabase CLI:

```bash
supabase functions deploy adaptive-engine
supabase functions deploy generate-questions
supabase functions deploy generate-explanation
supabase functions deploy review-questions
supabase functions deploy analyze-scenario
```

Set the OpenAI secret:
```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
```

---

## Team

Name 

-**Saja Alfahmi**-
-**Arwa Alroqi**-
-**Ritaj Alharthi**- 
-**Lana Alamir**-

**Project Advisor:** Dr.Mohammed Ikram  
**University:** Umm Al-Qura University — Jamoum University College  
**Department:** Computer Science  
**Academic Year:** 2025/2026

---

## Future Improvements

- Dynamic course expansion by administrators (without code changes)
- Smarter AI cost management via caching and batch scheduling
- Mobile application (Android & iOS) with offline support
- Advanced predictive analytics dashboard
- Multimedia learning materials (videos, diagrams)
- Expanded multilingual and accessibility support
- Gamification system

---

## License

This project was developed as a Graduation Project (2025-2026) and is licensed under the [MIT License](./LICENSE).


