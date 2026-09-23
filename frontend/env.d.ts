/// <reference types="vite/client" />

// vite-plugin-pages generates this module from the `pages/` tree.
declare module '~react-pages' {
  import type { RouteObject } from 'react-router-dom';
  const routes: RouteObject[];
  export default routes;
}

interface Window {
  MonacoEnvironment?: any;
}

declare module 'react-syntax-highlighter/dist/esm/prism-async' {
  const Component: any;
  export default Component;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const style: any;
  export default style;
}

declare module 'react-resizable-panels' {
  export const PanelGroup: any;
  export const Panel: any;
  export const PanelResizeHandle: any;
}

declare module 'culori' {
  export function formatHex(color: any): string;
  export function parse(color: any): any;
  export function wcagLuminance(color: any): number;
  export const oklch: any;
}

declare module 'qrcode' {
  export function toDataURL(text: string, options?: any): Promise<string>;
  export function toString(text: string, options?: any): Promise<string>;
}

declare module 'sequelize' {
  export class Sequelize {
    constructor(...args: any[]);
    authenticate(): Promise<void>;
    define<T = any>(...args: any[]): any;
  }
  export class Model<T = any, U = any> {}
  export const DataTypes: any;
}

declare module '@/components/chat/content/OpenCodeSessionTurn' {
  export type SessionTurn = any;
  export type TurnMessage = any;
  export type TurnStep = any;
  export type MessagePart = any;
  export type ReasoningPart = any;
  export type ToolPart = any;
  export type ToolStatus = any;
}

declare module '@/components/chat/content/DocxArtifactViewer' {
  import type { ComponentType } from 'react';
  const DocxArtifactViewer: ComponentType<any>;
  export default DocxArtifactViewer;
}

declare module '@/components/chat/content/ExcelArtifactViewer' {
  import type { ComponentType } from 'react';
  const ExcelArtifactViewer: ComponentType<any>;
  export default ExcelArtifactViewer;
}

declare module '@/components/chat/content/SlideArtifactViewer' {
  import type { ComponentType } from 'react';
  const SlideArtifactViewer: ComponentType<any>;
  export default SlideArtifactViewer;
}

declare module '@/components/connector/types' {
  export interface ConnectorCatalogEntry { [key: string]: any; }
  export interface ConnectorInstance { [key: string]: any; }
  export interface ConnectorItem { [key: string]: any; }
  export interface ConnectorToolsResponse { [key: string]: any; }
  export interface CreateConnectorRequest { [key: string]: any; }
}

declare module '@/hooks/use-mobile' {
  export function useIsMobile(): boolean;
}
