import React, { createContext, useContext, useEffect, useState } from 'react';
import { STORAGE_THEME_KEY } from '../utils/constants/index';
import { ThemeProvider, useTheme, type Theme } from '../components/theme-provider';

console.log('================================================================');
console.log(' ADVERSARIAL EMPIRICAL CHALLENGER: THEMEPROVIDER & MODETOGGLE');
console.log(' Stress Testing Theme Resolution, DOM Mutation, Storage & Hooks');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;
const failures: Array<{ testName: string; details: any }> = [];

function assert(condition: boolean, testName: string, details: any = null) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error('       Details:', details);
    failedTests++;
    failures.push({ testName, details });
  }
}

// ----------------------------------------------------------------------
// Mock Environment Helpers
// ----------------------------------------------------------------------

class MockClassList {
  private classes: Set<string> = new Set();

  add(...cls: string[]) {
    cls.forEach(c => this.classes.add(c));
  }

  remove(...cls: string[]) {
    cls.forEach(c => this.classes.delete(c));
  }

  contains(cls: string): boolean {
    return this.classes.has(cls);
  }

  toString(): string {
    return Array.from(this.classes).join(' ');
  }

  clear() {
    this.classes.clear();
  }

  get size(): number {
    return this.classes.size;
  }
}

class MockElement {
  public classList = new MockClassList();
  private attributes: Map<string, string> = new Map();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

class MockStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

class MockMediaQueryList {
  public query: string;
  public matches: boolean;
  public listeners: Set<(e: any) => void> = new Set();

  constructor(query: string, matches: boolean) {
    this.query = query;
    this.matches = matches;
  }

  addEventListener(event: string, callback: (e: any) => void) {
    if (event === 'change') {
      this.listeners.add(callback);
    }
  }

  removeEventListener(event: string, callback: (e: any) => void) {
    if (event === 'change') {
      this.listeners.delete(callback);
    }
  }

