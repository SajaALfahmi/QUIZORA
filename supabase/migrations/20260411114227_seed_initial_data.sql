-- Seed initial courses, skills, and sample questions
-- This migration creates the basic data structure for the quiz application

-- Insert courses
INSERT INTO public.courses (id, category, sub_category, title, description, is_active) VALUES
('455159fc-0c91-445e-a3b3-650d0727f1f7', 'qudurat', 'verbal', 'Qudurat - Verbal', 'Verbal reasoning and reading comprehension practice', true),
('954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f', 'qudurat', 'quantitative', 'Qudurat - Quantitative', 'Quantitative reasoning and mathematical problem solving', true),
('9127a8c4-1d22-4d29-a5e9-3530ded07534', 'tahseeli', 'mathematics', 'Tahseeli - Mathematics', 'High school mathematics curriculum preparation', true),
('c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf', 'tahseeli', 'physics', 'Tahseeli - Physics', 'High school physics curriculum preparation', true),
('7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9', 'tahseeli', 'chemistry', 'Tahseeli - Chemistry', 'High school chemistry curriculum preparation', true),
('f8f8a675-09ea-4179-b4f8-b32a2b232fbc', 'tahseeli', 'biology', 'Tahseeli - Biology', 'High school biology curriculum preparation', true),
('48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864', 'certifications', 'ccna', 'CCNA', 'Cisco Certified Network Associate certification prep', true),
('84c82536-ff63-4663-9fa4-7f3818f48e1b', 'certifications', 'security', 'CompTIA Security+', 'CompTIA Security+ certification preparation', true),
('28ce9f52-455c-431d-9e5a-caa107a97fa5', 'certifications', 'aws', 'AWS Cloud Practitioner', 'AWS Cloud Practitioner certification prep', true),
('304a9f8b-a018-4d8e-a0ff-9889e4b4b635', 'certifications', 'pmp', 'PMP', 'Project Management Professional certification preparation', true);

-- Insert skills for each course
INSERT INTO public.skills (course_id, name, description, order_index) VALUES
-- Qudurat Verbal
('455159fc-0c91-445e-a3b3-650d0727f1f7', 'Verbal Reasoning', 'Understanding and analyzing written information', 0),
-- Qudurat Quantitative
('954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f', 'Quantitative Reasoning', 'Mathematical problem solving and logical thinking', 0),
-- Mathematics
('9127a8c4-1d22-4d29-a5e9-3530ded07534', 'Mathematics Fundamentals', 'Basic mathematical concepts and operations', 0),
-- Physics
('c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf', 'Physics Fundamentals', 'Basic physics concepts and principles', 0),
-- Chemistry
('7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9', 'Chemistry Fundamentals', 'Basic chemistry concepts and reactions', 0),
-- Biology
('f8f8a675-09ea-4179-b4f8-b32a2b232fbc', 'Biology Fundamentals', 'Basic biology concepts and life processes', 0),
-- CCNA
('48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864', 'Network Fundamentals', 'Basic networking concepts and protocols', 0),
-- Security+
('84c82536-ff63-4663-9fa4-7f3818f48e1b', 'Security Fundamentals', 'Basic cybersecurity concepts and practices', 0),
-- AWS
('28ce9f52-455c-431d-9e5a-caa107a97fa5', 'Cloud Fundamentals', 'Basic cloud computing concepts and AWS services', 0),
-- PMP
('304a9f8b-a018-4d8e-a0ff-9889e4b4b635', 'Project Management', 'Basic project management concepts and methodologies', 0);

-- Insert sample questions for each course
-- Verbal Reasoning Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '455159fc-0c91-445e-a3b3-650d0727f1f7' LIMIT 1), '455159fc-0c91-445e-a3b3-650d0727f1f7',
 'ما هو المعنى الأقرب لكلمة "مثابرة"؟',
 'المثابرة تعني الاستمرار في العمل رغم الصعوبات. الخيار الصحيح هو "الإصرار" لأنه يعبر عن نفس المفهوم.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '455159fc-0c91-445e-a3b3-650d0727f1f7' LIMIT 1), 'الكسل', false, 0),
