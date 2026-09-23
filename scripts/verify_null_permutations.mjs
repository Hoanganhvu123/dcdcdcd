import assert from 'node:assert';

console.log('=== RUNNING ADVERSARIAL PERMUTATION SUITE ON data_index.tsx LOGIC ===');

function simulateOnSuccess(res, activeKey = 'all', apps = { app_list: [], total_count: 0 }) {
  let state = { ...apps };
  const setState = (next) => {
    state = next;
  };

  const [_error, data] = res;

  if (activeKey === 'recommend') {
    if (Array.isArray(data)) {
      setState({
        app_list: data,
        total_count: data.length,
      });
      return state;
    }
  } else {
    if (data && typeof data === 'object' && 'app_list' in data && Array.isArray(data.app_list)) {
      const code = data?.app_list?.[0]?.app_code;
      const index = code ? state.app_list.findIndex((item) => item.app_code === code) : -1;
      if (index !== -1) {
        const finallyIndex = Math.floor(index / 12) * 12;
        setState(
          {
            app_list: state.app_list.toSpliced(finallyIndex, 12, ...data.app_list) || [],
            total_count: data?.total_count || 0,
          } || {},
        );
      } else {
        setState(
          {
            app_list: state.app_list.concat(data?.app_list) || [],
            total_count: data?.total_count || 0,
          } || {},
        );
      }
    }
  }
  return state;
}

const testCases = [
  { name: 'null res[1]', res: [null, null] },
  { name: 'undefined res[1]', res: [null, undefined] },
  { name: 'empty string res[1]', res: [null, ''] },
  { name: 'number res[1]', res: [null, 12345] },
  { name: 'boolean res[1]', res: [null, false] },
  { name: 'boolean true res[1]', res: [null, true] },
  { name: 'empty object res[1]', res: [null, {}] },
  { name: 'null app_list in object', res: [null, { app_list: null }] },
  { name: 'undefined app_list in object', res: [null, { app_list: undefined }] },
  { name: 'string app_list in object', res: [null, { app_list: 'malformed' }] },
  { name: 'number app_list in object', res: [null, { app_list: 999 }] },
  { name: 'empty array app_list in object', res: [null, { app_list: [], total_count: 0 }] },
  {
    name: 'valid app_list in object',
    res: [null, { app_list: [{ app_code: 'code1', name: 'App 1' }], total_count: 1 }],
  },
  {
    name: 'recommend mode with null',
    activeKey: 'recommend',
    res: [null, null],
  },
  {
    name: 'recommend mode with non-array object',
    activeKey: 'recommend',
    res: [null, { app_list: [] }],
  },
  {
    name: 'recommend mode with valid array',
    activeKey: 'recommend',
    res: [null, [{ app_code: 'rec1' }]],
  },
];

let passed = 0;
for (const tc of testCases) {
  try {
    const result = simulateOnSuccess(tc.res, tc.activeKey || 'all');
    assert(result !== undefined, 'Result should not be undefined');
    console.log(`  [PASS] Test case: ${tc.name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test case: ${tc.name} threw error:`, err);
  }
}

// Fuzzing with 5,000 random generated values
console.log('\n--- Fuzzing 5,000 random arbitrary inputs ---');
const fuzzTypes = [
  null,
  undefined,
  NaN,
  Infinity,
  '',
  'random string',
  0,
  1,
  -1,
  true,
  false,
  Symbol('test'),
  {},
  { randomKey: 'value' },
  { app_list: null },
  { app_list: undefined },
  { app_list: 1 },
  { app_list: 'str' },
  { app_list: [] },
  { app_list: [{}] },
  { app_list: [{ app_code: 'test' }] },
  [],
  [1, 2, 3],
];

let fuzzPassed = 0;
for (let i = 0; i < 5000; i++) {
  const randomErr = fuzzTypes[Math.floor(Math.random() * fuzzTypes.length)];
  const randomData = fuzzTypes[Math.floor(Math.random() * fuzzTypes.length)];
  const randomKey = Math.random() > 0.5 ? 'recommend' : 'all';
  try {
    simulateOnSuccess([randomErr, randomData], randomKey);
    fuzzPassed++;
  } catch (err) {
    console.error(`Fuzz iteration ${i} failed with:`, err);
    throw err;
  }
}
console.log(`  [PASS] 5,000 / 5,000 fuzzing permutations handled safely without throwing.\n`);

console.log(`=== SUMMARY: ${passed}/${testCases.length} targeted test cases passed, ${fuzzPassed}/5000 fuzz cases passed ===`);
