/**
 * Replay Engine Simulator & State Machine Reference Implementation
 * Implements deterministic time accumulation, step resolution, scrubbing math,
 * artifact projection, and schema validation per PROJECT.md & survey_data_sync.md
 */

export const SPEED_MULTIPLIERS = {
  '1x': 1.0,
  '2x': 2.0,
  '4x': 4.0,
  '5x': 5.0,
  'Instant': Infinity,
};

export const SPEED_INTERVALS_MS = {
  '1x': 3000,
  '2x': 1500,
  '4x': 750,
  '5x': 600,
  'Instant': 0,
};

/**
 * Validate ReplaySession schema integrity
 */
export function validateReplaySession(session) {
  const errors = [];

  if (!session || typeof session !== 'object') {
    return { valid: false, errors: ['Session must be a non-null object'] };
  }

  // Required top-level fields
  const requiredFields = ['id', 'title', 'mode', 'steps', 'totalDurationMs'];
  for (const field of requiredFields) {
    if (!(field in session)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check mode validity
  const validModes = ['slides', 'sheets', 'docs', 'sql'];
  if (session.mode && !validModes.includes(session.mode)) {
    errors.push(`Invalid mode '${session.mode}'. Must be one of: ${validModes.join(', ')}`);
  }

  // Validate steps
  if (!Array.isArray(session.steps) || session.steps.length === 0) {
    errors.push('Session steps must be a non-empty array');
  } else {
    let prevEndTime = 0;
    session.steps.forEach((step, idx) => {
      if (typeof step.stepIndex !== 'number' || step.stepIndex !== idx) {
        errors.push(`Step at index ${idx} has invalid stepIndex ${step.stepIndex}`);
      }
      if (!step.id) {
        errors.push(`Step ${idx} is missing id`);
      }
      if (!step.title) {
        errors.push(`Step ${idx} is missing title`);
      }
      if (typeof step.durationMs !== 'number' || step.durationMs < 0) {
        errors.push(`Step ${idx} has invalid durationMs: ${step.durationMs}`);
      }
      if (typeof step.startTimeMs === 'number' && step.startTimeMs < prevEndTime) {
        errors.push(`Step ${idx} startTimeMs (${step.startTimeMs}) is before previous step endTimeMs (${prevEndTime})`);
      }
      if (typeof step.endTimeMs === 'number') {
        prevEndTime = step.endTimeMs;
      }
      if (!step.thinking || typeof step.thinking !== 'object') {
        errors.push(`Step ${idx} is missing thinking trace object`);
      }
      if (!step.artifactPatch || typeof step.artifactPatch !== 'object') {
        errors.push(`Step ${idx} is missing artifactPatch object`);
      }
    });
  }

  // Validate fork context if present
  if (session.forkContext) {
    if (!Array.isArray(session.forkContext.initialMessages)) {
      errors.push('forkContext.initialMessages must be an array');
    }
    if (!session.forkContext.finalArtifact || typeof session.forkContext.finalArtifact !== 'object') {
      errors.push('forkContext.finalArtifact must be an object');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format Vietnamese / English step counter label
 * e.g. "Bước 3 / 6: Phân tích SQL & Khai thác KPI"
 */
export function formatStepCounter(stepIndex, totalSteps, stepTitle = '') {
  const safeIdx = Math.max(0, Math.min(totalSteps - 1, stepIndex));
  const base = `Bước ${safeIdx + 1} / ${Math.max(1, totalSteps)}`;
  return stepTitle ? `${base}: ${stepTitle}` : base;
}

/**
 * Format stopwatch elapsed duration (e.g. "1.8s", "14.2s")
 */
export function formatElapsedTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const seconds = (safeMs / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Deterministically resolve active step index given current time in ms
 */
export function resolveStepIndex(session, currentTimeMs) {
  if (!session || !Array.isArray(session.steps) || session.steps.length === 0) {
    return 0;
  }
  const total = session.steps.length;
  const clampedTime = Math.max(0, Math.min(session.totalDurationMs, currentTimeMs));

  for (let i = total - 1; i >= 0; i--) {
    if (clampedTime >= session.steps[i].startTimeMs) {
      return i;
    }
  }
  return 0;
}

/**
 * Pure function: project active artifact state at given timestamp
 */
export function projectArtifactState(session, currentTimeMs) {
  if (!session || !Array.isArray(session.steps) || session.steps.length === 0) {
    return null;
  }

  const activeIndex = resolveStepIndex(session, currentTimeMs);
  const activeStep = session.steps[activeIndex];

  // Return the projected snapshot of the current step
  return {
    mode: session.mode,
    stepIndex: activeIndex,
    totalSteps: session.steps.length,
    isFinalStep: activeIndex === session.steps.length - 1,
    snapshot: activeStep.projectedArtifactSnapshot || {},
    patch: activeStep.artifactPatch || {},
  };
}

/**
 * Create a stateful Replay Engine simulator
 */
export function createReplayEngine(session, initialOptions = {}) {
  const validation = validateReplaySession(session);
  if (!validation.valid) {
    throw new Error(`Invalid ReplaySession: ${validation.errors.join('; ')}`);
  }

  let currentSession = session;
  let status = initialOptions.status || 'idle'; // 'idle' | 'playing' | 'paused' | 'scrubbing' | 'ended'
  let currentTimeMs = Math.max(0, Math.min(session.totalDurationMs, initialOptions.currentTimeMs || 0));
  let speed = initialOptions.speed || '1x'; // '1x' | '2x' | '4x' | 'Instant'
  let isInteractivePaused = false;
  const subscribers = new Set();

  function notify() {
    for (const sub of subscribers) {
      sub(getState());
    }
  }

  function getState() {
    const totalDurationMs = currentSession.totalDurationMs;
    const progressPercent = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0;
    const currentStepIndex = resolveStepIndex(currentSession, currentTimeMs);
    const currentStep = currentSession.steps[currentStepIndex];

    let subStepProgress = 1.0;
    if (currentStep && currentStep.durationMs > 0) {
      const elapsedInStep = currentTimeMs - currentStep.startTimeMs;
      subStepProgress = Math.max(0.0, Math.min(1.0, elapsedInStep / currentStep.durationMs));
    }

    return {
      session: currentSession,
      status,
      isPlaying: status === 'playing',
      isPaused: status === 'paused',
      isEnded: status === 'ended',
      currentTimeMs,
      totalDurationMs,
      progressPercent: Math.min(100, Math.max(0, progressPercent)),
      currentStepIndex,
      currentStep,
      totalSteps: currentSession.steps.length,
      subStepProgress,
      speed,
      isInteractivePaused,
      artifactState: projectArtifactState(currentSession, currentTimeMs),
    };
  }

  return {
    getState,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    setSession(newSession) {
      const valid = validateReplaySession(newSession);
      if (!valid.valid) {
        throw new Error(`Invalid ReplaySession: ${valid.errors.join('; ')}`);
      }
      currentSession = newSession;
      currentTimeMs = 0;
      status = 'idle';
      isInteractivePaused = false;
      notify();
    },

    play() {
      if (currentTimeMs >= currentSession.totalDurationMs) {
        currentTimeMs = 0;
      }
      status = 'playing';
      isInteractivePaused = false;
      notify();
    },

    pause() {
      status = 'paused';
      notify();
    },

    togglePlayPause() {
      if (status === 'playing') {
        status = 'paused';
      } else {
        if (currentTimeMs >= currentSession.totalDurationMs) {
          currentTimeMs = 0;
        }
        status = 'playing';
        isInteractivePaused = false;
      }
      notify();
    },

    seek(timeMs) {
      const targetTime = Number(timeMs);
      if (isNaN(targetTime)) return;
      currentTimeMs = Math.max(0, Math.min(currentSession.totalDurationMs, targetTime));
      if (currentTimeMs >= currentSession.totalDurationMs) {
        status = 'ended';
      } else if (status === 'ended') {
        status = 'paused';
      }
      notify();
    },

    seekPercent(percent) {
      const p = Number(percent);
      if (isNaN(p)) return;
      const clampedP = Math.max(0, Math.min(100, p));
      const targetTime = (clampedP / 100) * currentSession.totalDurationMs;
      this.seek(targetTime);
    },

    jumpToStep(stepIndex) {
      const idx = Math.max(0, Math.min(currentSession.steps.length - 1, Number(stepIndex) || 0));
      const targetStep = currentSession.steps[idx];
      this.seek(targetStep.startTimeMs);
    },

    stepNext() {
      const currentIdx = resolveStepIndex(currentSession, currentTimeMs);
      if (currentIdx < currentSession.steps.length - 1) {
        this.jumpToStep(currentIdx + 1);
      } else {
        this.seek(currentSession.totalDurationMs);
      }
    },

    stepPrev() {
      const currentIdx = resolveStepIndex(currentSession, currentTimeMs);
      if (currentIdx > 0) {
        this.jumpToStep(currentIdx - 1);
      } else {
        this.seek(0);
      }
    },

    setSpeed(newSpeed) {
      if (newSpeed in SPEED_MULTIPLIERS) {
        speed = newSpeed;
        if (speed === 'Instant') {
          currentTimeMs = currentSession.totalDurationMs;
          status = 'ended';
        }
        notify();
      }
    },

    triggerInteraction() {
      if (status === 'playing') {
        status = 'paused';
        isInteractivePaused = true;
        notify();
      }
    },

    resumeFromInteraction() {
      isInteractivePaused = false;
      this.play();
    },

    tick(deltaMs) {
      if (status !== 'playing') return;

      if (speed === 'Instant') {
        currentTimeMs = currentSession.totalDurationMs;
        status = 'ended';
        notify();
        return;
      }

      const multiplier = SPEED_MULTIPLIERS[speed] || 1.0;
      currentTimeMs = Math.min(currentSession.totalDurationMs, currentTimeMs + deltaMs * multiplier);

      if (currentTimeMs >= currentSession.totalDurationMs) {
        currentTimeMs = currentSession.totalDurationMs;
        status = 'ended';
      }
      notify();
    },

    exportForkContext() {
      const currentState = getState();
      const baseFork = currentSession.forkContext || {
        model: 'dbgpt-kimi-agent',
        initialMessages: [],
        finalArtifact: { type: currentSession.mode, title: currentSession.title, data: {} },
      };

      return {
        session_fork_id: currentSession.id,
        mode: currentSession.mode,
        forkedAtStep: currentState.currentStepIndex,
        forkedAtTimeMs: currentState.currentTimeMs,
        model: baseFork.model,
        systemPrompt: baseFork.systemPrompt,
        initialMessages: [
          ...baseFork.initialMessages,
          {
            role: 'assistant',
            content: `[Forked from Replay ${currentSession.title} at ${formatStepCounter(currentState.currentStepIndex, currentSession.steps.length)}]`,
          },
        ],
        activeArtifactSnapshot: currentState.artifactState.snapshot,
      };
    },
  };
}