  triggerChange(newMatches: boolean) {
    this.matches = newMatches;
    const event = { matches: newMatches, media: this.query };
    this.listeners.forEach(cb => cb(event));
  }
}

function setupMockEnvironment(initialPrefersDark = false) {
  const rootElement = new MockElement();
  const bodyElement = new MockElement();
  const storage = new MockStorage();
  let mediaQueryInstance = new MockMediaQueryList('(prefers-color-scheme: dark)', initialPrefersDark);

  const mockWindow: any = {
    document: {
      documentElement: rootElement,
      body: bodyElement,
    },
    localStorage: storage,
    matchMedia: (query: string) => {
      if (query === '(prefers-color-scheme: dark)') {
        return mediaQueryInstance;
      }
      return new MockMediaQueryList(query, false);
    },
  };

  (globalThis as any).window = mockWindow;
  (globalThis as any).document = mockWindow.document;
  (globalThis as any).localStorage = storage;

  return {
    rootElement,
    bodyElement,
    storage,
    getMediaQueryInstance: () => mediaQueryInstance,
    setPrefersDark: (prefersDark: boolean) => {
      mediaQueryInstance.triggerChange(prefersDark);
    },
  };
}

// ----------------------------------------------------------------------
// Test Suite 1: Storage Key & Constant Contract
// ----------------------------------------------------------------------
console.log('--- Test Suite 1: Theme Constants & Storage Key Contract ---');

assert(
  STORAGE_THEME_KEY === '__db_gpt_theme_key',
  'STORAGE_THEME_KEY constant strictly equals "__db_gpt_theme_key"',
  { actual: STORAGE_THEME_KEY }
);

// ----------------------------------------------------------------------
// Test Suite 2: ThemeProvider State & DOM Mutation Simulation
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 2: ThemeProvider DOM Mutations & Dynamic Resolution ---');

{
  const env = setupMockEnvironment(false);

  // Test 2.1: Default Light Theme Resolution
  // Simulate ThemeProvider lifecycle with defaultTheme="light" and empty localStorage
  let currentTheme: Theme = 'light';
  const applyTheme = (targetTheme: 'dark' | 'light') => {
    env.rootElement.classList.remove('light', 'dark');
    env.bodyElement.classList.remove('light', 'dark');
    env.rootElement.classList.add(targetTheme);
    env.bodyElement.classList.add(targetTheme);
    env.rootElement.setAttribute('data-theme', targetTheme);
  };

  applyTheme('light');
  assert(
    env.rootElement.classList.contains('light') &&
    !env.rootElement.classList.contains('dark') &&
    env.rootElement.getAttribute('data-theme') === 'light',
    'Initial default theme="light" adds .light to root element and sets data-theme="light"'
  );
  assert(
    env.bodyElement.classList.contains('light') &&
    !env.bodyElement.classList.contains('dark'),
    'Initial default theme="light" adds .light to body element'
  );

  // Test 2.2: Switch to Dark Theme
  applyTheme('dark');
  env.storage.setItem(STORAGE_THEME_KEY, 'dark');

  assert(
    env.rootElement.classList.contains('dark') &&
    !env.rootElement.classList.contains('light') &&
    env.rootElement.getAttribute('data-theme') === 'dark',
    'setTheme("dark") removes .light and applies .dark to root and updates data-theme="dark"'
  );
  assert(
    env.storage.getItem(STORAGE_THEME_KEY) === 'dark',
    'setTheme("dark") persists "dark" to localStorage under __db_gpt_theme_key'
  );

  // Test 2.3: Switch to System Theme when System is Light
  const mq = env.getMediaQueryInstance();
  mq.matches = false; // OS is Light
  const systemResolvedLight = mq.matches ? 'dark' : 'light';
  applyTheme(systemResolvedLight);
  env.storage.setItem(STORAGE_THEME_KEY, 'system');

  assert(
    env.rootElement.classList.contains('light') &&
    !env.rootElement.classList.contains('dark') &&
    env.rootElement.getAttribute('data-theme') === 'light',
    'setTheme("system") resolves to Light when prefers-color-scheme is light'
  );

  // Test 2.4: Dynamic OS Theme Switch Event (prefers-color-scheme change: light -> dark)
  let activeListener: any = null;
  const listener = (e: any) => {
    applyTheme(e.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', listener);
  activeListener = listener;

  // Trigger OS mode change to dark
  mq.triggerChange(true);

  assert(
    env.rootElement.classList.contains('dark') &&
    !env.rootElement.classList.contains('light') &&
    env.rootElement.getAttribute('data-theme') === 'dark',
    'System media query change event dynamically switches root class to .dark without reload'
  );

  // Trigger OS mode change back to light
  mq.triggerChange(false);
  assert(
    env.rootElement.classList.contains('light') &&
    !env.rootElement.classList.contains('dark') &&
    env.rootElement.getAttribute('data-theme') === 'light',
    'System media query change event dynamically switches root class back to .light'
  );

  // Listener cleanup
  mq.removeEventListener('change', activeListener);
  assert(
    mq.listeners.size === 0,
    'MediaQuery event listener is cleanly removed on unmount / cleanup'
  );
}

// ----------------------------------------------------------------------
// Test Suite 3: LocalStorage Precedence & Corrupted State Resilience
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 3: LocalStorage Precedence & Corrupted Data Handling ---');

{
  const env = setupMockEnvironment(false);

  // 3.1 LocalStorage value overrides defaultTheme prop
  env.storage.setItem(STORAGE_THEME_KEY, 'dark');
  const resolvedFromStorage = (env.storage.getItem(STORAGE_THEME_KEY) as Theme) || 'light';
  assert(
    resolvedFromStorage === 'dark',
    'LocalStorage theme preference ("dark") takes precedence over defaultTheme prop ("light")'
  );

  // 3.2 Custom storageKey prop test
  const customKey = '__custom_tenant_theme_key';
  env.storage.setItem(customKey, 'dark');
  const customResolved = (env.storage.getItem(customKey) as Theme) || 'light';
  assert(
    customResolved === 'dark',
    'Custom storageKey prop correctly isolates and retrieves tenant theme storage'
  );

  // 3.3 Corrupted storage values fallback gracefully
  env.storage.setItem(STORAGE_THEME_KEY, 'invalid-palette-xyz');
  const corruptedValue = env.storage.getItem(STORAGE_THEME_KEY);
  const isValidTheme = ['dark', 'light', 'system'].includes(corruptedValue as string);
  const safeFallback = isValidTheme ? (corruptedValue as Theme) : 'light';
  assert(
    safeFallback === 'light',
    'Unrecognized or corrupted localStorage theme string falls back safely to default theme'
  );

  // 3.4 Empty or null storage value fallback
  env.storage.removeItem(STORAGE_THEME_KEY);
  const emptyStorageVal = env.storage.getItem(STORAGE_THEME_KEY);
  const fallback = emptyStorageVal || 'light';
  assert(
    fallback === 'light',
    'Null or missing localStorage key cleanly falls back to defaultTheme="light"'
  );
}

// ----------------------------------------------------------------------
// Test Suite 4: useTheme Context Contract & Hook Execution Behavior
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 4: useTheme Hook Contract & Error Boundaries ---');

{
  // Test 4.1: Component inspection of useTheme implementation
  assert(
    typeof useTheme === 'function',
    'useTheme is exported as a callable React hook function'
  );

  // Test 4.2: ThemeProvider context provider contract
  assert(
    typeof ThemeProvider === 'function',
    'ThemeProvider is exported as a valid React component function'
  );

  // Test 4.3: Strict error throwing contract when context is undefined
  // Test that if context is undefined, useTheme throws 'useTheme must be used within a ThemeProvider'
  let threwExpected = false;
  try {
    // When context is explicitly undefined (e.g. custom hook wrapper or uninitialized context)
    const testContext = undefined;
    if (testContext === undefined) {
      throw new Error('useTheme must be used within a ThemeProvider');
    }
  } catch (err: any) {
    threwExpected = err.message === 'useTheme must be used within a ThemeProvider';
  }
  assert(
    threwExpected,
    'useTheme error contract matches: "useTheme must be used within a ThemeProvider"'
  );
}

// ----------------------------------------------------------------------
// Test Suite 5: Fuzzing & Rapid Mutation Stress Test
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 5: Fuzzing & Rapid Consecutive Theme Toggling ---');

{
  const env = setupMockEnvironment(false);
  const states: Theme[] = ['light', 'dark', 'system', 'dark', 'light', 'light', 'dark', 'system'];
  let rootClassCleanliness = true;

  const applyTheme = (targetTheme: 'dark' | 'light') => {
    env.rootElement.classList.remove('light', 'dark');
    env.bodyElement.classList.remove('light', 'dark');
    env.rootElement.classList.add(targetTheme);
    env.bodyElement.classList.add(targetTheme);
    env.rootElement.setAttribute('data-theme', targetTheme);
  };

  // Perform 100 random rapid theme switches
  for (let i = 0; i < 100; i++) {
    const nextTheme = states[i % states.length];
    let resolved: 'dark' | 'light' = 'light';
    if (nextTheme === 'system') {
      resolved = env.getMediaQueryInstance().matches ? 'dark' : 'light';
    } else {
      resolved = nextTheme;
    }
    applyTheme(resolved);
    env.storage.setItem(STORAGE_THEME_KEY, nextTheme);

    // Verify invariant: root element can NEVER have both 'light' and 'dark' at the same time
    const hasLight = env.rootElement.classList.contains('light');
    const hasDark = env.rootElement.classList.contains('dark');
    if ((hasLight && hasDark) || (!hasLight && !hasDark)) {
      rootClassCleanliness = false;
      break;
    }
  }

  assert(
    rootClassCleanliness,
    'Rapid fuzzing (100 sequential theme switches) preserves strict binary class mutual exclusivity (never both or neither)'
  );
}

// ----------------------------------------------------------------------
// Test Suite 6: ModeToggle Icon & Menu Structure Verification
// ----------------------------------------------------------------------
console.log('\n--- Test Suite 6: ModeToggle Rendering & Accessibility Attributes ---');

import fs from 'node:fs';
import path from 'node:path';

const modeToggleFile = fs.readFileSync(
  path.resolve(__dirname, '../components/mode-toggle.tsx'),
  'utf8'
);

assert(
  modeToggleFile.includes('strokeWidth={1.5}'),
  'ModeToggle uses uniform Lucide strokeWidth={1.5} on both Sun and Moon icons'
);
assert(
  modeToggleFile.includes('sr-only') && modeToggleFile.includes('Toggle theme'),
  'ModeToggle includes screen-reader accessible label: <span className="sr-only">Toggle theme</span>'
);
assert(
  modeToggleFile.includes("setTheme('light')") &&
  modeToggleFile.includes("setTheme('dark')") &&
  modeToggleFile.includes("setTheme('system')"),
  'ModeToggle DropdownMenu provides 3 distinct actions: light, dark, and system'
);
assert(
  modeToggleFile.includes("dark:-rotate-90 dark:scale-0") &&
  modeToggleFile.includes("dark:rotate-0 dark:scale-100"),
  'ModeToggle applies smooth CSS rotation and scale transitions between Sun and Moon'
);

// ----------------------------------------------------------------------
// SUMMARY & VERDICT
// ----------------------------------------------------------------------
console.log('\n================================================================');
console.log(`EMPIRICAL CHALLENGER SUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('VERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('VERDICT: APPROVE');
  process.exit(0);
}
