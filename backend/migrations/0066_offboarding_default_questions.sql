-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0066 — Default exit-interview questions
--
-- Back-fills the standard 13-question exit interview template for every
-- tenant that currently has no questions configured. Mirrors the lazy seed
-- in offboardingFlow/offboarding.defaults.ts so live tenants don't have to
-- visit the page first to get the defaults.
--
-- Idempotent: the WHERE NOT EXISTS guard skips any tenant that has already
-- added at least one question.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO offboarding_interview_questions
    (tenant_id, question_text, question_type, required, position, is_active)
SELECT t.id, q.question_text, q.question_type, false, q.position, true
FROM tenants t
CROSS JOIN (VALUES
    (0, 'In your role in the organization, what aspects did you find to be the most engaging, and what areas did you find to be of least significance?', 'long_text'),
    (1, 'If you could change one thing about your experience here, what would it be?', 'long_text'),
    (2, 'Did you feel well-supported by your manager and colleagues?', 'yes_no'),
    (3, 'Was the workload and work-life balance manageable in your role?', 'long_text'),
    (4, 'Is there anything else you''d like to share about your experience?', 'long_text'),
    (5, 'What changes could we have made that would have encouraged you to stay employed here?', 'long_text'),
    (6, 'Would you recommend this company to your family or friends?', 'long_text'),
    (7, 'What are some of the aspects you enjoyed while working with us?', 'long_text'),
    (8, 'Rate your experience between 1 and 10. With 1 being the lowest and 10 being the highest.', 'rating'),
    (9, 'Did you have good opportunities to develop and improve?', 'long_text'),
    (10, 'Did you feel valued as an employee?', 'yes_no'),
    (11, 'Were you satisfied with the compensation (salary) and benefits received?', 'yes_no'),
    (12, 'Did your manager acknowledge your feedback?', 'yes_no')
) AS q(position, question_text, question_type)
WHERE NOT EXISTS (
    SELECT 1 FROM offboarding_interview_questions q2
    WHERE q2.tenant_id = t.id
);
