BEGIN;

-- Enforces, at transaction commit time, that every question with at least
-- one surviving answer_options row has exactly 4 options, exactly 1 marked
-- correct, and no duplicate option text. Deliberately a DEFERRABLE
-- INITIALLY DEFERRED constraint trigger (not an immediate one) so that
-- legitimate multi-statement work within one transaction - e.g. flipping
-- is_correct on one row true and another false as two separate UPDATEs -
-- is only checked once, at the end, against the final state. Skips
-- validation entirely for a question_id whose parent question row no
-- longer exists (i.e. it was deleted, cascading here too) - a deleted
-- question rightfully has zero options.
CREATE OR REPLACE FUNCTION public.validate_answer_options_invariants()
RETURNS trigger AS $$
DECLARE
  affected_question_id uuid;
  option_count int;
  correct_count int;
  dup_count int;
BEGIN
  affected_question_id := COALESCE(NEW.question_id, OLD.question_id);

  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = affected_question_id) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct)
    INTO option_count, correct_count
  FROM public.answer_options
  WHERE question_id = affected_question_id;

  IF option_count <> 4 THEN
    RAISE EXCEPTION 'Question % must have exactly 4 answer options, has %', affected_question_id, option_count;
  END IF;

  IF correct_count <> 1 THEN
    RAISE EXCEPTION 'Question % must have exactly 1 correct answer option, has %', affected_question_id, correct_count;
  END IF;

  SELECT COUNT(*) INTO dup_count FROM (
    SELECT lower(trim(content)) AS norm
    FROM public.answer_options
    WHERE question_id = affected_question_id
    GROUP BY lower(trim(content))
    HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Question % has duplicate answer option text', affected_question_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS answer_options_invariants ON public.answer_options;

CREATE CONSTRAINT TRIGGER answer_options_invariants
AFTER INSERT OR UPDATE OR DELETE ON public.answer_options
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_answer_options_invariants();

COMMIT;
