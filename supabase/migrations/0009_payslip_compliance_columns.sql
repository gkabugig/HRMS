-- s.30 (sick leave full/half pay split) and s.19(3) (deduction cap) need
-- somewhere to record what happened on each payslip so HR can see it, not
-- just have it silently applied.

alter table payslips add column leave_deduction numeric(12,2) not null default 0;
alter table payslips add column deduction_capped boolean not null default false;
