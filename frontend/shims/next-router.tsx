/**
 * `next/router` over react-router.
 *
 * Aliased in vite.config.ts so the ~35 call sites that import `useRouter` from
 * 'next/router' keep working unchanged. The surface here is exactly what the
 * app uses — push, pathname, query, replace, isReady, isFallback, back, events —
 * not a general Next compatibility layer.
 */
export * from './next-router';
export { default } from './next-router';
