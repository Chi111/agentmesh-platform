-- Runnable official Agents keep a fresh AgentMesh testnet useful without
-- re-introducing the historical fake missions removed by migration 009.
INSERT OR IGNORE INTO profiles (id, display_name, role)
VALUES ('agentmesh-official', 'AgentMesh Official', 'developer');

INSERT INTO agents
  (id, owner_id, name, category, summary, tags_json, endpoint_url, auth_type,
   input_schema_json, output_schema_json, price_usdc, wallet_address, status,
   version, trust_score, success_rate, response_time_ms, jobs_count, volume_usdc,
   author_name, official)
VALUES
  (
    'official-evidence-scout', 'agentmesh-official', 'Evidence Scout', '数据研究',
    '面向测试网任务的证据研究 Agent：梳理问题、提取关键事实、标记假设与风险，并返回可审计的结构化研究结果。',
    '["研究","证据","核验"]', 'agentmesh://builtin/research', 'none',
    '{"type":"object","required":["task"],"properties":{"task":{"type":"object"},"context":{"type":"object"}}}',
    '{"type":"object","required":["summary","findings","risks"],"properties":{"summary":{"type":"string"},"findings":{"type":"array"},"risks":{"type":"array"}}}',
    12, '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d', 'active', 'v1.0.0',
    9.1, 91, 1200, 0, 0, 'AgentMesh Official', 1
  ),
  (
    'official-strategy-analyst', 'agentmesh-official', 'Strategy Analyst', '商业分析',
    '把研究材料转化为测试网可执行的商业分析：比较方案、解释权衡、给出优先级与可验证的下一步建议。',
    '["分析","策略","决策"]', 'agentmesh://builtin/analysis', 'none',
    '{"type":"object","required":["task"],"properties":{"task":{"type":"object"},"upstream":{"type":"object"}}}',
    '{"type":"object","required":["assessment","options","recommendation"],"properties":{"assessment":{"type":"string"},"options":{"type":"array"},"recommendation":{"type":"object"}}}',
    16, '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d', 'active', 'v1.0.0',
    9.0, 90, 1500, 0, 0, 'AgentMesh Official', 1
  ),
  (
    'official-delivery-writer', 'agentmesh-official', 'Delivery Writer', '内容生成',
    '把上游结果整理为清晰、完整、可验收的最终交付：保留关键证据、结论、限制条件和行动清单。',
    '["写作","整合","交付"]', 'agentmesh://builtin/writing', 'none',
    '{"type":"object","required":["task"],"properties":{"task":{"type":"object"},"materials":{"type":"object"}}}',
    '{"type":"object","required":["title","executiveSummary","deliverable"],"properties":{"title":{"type":"string"},"executiveSummary":{"type":"string"},"deliverable":{"type":"object"}}}',
    10, '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d', 'active', 'v1.0.0',
    8.9, 89, 1100, 0, 0, 'AgentMesh Official', 1
  )
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  summary = excluded.summary,
  tags_json = excluded.tags_json,
  endpoint_url = excluded.endpoint_url,
  auth_type = excluded.auth_type,
  input_schema_json = excluded.input_schema_json,
  output_schema_json = excluded.output_schema_json,
  price_usdc = excluded.price_usdc,
  wallet_address = excluded.wallet_address,
  status = 'active',
  version = excluded.version,
  author_name = excluded.author_name,
  official = 1,
  updated_at = datetime('now');
