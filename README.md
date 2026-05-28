# Quizora 

Quizora is an AI-powered adaptive learning platform designed to help students prepare for Saudi standardized exams and professional certifications through personalized practice questions and intelligent difficulty adjustment.

The platform focuses on:
- Qudurat (General Aptitude Test)
- Tahseeli (Achievement Test)
- Professional Certifications (CCNA, Security+, AWS, PMP)

---

# Features

## Adaptive Learning Engine
Quizora uses an adaptive engine based on BKT (Bayesian Knowledge Tracing) to:
- Track user mastery levels
- Analyze correct/incorrect answers
- Adjust question difficulty dynamically
- Personalize learning sessions

---

## AI Question Generation
The system integrates with OpenAI to:
- Generate new Arabic multiple-choice questions
- Create educational explanations
- Produce questions with different difficulty levels
- Avoid duplicate questions

---

## Supported Categories

### Qudurat
- Verbal Section
- Quantitative Section

### Tahseeli
- Mathematics
- Physics
- Chemistry
- Biology

### Professional Certifications
- CCNA
- CompTIA Security+
- AWS Cloud Practitioner
- PMP

---

# Tech Stack

## Frontend
- React
- TypeScript
- TailwindCSS
- Vite

## Backend
- Supabase
- Supabase Edge Functions
- PostgreSQL

## AI Integration
- OpenAI API (GPT-4o-mini)

---

# Main System Components

## Adaptive Engine
Responsible for:
- Starting learning sessions
- Selecting next questions
- Updating mastery levels
- Ending sessions

## AI Question Generator
Responsible for:
- Generating new questions
- Creating explanations
- Producing difficulty-based content

---

# Adaptive Difficulty Logic

Difficulty is selected using mastery levels:

- Easy → Beginner mastery
- Medium → Intermediate mastery
- Hard → Advanced mastery

The system updates mastery after every answer using BKT formulas.

---

# Project Structure

```bash
Quizora/
│
├── src/
│   ├── pages/
│   ├── components/
│   ├── services/
│   └── integrations/
│
├── supabase/
│   └── functions/
│       ├── adaptive-engine/
│       ├── generate-questions/
│       └── generate-explanation/
│
└── README.md
```

---

# Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

---

# Running The Project

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Deploy Supabase functions:

```bash
supabase functions deploy adaptive-engine
supabase functions deploy generate-questions
supabase functions deploy generate-explanation
```

---

# Deployment

## Frontend
- Vercel

## Backend
- Supabase Edge Functions

---

# Team Project

Saja AlFahmi
Arwa AlRoqi
Ritaj Alharthi
Lana Alamir

---

# Future Improvements

- Smarter AI-generated questions
- Better Qudurat-style datasets
- Performance analytics dashboard
- Voice support for accessibility
- Gamification system
- Arabic NLP improvements

---

# License

This project is for educational purposes only.
