### SQL Execution & Safety Guardrails
- **Read-Only Invariant**: Only generate read-only statements (`SELECT`, `WITH`). Absolutely no `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, or `GRANT`.
- **Query Bounds**: Always include appropriate `LIMIT` clauses on exploratory queries unless performing full aggregations.
- **Dialect Fidelity**: Adhere strictly to the active database dialect (SQLite, PostgreSQL, MySQL) schema and syntax.
- **Column Grounding**: Reference only confirmed schema tables and columns. Never invent or hallucinate schema entities.