((SELECT id FROM public.questions WHERE course_id = '455159fc-0c91-445e-a3b3-650d0727f1f7' LIMIT 1), 'الإصرار', true, 1),
((SELECT id FROM public.questions WHERE course_id = '455159fc-0c91-445e-a3b3-650d0727f1f7' LIMIT 1), 'السرعة', false, 2),
((SELECT id FROM public.questions WHERE course_id = '455159fc-0c91-445e-a3b3-650d0727f1f7' LIMIT 1), 'النسيان', false, 3);

-- Quantitative Reasoning Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f' LIMIT 1), '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f',
 'إذا كان لديك 12 تفاحة وأعطيت 4 أصدقاء 3 تفاحات لكل منهم، كم تفاحة تبقت لديك؟',
 'العدد الإجمالي المعطى = 4 أصدقاء × 3 تفاحات = 12 تفاحة. التفاحات المتبقية = 12 - 12 = 0.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f' LIMIT 1), '0', true, 0),
((SELECT id FROM public.questions WHERE course_id = '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f' LIMIT 1), '3', false, 1),
((SELECT id FROM public.questions WHERE course_id = '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f' LIMIT 1), '4', false, 2),
((SELECT id FROM public.questions WHERE course_id = '954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f' LIMIT 1), '12', false, 3);

-- Mathematics Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '9127a8c4-1d22-4d29-a5e9-3530ded07534' LIMIT 1), '9127a8c4-1d22-4d29-a5e9-3530ded07534',
 'ما هو حل معادلة x + 5 = 12؟',
 'لإيجاد x، نطرح 5 من الجانبين: x + 5 - 5 = 12 - 5 → x = 7.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '9127a8c4-1d22-4d29-a5e9-3530ded07534' LIMIT 1), 'x = 7', true, 0),
((SELECT id FROM public.questions WHERE course_id = '9127a8c4-1d22-4d29-a5e9-3530ded07534' LIMIT 1), 'x = 17', false, 1),
((SELECT id FROM public.questions WHERE course_id = '9127a8c4-1d22-4d29-a5e9-3530ded07534' LIMIT 1), 'x = 5', false, 2),
((SELECT id FROM public.questions WHERE course_id = '9127a8c4-1d22-4d29-a5e9-3530ded07534' LIMIT 1), 'x = 12', false, 3);

-- Physics Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf' LIMIT 1), 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf',
 'ما هي وحدة قياس الطاقة في النظام الدولي؟',
 'الجول (Joule) هي الوحدة الأساسية لقياس الطاقة في النظام الدولي للوحدات (SI).',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf' LIMIT 1), 'النيوتن', false, 0),
((SELECT id FROM public.questions WHERE course_id = 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf' LIMIT 1), 'الجول', true, 1),
((SELECT id FROM public.questions WHERE course_id = 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf' LIMIT 1), 'الواط', false, 2),
((SELECT id FROM public.questions WHERE course_id = 'c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf' LIMIT 1), 'الكيلوغرام', false, 3);

-- Chemistry Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9' LIMIT 1), '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9',
 'ما هو الرمز الكيميائي للأكسجين؟',
 'الرمز الكيميائي للأكسجين هو O، وهو يمثل عنصر الأكسجين في الجدول الدوري.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9' LIMIT 1), 'O', true, 0),
((SELECT id FROM public.questions WHERE course_id = '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9' LIMIT 1), 'Ox', false, 1),
((SELECT id FROM public.questions WHERE course_id = '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9' LIMIT 1), 'O2', false, 2),
((SELECT id FROM public.questions WHERE course_id = '7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9' LIMIT 1), 'H2O', false, 3);

-- Biology Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc' LIMIT 1), 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc',
 'ما هي الوحدة الأساسية للحياة؟',
 'الخلية هي الوحدة الأساسية للحياة، حيث تتكون جميع الكائنات الحية من خلايا.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc' LIMIT 1), 'الذرة', false, 0),
