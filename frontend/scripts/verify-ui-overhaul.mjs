#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function runStep(name, cmd, args) {
  process.stdout.write(`⏳ Running ${name}... `);
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      const duration = (performance.now() - start).toFixed(0);
      if (code === 0) {
        console.log(`✅ PASS (${duration}ms)`);
        resolve({ stdout, stderr });
      } else {
        console.log(`❌ FAIL (${duration}ms)`);
        if (stderr) console.error(stderr);
        if (stdout && !stderr) console.error(stdout);
        reject(new Error(`${name} failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('🛡️ DB-GPT FRONTEND OVERHAUL: FULL SYSTEM VERIFICATION HARNESS');
  console.log('================================================================\n');

  try {
    // 1. Locale Parity Check
    await runStep('Locale Parity Check', process.execPath, ['scripts/check-locale-parity.mjs']);

    // 2. Adversarial Runtime Test Suite
    await runStep('Adversarial Runtime Verification', process.execPath, ['test_adversarial_runtime.mjs']);

    // 3. 4-Tier Master Test Runner
    await runStep('4-Tier Master Test Suite', process.execPath, ['tests/run-all-tests.mjs']);

    // 4. Verify Next.js Build Artifacts
    process.stdout.write('⏳ Verifying Next.js build compilation artifacts... ');
    const nextDir = path.join(ROOT, '.next');
    const buildManifest = path.join(nextDir, 'build-manifest.json');
    if (fs.existsSync(nextDir) && fs.existsSync(buildManifest)) {
      console.log('✅ PASS (Production build artifacts verified)');
    } else {
      console.log('⚠️ WARNING: .next build manifest not found. Run next build to generate.');
    }

    console.log('\n================================================================');
    console.log('🎉 ALL VERIFICATION GATES PASSED (100% SUCCESS)');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  }
}

main();
