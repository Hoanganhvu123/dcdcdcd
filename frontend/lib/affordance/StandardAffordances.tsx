/**
 * The six standard affordances every session exposes.
 *
 * The registry (registry-provider.tsx) was ported from OpenWork with no
 * producers, so `window.__dbgptControl.listActions()` returned `[]` and the
 * settings panel showed a placeholder claiming six actions existed. This
 * component is the producer: it binds real app capabilities — react-router
 * navigation, ChatContext layout/theme state, and the dialogue API — to typed
 * descriptors so an agent driving the control surface changes the actual UI.
 *
 * Registration happens once. Mutable app state is read through refs so the
 * handlers stay current without churning `revision` on every render.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatContext } from '@/app/chat-context';
import { getDialogueList } from '@/client/api/request';
import { useAffordanceRegistry } from './registry-provider';
import type { OpenworkAffordanceDescriptor } from './types';

export const StandardAffordances: React.FC = () => {
  const { register } = useAffordanceRegistry();
  const navigate = useNavigate();
  const { mode, setMode, isMenuExpand, setIsMenuExpand } = React.useContext(ChatContext);

  // Refs keep the once-registered handlers reading live state instead of the
  // values captured at mount.
  const navigateRef = useRef(navigate);
  const modeRef = useRef(mode);
  const setModeRef = useRef(setMode);
  const menuRef = useRef(isMenuExpand);
  const setMenuRef = useRef(setIsMenuExpand);
  navigateRef.current = navigate;
  modeRef.current = mode;
  setModeRef.current = setMode;
  menuRef.current = isMenuExpand;
  setMenuRef.current = setIsMenuExpand;

  useEffect(() => {
    const descriptors: OpenworkAffordanceDescriptor[] = [
      {
        id: 'ui.getRoute',
        label: 'Get current route',
        description: 'Read the active pathname, search string, and layout state.',
        kind: 'query',
        providerKind: 'builtin',
        effects: { data: 'read', ui: 'none', external: false },
        requiresConfirmation: false,
        handler: () => ({
          pathname: window.location.pathname,
          search: window.location.search,
          sidebarExpanded: menuRef.current ?? true,
          theme: modeRef.current,
        }),
      },
      {
        id: 'ui.getTheme',
        label: 'Get theme',
        description: 'Read the active colour mode.',
        kind: 'query',
        providerKind: 'builtin',
        effects: { data: 'read', ui: 'none', external: false },
        requiresConfirmation: false,
        handler: () => ({ mode: modeRef.current }),
      },
      {
        id: 'ui.navigate',
        label: 'Navigate',
        description: 'Move the app to another route.',
        kind: 'command',
        providerKind: 'builtin',
        effects: { data: 'none', ui: 'navigate', external: false },
        requiresConfirmation: false,
        args: [{ name: 'to', type: 'string', required: true, description: 'Target pathname, e.g. /chat' }],
        handler: args => {
          const to = args?.to;
          if (typeof to !== 'string' || !to.startsWith('/')) {
            throw new Error("ui.navigate requires an absolute path argument 'to'");
          }
          navigateRef.current(to);
          return { navigatedTo: to };
        },
      },
      {
        id: 'ui.toggleSidebar',
        label: 'Toggle sidebar',
        description: 'Expand or collapse the left navigation rail.',
        kind: 'command',
        providerKind: 'builtin',
        effects: { data: 'none', ui: 'layout', external: false },
        requiresConfirmation: false,
        args: [{ name: 'expanded', type: 'boolean', description: 'Explicit target state; omit to flip.' }],
        handler: args => {
          const next = typeof args?.expanded === 'boolean' ? args.expanded : !(menuRef.current ?? true);
          setMenuRef.current(next);
          return { sidebarExpanded: next };
        },
      },
      {
        id: 'ui.setTheme',
        label: 'Set theme',
        description: 'Switch between the light and dark colour modes.',
        kind: 'command',
        providerKind: 'builtin',
        effects: { data: 'write', ui: 'layout', external: false },
        requiresConfirmation: false,
        args: [{ name: 'mode', type: 'string', description: "'light' or 'dark'; omit to flip." }],
        handler: args => {
          const requested = args?.mode;
          const next =
            requested === 'light' || requested === 'dark' ? requested : modeRef.current === 'dark' ? 'light' : 'dark';
          setModeRef.current(next);
          return { mode: next };
        },
      },
      {
        id: 'chat.listDialogues',
        label: 'List conversations',
        description: 'Fetch the current user’s conversation list from the server.',
        kind: 'query',
        providerKind: 'connect',
        effects: { data: 'read', ui: 'none', external: true },
        requiresConfirmation: false,
        handler: async () => {
          const res = await getDialogueList();
          const list = res?.data?.data ?? [];
          return { count: list.length, dialogues: list };
        },
      },
    ];

    const unbinds = descriptors.map(register);
    return () => unbinds.forEach(unbind => unbind());
  }, [register]);

  return null;
};

export default StandardAffordances;
