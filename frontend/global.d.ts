declare namespace JSX {
  interface IntrinsicElements {
    summary: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    'custom-view': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    references: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        title: string;
        references: any;
      },
      HTMLElement
    >;
    'chart-view': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}

declare module 'cytoscape-euler';

// Vendor-prefixed Fullscreen API. The spec-standard members are in lib.dom, the prefixed
// ones never were, so every `document.webkitExitFullscreen()` call site was a type error.
// Declared here once instead of casting at each of the ~8 call sites in html-preview.tsx.
interface Document {
  readonly webkitFullscreenElement?: Element | null;
  readonly mozFullScreenElement?: Element | null;
  readonly msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  mozCancelFullScreen?: () => void;
  msExitFullscreen?: () => void;
}

interface HTMLElement {
  webkitRequestFullscreen?: () => void;
  mozRequestFullScreen?: () => void;
  msRequestFullscreen?: () => void;
}
