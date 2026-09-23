/**
 * Application entry. Replaces pages/_app.tsx (providers, theme, layout) and the
 * Next runtime's router with react-router; pages/_document.tsx became index.html.
 *
 * Routes are generated from the existing `pages/` tree by vite-plugin-pages, so
 * the file-based routing the app was written against still holds — including the
 * dynamic segments ([code], [token], [taskId], [type]).
 */
import { STORAGE_LANG_KEY, STORAGE_THEME_KEY, STORAGE_USERINFO_KEY, STORAGE_USERINFO_VALID_TIME_KEY } from '@/utils/constants/index';
import { ThemeProvider } from '@/components/theme-provider';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import React, { Suspense, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AffordanceProvider } from '@/lib/affordance/registry-provider';
import { OpenworkControlProvider, OpenworkRouteControlActions } from '@/shell/control/control-provider';
import routes from '~react-pages';
import './app/i18n';
import './nprogress.css';
import './styles/globals.css';

// monaco-editor-webpack-plugin used to inject this. Only the base editor worker
// is needed: the app registers SQL, which has no dedicated language worker.
// The specifier omits `esm/vs/` on purpose: monaco 0.56's exports map is
// `"./*": "./esm/vs/*.js"`, so spelling the prefix out resolves to
// esm/vs/esm/vs/... and fails.
self.MonacoEnvironment = { getWorker: () => new editorWorker() };

function CssWrapper({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Fall back to i18n's own configured `lng` (app/i18n.ts) rather than a hardcoded
    // locale — hardcoding 'zh' here silently overrode it and forced Chinese on first load.
    i18n.changeLanguage?.(window.localStorage.getItem(STORAGE_LANG_KEY) || i18n.language);
  }, [i18n]);

  return (
    <div className='min-h-screen bg-background text-foreground font-sans antialiased selection:bg-zinc-200 dark:selection:bg-zinc-800'>
      {children}
      <Toaster position='top-center' closeButton />
    </div>
  );
}

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [isLogin, setIsLogin] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  // 登录检测
  const handleAuth = async () => {
    setIsLogin(false);
    // MOCK User info
    const user = {
      user_channel: `dbgpt`,
      user_no: `001`,
      nick_name: `dbgpt`,
    };
    if (user) {
      localStorage.setItem(STORAGE_USERINFO_KEY, JSON.stringify(user));
      localStorage.setItem(STORAGE_USERINFO_VALID_TIME_KEY, Date.now().toString());
      setIsLogin(true);
    }
  };

  useEffect(() => {
    handleAuth();
  }, []);

  if (!isLogin && !pathname.startsWith('/share')) {
    return null;
  }

  return <>{children}</>;
}

function RootLayout() {
  return (
    <ThemeProvider defaultTheme='light' storageKey={STORAGE_THEME_KEY}>
      <OpenworkControlProvider>
        <OpenworkRouteControlActions />
        <AffordanceProvider>
          <CssWrapper>
            <LayoutWrapper>
              {/* Page chunks are code-split by vite-plugin-pages, so the Outlet suspends. */}
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </LayoutWrapper>
          </CssWrapper>
        </AffordanceProvider>
      </OpenworkControlProvider>
    </ThemeProvider>
  );
}

// A pathless layout route: children keep the absolute paths the plugin generated.
const router = createBrowserRouter([{ element: <RootLayout />, children: routes }]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
