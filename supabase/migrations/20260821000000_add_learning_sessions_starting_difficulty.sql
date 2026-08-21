-- Additive, nullable snapshot of the auto-mode difficulty tier resolved
-- from the student's historical BKT mastery at the moment a session was
-- created. Frozen once at session start so the in-session difficulty
-- ladder (adaptive-engine handleNextQuestion) has a stable seed that
-- cannot drift mid-session as user_skill_levels.mastery_level keeps
-- updating from that same session's own answers. Manual-mode sessions
-- never populate this column. No backfill: historical sessions are
-- already completed and this column is never read for them.
ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS starting_difficulty text;
