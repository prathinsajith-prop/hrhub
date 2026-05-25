-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0067 — Exit-document body template + default letters
--
-- Adds a body_template column to offboarding_exit_documents so each letter
-- carries its own HTML body (rendered through {{var}} placeholders at exit
-- time). Then back-fills two defaults — Experience Letter and Relieving Letter
-- — for every tenant that hasn't already added documents.
--
-- Default templates use the variable vocabulary the workflow engine already
-- expands: {{companyName}}, {{employeeName}}, {{employeeNo}}, {{exitDate}},
-- {{lastWorkingDay}}, {{designation}}, {{joinDate}}, {{today}}.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE offboarding_exit_documents
    ADD COLUMN IF NOT EXISTS body_template text;

-- Seed defaults only for tenants with zero existing documents.
INSERT INTO offboarding_exit_documents
    (tenant_id, name, body_template, required, position, is_active)
SELECT t.id, d.name, d.body, d.required, d.position, true
FROM tenants t
CROSS JOIN (VALUES
    (0,
     'Experience Letter',
     true,
     E'<p style="text-align:right">{{today}}</p>\n<p>To whom it may concern,</p>\n<p>This is to certify that <strong>{{employeeName}}</strong>, employee number <strong>{{employeeNo}}</strong>, worked as <strong>{{designation}}</strong> in our organization from <strong>{{joinDate}}</strong> to <strong>{{lastWorkingDay}}</strong>.</p>\n<p>{{employeeName}} performed his/her/their role and responsibilities successfully.</p>\n<p>We are certain that he/she/they will be an asset to any organization.</p>\n<p>We wish you all success in your new endeavours.</p>\n<p>Sincerely,<br/>{{companyName}}<br/>HR Manager / HR Team</p>'),
    (1,
     'Relieving Letter',
     true,
     E'<p style="text-align:right">{{today}}</p>\n<p>Dear {{employeeName}},</p>\n<p>In response to your resignation letter, we would like to inform you that we accept your resignation.</p>\n<p>Your notice period will conclude on <strong>{{lastWorkingDay}}</strong>, following which you will be relieved from the service of the company at the close of business.</p>\n<p>We confirm that your full and final settlement has been cleared by the organization.</p>\n<p>We value your contribution to the success of the company.</p>\n<p>We wish you all success in your new endeavours.</p>\n<p>Sincerely,<br/>{{companyName}}<br/>HR Manager / HR Team</p>')
) AS d(position, name, required, body)
WHERE NOT EXISTS (
    SELECT 1 FROM offboarding_exit_documents x WHERE x.tenant_id = t.id
);
