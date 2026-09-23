/**
 * `next/head` as a portal into `document.head`.
 *
 * Small enough not to justify a head-management dependency: the app's two call
 * sites set static tags, so there is nothing to deduplicate or merge.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function Head({ children }: { children?: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.head);
}