((SELECT id FROM public.questions WHERE course_id = 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc' LIMIT 1), 'الخلية', true, 1),
((SELECT id FROM public.questions WHERE course_id = 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc' LIMIT 1), 'الجزيء', false, 2),
((SELECT id FROM public.questions WHERE course_id = 'f8f8a675-09ea-4179-b4f8-b32a2b232fbc' LIMIT 1), 'الأنسجة', false, 3);

-- CCNA Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864' LIMIT 1), '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864',
 'ما هو بروتوكول TCP/IP المستخدم لإرسال البريد الإلكتروني؟',
 'SMTP (Simple Mail Transfer Protocol) هو البروتوكول المستخدم لإرسال البريد الإلكتروني عبر الإنترنت.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864' LIMIT 1), 'HTTP', false, 0),
((SELECT id FROM public.questions WHERE course_id = '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864' LIMIT 1), 'SMTP', true, 1),
((SELECT id FROM public.questions WHERE course_id = '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864' LIMIT 1), 'FTP', false, 2),
((SELECT id FROM public.questions WHERE course_id = '48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864' LIMIT 1), 'DNS', false, 3);

-- Security+ Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '84c82536-ff63-4663-9fa4-7f3818f48e1b' LIMIT 1), '84c82536-ff63-4663-9fa4-7f3818f48e1b',
 'ما هو نوع الهجوم الذي يحاول فيه المهاجم الوصول إلى معلومات حساسة من خلال انتحال شخصية موثوقة؟',
 'الهندسة الاجتماعية هي تقنية تستخدم لخداع الأشخاص للكشف عن معلومات حساسة.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '84c82536-ff63-4663-9fa4-7f3818f48e1b' LIMIT 1), 'الهندسة الاجتماعية', true, 0),
((SELECT id FROM public.questions WHERE course_id = '84c82536-ff63-4663-9fa4-7f3818f48e1b' LIMIT 1), 'حقن SQL', false, 1),
((SELECT id FROM public.questions WHERE course_id = '84c82536-ff63-4663-9fa4-7f3818f48e1b' LIMIT 1), 'هجوم DDoS', false, 2),
((SELECT id FROM public.questions WHERE course_id = '84c82536-ff63-4663-9fa4-7f3818f48e1b' LIMIT 1), 'تشفير البيانات', false, 3);

-- AWS Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '28ce9f52-455c-431d-9e5a-caa107a97fa5' LIMIT 1), '28ce9f52-455c-431d-9e5a-caa107a97fa5',
 'ما هي خدمة AWS المستخدمة لتخزين الملفات؟',
 'Amazon S3 (Simple Storage Service) هي خدمة تخزين كائنات قابلة للتوسع في AWS.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '28ce9f52-455c-431d-9e5a-caa107a97fa5' LIMIT 1), 'EC2', false, 0),
((SELECT id FROM public.questions WHERE course_id = '28ce9f52-455c-431d-9e5a-caa107a97fa5' LIMIT 1), 'S3', true, 1),
((SELECT id FROM public.questions WHERE course_id = '28ce9f52-455c-431d-9e5a-caa107a97fa5' LIMIT 1), 'RDS', false, 2),
((SELECT id FROM public.questions WHERE course_id = '28ce9f52-455c-431d-9e5a-caa107a97fa5' LIMIT 1), 'Lambda', false, 3);

-- PMP Question
INSERT INTO public.questions (skill_id, course_id, content, explanation, difficulty, is_ai_generated) VALUES
((SELECT id FROM public.skills WHERE course_id = '304a9f8b-a018-4d8e-a0ff-9889e4b4b635' LIMIT 1), '304a9f8b-a018-4d8e-a0ff-9889e4b4b635',
 'ما هو نموذج إدارة المشاريع الذي يركز على التسليم التدريجي والتعاون؟',
 'Agile هو منهجية إدارة المشاريع التي تركز على التسليم التدريجي والتعاون المستمر.',
 'easy', false);

INSERT INTO public.answer_options (question_id, content, is_correct, order_index) VALUES
((SELECT id FROM public.questions WHERE course_id = '304a9f8b-a018-4d8e-a0ff-9889e4b4b635' LIMIT 1), 'Waterfall', false, 0),
((SELECT id FROM public.questions WHERE course_id = '304a9f8b-a018-4d8e-a0ff-9889e4b4b635' LIMIT 1), 'Agile', true, 1),
((SELECT id FROM public.questions WHERE course_id = '304a9f8b-a018-4d8e-a0ff-9889e4b4b635' LIMIT 1), 'PRINCE2', false, 2),
((SELECT id FROM public.questions WHERE course_id = '304a9f8b-a018-4d8e-a0ff-9889e4b4b635' LIMIT 1), 'Six Sigma', false, 3);