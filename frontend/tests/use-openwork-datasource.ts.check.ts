import assert from 'node:assert/strict';
import { mapDbSchemaToDatasourceItem, DEFAULT_DATASOURCES } from '../components/openwork/useOpenWorkStore';

console.log('================================================================');
console.log(' RUNNING BEHAVIORAL CHECKS FOR DATASOURCE MAPPER & STORE');
console.log('================================================================\n');

// 1. Verify DEFAULT_DATASOURCES integrity
assert.equal(DEFAULT_DATASOURCES.length, 5, 'DEFAULT_DATASOURCES should have 5 items');
assert.equal(DEFAULT_DATASOURCES[0].id, 'VN_Ecommerce');
assert.equal(DEFAULT_DATASOURCES[0].type, 'sqlite');
assert.equal(DEFAULT_DATASOURCES[0].tablesCount, 12);
assert.equal(DEFAULT_DATASOURCES[1].id, 'VN_Inventory');
assert.equal(DEFAULT_DATASOURCES[1].type, 'sqlite');
assert.equal(DEFAULT_DATASOURCES[2].id, 'VN_Marketing');
assert.equal(DEFAULT_DATASOURCES[2].type, 'sqlite');
assert.equal(DEFAULT_DATASOURCES[3].id, 'VN_Finance');
assert.equal(DEFAULT_DATASOURCES[3].type, 'sqlite');
assert.equal(DEFAULT_DATASOURCES[4].id, 'Walmart_Sales');
assert.equal(DEFAULT_DATASOURCES[4].type, 'sqlite');
console.log('[PASS] DEFAULT_DATASOURCES integrity check');

// 2. Verify mapDbSchemaToDatasourceItem with various backend database schemas
const pgDb = mapDbSchemaToDatasourceItem({
  id: 'db_pg_101',
  name: 'prod_analytics_pg',
  db_type: 'postgresql',
  comment: 'Production PostgreSQL Analytics DW',
  db_host: '10.0.0.12',
  db_port: 5432,
  tables_count: 32,
});
assert.equal(pgDb.id, 'db_pg_101');
assert.equal(pgDb.name, 'prod_analytics_pg');
assert.equal(pgDb.type, 'postgres');
assert.equal(pgDb.description, 'Production PostgreSQL Analytics DW');
assert.equal(pgDb.host, '10.0.0.12');
assert.equal(pgDb.port, 5432);
assert.equal(pgDb.tablesCount, 32);
console.log('[PASS] mapDbSchemaToDatasourceItem maps PostgreSQL correctly');

const mySqlDb = mapDbSchemaToDatasourceItem({
  id: 'db_mysql_202',
  db_name: 'orders_mysql',
  db_type: 'mysql',
  description: 'MySQL Orders DB',
});
assert.equal(mySqlDb.id, 'db_mysql_202');
assert.equal(mySqlDb.name, 'orders_mysql');
assert.equal(mySqlDb.type, 'mysql');
assert.equal(mySqlDb.description, 'MySQL Orders DB');
console.log('[PASS] mapDbSchemaToDatasourceItem maps MySQL correctly');

const clickhouseDb = mapDbSchemaToDatasourceItem({
  db_name: 'events_ch',
  type: 'clickhouse',
  comment: 'ClickHouse Event Streams',
});
assert.equal(clickhouseDb.name, 'events_ch');
assert.equal(clickhouseDb.type, 'clickhouse');
console.log('[PASS] mapDbSchemaToDatasourceItem maps ClickHouse correctly');

const fallbackDb = mapDbSchemaToDatasourceItem({});
assert.ok(fallbackDb.id.length > 0);
assert.equal(fallbackDb.type, 'sqlite');
assert.equal(fallbackDb.status, 'connected');
console.log('[PASS] mapDbSchemaToDatasourceItem handles empty object with safe fallbacks');

console.log('\n=== ALL DATASOURCE BEHAVIORAL CHECKS PASSED ===\n');
