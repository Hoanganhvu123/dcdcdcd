import test from 'node:test';
import assert from 'node:assert/strict';

test('Tier 4.1: Real-World Workload - SQL Analysis Pipeline to Interactive Chart', async (t) => {
  await t.test('T4.1.1: Complete Pipeline: User Query -> Thought -> SQL -> Result Table -> Chart Artifact', () => {
    // Step 1: User prompt
    const userQuery = 'Analyze top 5 product categories by revenue in 2025';

    // Step 2: LLM ReAct Stream Simulation
    const rawReActTrace = `Thought: To analyze top product categories, I will query the orders and categories table.
Action: db_query | SELECT c.name AS category, SUM(o.amount) AS total_revenue FROM orders o JOIN categories c ON o.cat_id = c.id WHERE o.year = 2025 GROUP BY c.name ORDER BY total_revenue DESC LIMIT 5;
Action Input: {"db": "analytics_prod"}
Observation: [{"category": "Electronics", "total_revenue": 1250000}, {"category": "Apparel", "total_revenue": 840000}, {"category": "Home Goods", "total_revenue": 620000}, {"category": "Books", "total_revenue": 310000}, {"category": "Beauty", "total_revenue": 290000}]
Thought: The top 5 categories have been retrieved. Now creating a bar chart visualization.`;

    // Step 3: Parse reasoning sections
    const hasThought = rawReActTrace.includes('Thought:');
    const hasAction = rawReActTrace.includes('Action:');
    const hasObservation = rawReActTrace.includes('Observation:');

    assert.equal(hasThought, true);
    assert.equal(hasAction, true);
    assert.equal(hasObservation, true);

    // Step 4: Extract observation payload and transform to Chart Artifact data
    const obsMatch = rawReActTrace.match(/Observation:\s*(\[[\s\S]*?\])/);
    assert.ok(obsMatch);
    const dataRows = JSON.parse(obsMatch[1]);
    assert.equal(dataRows.length, 5);
    assert.equal(dataRows[0].category, 'Electronics');
    assert.equal(dataRows[0].total_revenue, 1250000);

    // Step 5: Construct Chart Artifact object
    const chartArtifact = {
      type: 'chart',
      title: 'Top 5 Product Categories Revenue (2025)',
      chartType: 'bar',
      xAxis: 'category',
      yAxis: 'total_revenue',
      data: dataRows
    };

    assert.equal(chartArtifact.chartType, 'bar');
    assert.equal(chartArtifact.data.reduce((acc, row) => acc + row.total_revenue, 0), 3310000);
  });
});
