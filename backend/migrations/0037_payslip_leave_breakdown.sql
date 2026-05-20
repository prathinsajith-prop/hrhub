-- Surface unpaid-leave (LOP) and sick-half-pay deductions as their own
-- itemised columns on payslips, instead of folding them into a single
-- opaque `deductions` total. The runPayroll engine already computes both
-- (see payroll.service.ts — `unpaidDeduction` and `sickHalfPayDeduction`),
-- but persisted nothing about the split, which made the employee-facing
-- payslip view show only "Unpaid leave / sick-half-pay / other" without
-- any way to attribute the amount.
--
-- All four columns default to 0 so historical payslips remain valid; the
-- `deductions` column stays as the canonical total for any consumer that
-- only cares about the sum.

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS unpaid_leave_days integer NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS unpaid_leave_deduction numeric(12,2) NOT NULL DEFAULT '0';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS sick_half_pay_days integer NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS sick_half_pay_deduction numeric(12,2) NOT NULL DEFAULT '0';
