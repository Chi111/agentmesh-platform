-- Only newly created API missions opt in. Existing missions retain legacy delivery rules.
CREATE TABLE IF NOT EXISTS mission_delivery_policies (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  policy TEXT NOT NULL CHECK (policy IN ('legacy', 'outcome_v1'))
);
