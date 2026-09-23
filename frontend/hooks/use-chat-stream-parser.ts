import useChat, { ChatContextStatus } from '@/hooks/use-chat';
import { ChatHistoryResponse, IChatDialogueMessageSchema, UserChatContent } from '@/types/chat';
import { getInitMessage, safeJsonParse, transformFileUrl } from '@/utils';
import { useCallback, useRef, useState } from 'react';

export interface UseChatStreamParserOptions {
  chatId: string;
  scene: string;
  modelValue: string;
  appCode?: string;
  selectedPromptCodeRef?: React.MutableRefObject<string | undefined>;
}

export interface UseChatStreamParserReturn {
  history: ChatHistoryResponse;
  setHistory: React.Dispatch<React.SetStateAction<ChatHistoryResponse>>;
  replyLoading: boolean;
  setReplyLoading: React.Dispatch<React.SetStateAction<boolean>>;
  canAbort: boolean;
  setCanAbort: React.Dispatch<React.SetStateAction<boolean>>;
  order: React.MutableRefObject<number>;
  contextStatus: ChatContextStatus | null;
  ctrl: AbortController;
  handleChat: (content: UserChatContent, data?: Record<string, any>) => Promise<void>;
  abortChat: () => void;
  formatChatContent: (content: UserChatContent) => string;
}

/**
 * Format user input content (handling plain string, structured content, multimodal image/video attachments)
 */
export function formatChatContent(content: UserChatContent): string {
  if (typeof content === 'string') {
    return content;
  }

  const contentItems = content?.content || [];
  const textItems = contentItems.filter(item => item.type === 'text');
  const mediaItems = contentItems.filter(item => item.type !== 'text');

  let formattedDisplayContent = '';
  if (textItems.length > 0) {
    formattedDisplayContent = textItems.map(item => item.text).join(' ');
  }

  const mediaMarkdown = mediaItems
    .map(item => {
      if (item.type === 'image_url') {
        const originalUrl = item.image_url?.url || '';
        const displayUrl = transformFileUrl(originalUrl);
        const fileName = item.image_url?.fileName || 'image';
        return `\n![${fileName}](${displayUrl})`;
      } else if (item.type === 'video') {
        const originalUrl = item.video || '';
        const displayUrl = transformFileUrl(originalUrl);
        return `\n[Video](${displayUrl})`;
      } else {
        return `\n[${item.type} attachment]`;
      }
    })
    .join('\n');

  if (mediaMarkdown) {
    formattedDisplayContent = formattedDisplayContent ? `${formattedDisplayContent}\n${mediaMarkdown}` : mediaMarkdown;
  }

  return formattedDisplayContent;
}

/**
 * Custom hook to decouple SSE stream parsing and response state management from the Chat view.
 */
export function useChatStreamParser({
  chatId,
  scene,
  modelValue,
  appCode = '',
  selectedPromptCodeRef,
}: UseChatStreamParserOptions): UseChatStreamParserReturn {
  const [history, setHistory] = useState<ChatHistoryResponse>([]);
  const [replyLoading, setReplyLoading] = useState<boolean>(false);
  const [canAbort, setCanAbort] = useState<boolean>(false);
  const order = useRef<number>(1);
  const currentCtrlRef = useRef<AbortController | null>(null);

  const { chat, ctrl, contextStatus } = useChat({
    app_code: appCode,
  });

  const abortChat = useCallback(() => {
    if (currentCtrlRef.current) {
      currentCtrlRef.current.abort();
      currentCtrlRef.current = null;
    }
    setCanAbort(false);
    setReplyLoading(false);
  }, []);

  const handleChat = useCallback(
    (content: UserChatContent, data?: Record<string, any>) => {
      return new Promise<void>(resolve => {
        const initMessage = getInitMessage();
        setReplyLoading(true);

        if (history && history.length > 0) {
          const viewList = history.filter(item => item.role === 'view');
          const humanList = history.filter(item => item.role === 'human');
          order.current =
            ((viewList[viewList.length - 1]?.order || humanList[humanList.length - 1]?.order) ?? 0) + 1;
        }

        const formattedDisplayContent = formatChatContent(content);

        const tempHistory: ChatHistoryResponse = [
          ...(initMessage && initMessage.id === chatId ? [] : history),
          {
            role: 'human',
            context: formattedDisplayContent,
            model_name: data?.model_name || modelValue,
            order: order.current,
            time_stamp: 0,
          },
          {
            role: 'view',
            context: '',
            model_name: data?.model_name || modelValue,
            order: order.current,
            time_stamp: 0,
            thinking: true,
          },
        ];

        const index = tempHistory.length - 1;
        setHistory([...tempHistory]);

        const apiData: Record<string, any> = {
          chat_mode: scene,
          model_name: modelValue,
          user_input: content,
        };

        if (data) {
          Object.assign(apiData, data);
        }

        if (scene !== 'chat_dashboard') {
          const storedPromptCode = typeof window !== 'undefined'
            ? localStorage.getItem(`dbgpt_prompt_code_${chatId}`)
            : null;
          const finalPromptCode = selectedPromptCodeRef?.current || storedPromptCode;
          if (finalPromptCode) {
            apiData.prompt_code = finalPromptCode;
            if (typeof window !== 'undefined') {
              localStorage.removeItem(`dbgpt_prompt_code_${chatId}`);
            }
          }
        }

        const activeCtrl = new AbortController();
        currentCtrlRef.current = activeCtrl;

        chat({
          data: apiData,
          ctrl: activeCtrl,
          chatId,
          onMessage: (message: string) => {
            setCanAbort(true);
            if (data?.incremental) {
              tempHistory[index].context += message;
              tempHistory[index].thinking = false;
            } else {
              tempHistory[index].context = message;
              tempHistory[index].thinking = false;
            }
            setHistory([...tempHistory]);
          },
          onDone: () => {
            setReplyLoading(false);
            setCanAbort(false);
            currentCtrlRef.current = null;
            resolve();
          },
          onClose: () => {
            setReplyLoading(false);
            setCanAbort(false);
            currentCtrlRef.current = null;
            resolve();
          },
          onError: (message: string) => {
            setReplyLoading(false);
            setCanAbort(false);
            currentCtrlRef.current = null;
            tempHistory[index].context = message;
            tempHistory[index].thinking = false;
            setHistory([...tempHistory]);
            resolve();
          },
        });
      });
    },
    [chat, chatId, history, modelValue, scene, selectedPromptCodeRef],
  );

  return {
    history,
    setHistory,
    replyLoading,
    setReplyLoading,
    canAbort,
    setCanAbort,
    order,
    contextStatus,
    ctrl,
    handleChat,
    abortChat,
    formatChatContent,
  };
}

export default useChatStreamParser;
