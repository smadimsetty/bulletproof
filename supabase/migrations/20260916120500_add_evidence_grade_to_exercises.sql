alter table exercises
  add column evidence_grade text check (evidence_grade in ('A', 'B', 'C', 'D'));
