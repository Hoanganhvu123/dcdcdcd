import { IApp } from '@/types/app';
import { IChatDialogueMessageSchema } from '@/types/chat';
import { createContext } from 'react';

export interface MobileChatProps {
  model: string;
  temperature: number;
  resource: any;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  setTemperature: React.Dispatch<React.SetStateAction<number>>;
  setResource: React.Dispatch<React.SetStateAction<any>>;
  scene: string;
  history: IChatDialogueMessageSchema[];
  setHistory: React.Dispatch<React.SetStateAction<IChatDialogueMessageSchema[]>>;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  appInfo: IApp;
  conv_uid: string;
  resourceList?: Record<string, any>[];
  order: React.MutableRefObject<number>;
  handleChat: (_content?: string) => Promise<void>;
  canAbort: boolean;
  setCarAbort: React.Dispatch<React.SetStateAction<boolean>>;
  canNewChat: boolean;
  setCanNewChat: React.Dispatch<React.SetStateAction<boolean>>;
  ctrl: React.MutableRefObject<AbortController | undefined>;
  userInput: string;
  setUserInput: React.Dispatch<React.SetStateAction<string>>;
  getChatHistoryRun: () => void;
}

export const MobileChatContext = createContext<MobileChatProps>({
  model: '',
  temperature: 0.5,
  resource: null,
  setModel: () => {},
  setTemperature: () => {},
  setResource: () => {},
  scene: '',
  history: [],
  setHistory: () => {},
  scrollViewRef: { current: null },
  appInfo: {} as IApp,
  conv_uid: '',
  resourceList: [],
  order: { current: 1 },
  handleChat: () => Promise.resolve(),
  canAbort: false,
  setCarAbort: () => {},
  canNewChat: false,
  setCanNewChat: () => {},
  ctrl: { current: undefined },
  userInput: '',
  setUserInput: () => {},
  getChatHistoryRun: () => {},
});
