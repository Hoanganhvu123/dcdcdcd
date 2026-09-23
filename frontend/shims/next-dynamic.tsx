/**
 * `next/dynamic` over `React.lazy` + Suspense.
 *
 * Every call site passes `{ ssr: false }`, which is the default and only
 * possible behaviour in a client-rendered app, so the option is accepted and
 * ignored. `loading` becomes the Suspense fallback.
 */
import { type ComponentType, lazy, Suspense, createElement } from 'react';

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>;

interface DynamicOptions {
  ssr?: boolean;
  loading?: ComponentType<any>;
}

export default function dynamic<P extends object>(loader: Loader<P>, options: DynamicOptions = {}): ComponentType<P> {
  // React.lazy requires a module with a `default`; a loader that resolves to the
  // component itself is legal for next/dynamic, so normalise both shapes.
  const Lazy = lazy(async () => {
    const mod = await loader();
    return 'default' in mod ? (mod as { default: ComponentType<P> }) : { default: mod as ComponentType<P> };
  });

  const Loading = options.loading;
  return function DynamicComponent(props: P) {
    return createElement(Suspense, { fallback: Loading ? createElement(Loading) : null }, createElement(Lazy, props as any));
  };
}
