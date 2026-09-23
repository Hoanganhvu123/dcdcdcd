import { ChatContextStatus } from '@/hooks/use-chat';
import { IApp } from '@/types/app';
import { ChartData, ChatHistoryResponse, IChatDialogueSchema, UserChatContent } from '@/types/chat';
import { createContext } from 'react';

export interface ChatContentProps {
  history: ChatHistoryResponse;
  replyLoading: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  canAbort: boolean;
  chartsData: ChartData[];
  agent: string;
  currentDialogue: IChatDialogueSchema;
  appInfo: IApp;
  temperatureValue?: number;
  maxNewTokensValue?: number;
  resourceValue?: unknown;
  knowledgeValue: string | null;
  modelValue: string;
  setModelValue: React.Dispatch<React.SetStateAction<string>>;
  setTemperatureValue: React.Dispatch<React.SetStateAction<number | undefined>>;
  setMaxNewTokensValue: React.Dispatch<React.SetStateAction<number | undefined>>;
  setResourceValue: React.Dispatch<React.SetStateAction<any>>;
  setKnowledgeValue: React.Dispatch<React.SetStateAction<string | null>>;
  setAppInfo: React.Dispatch<React.SetStateAction<IApp>>;
  setAgent: React.Dispatch<React.SetStateAction<string>>;
  setCanAbort: React.Dispatch<React.SetStateAction<boolean>>;
  setReplyLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleChat: (content: UserChatContent, data?: Record<string, any>) => Promise<void>;
  refreshDialogList: () => void;
  refreshHistory: () => void;
  refreshAppInfo: () => void;
  setHistory: React.Dispatch<React.SetStateAction<ChatHistoryResponse>>;
  contextStatus: ChatContextStatus | null;
}

export const ChatContentContext = createContext<ChatContentProps>({
  history: [],
  replyLoading: false,
  scrollRef: { current: null },
  canAbort: false,
  chartsData: [],
  agent: '',
  currentDialogue: {} as IChatDialogueSchema,
  appInfo: {} as IApp,
  temperatureValue: 0.5,
  maxNewTokensValue: 1024,
  resourceValue: {},
  knowledgeValue: null,
  modelValue: '',
  setModelValue: () => {},
  setResourceValue: () => {},
  setKnowledgeValue: () => {},
  setTemperatureValue: () => {},
  setMaxNewTokensValue: () => {},
  setAppInfo: () => {},
  setAgent: () => {},
  setCanAbort: () => {},
  setReplyLoading: () => {},
  refreshDialogList: () => {},
  refreshHistory: () => {},
  refreshAppInfo: () => {},
  setHistory: () => {},
  handleChat: () => Promise.resolve(),
  contextStatus: null,
});
