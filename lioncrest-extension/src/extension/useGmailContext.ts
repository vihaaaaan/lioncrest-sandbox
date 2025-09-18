// useGmailContext.ts
import { useEffect, useState } from "react";

type GmailContext = { threadId: string | null; accountIndex: number };

export function useGmailContext() {
  const [ctx, setCtx] = useState<GmailContext>({ threadId: null, accountIndex: 0 });

  useEffect(() => {
    // 1) Pull the latest snapshot when the panel mounts
    chrome.runtime.sendMessage({ type: "GET_CONTEXT" }, (resp?: GmailContext) => {
      if (resp) setCtx(resp);
    });

    // 2) Listen for push updates from background
    const onMsg = (msg: any) => {
      if (msg?.type === "THREAD_CHANGED") {
        // avoid no-op renders if unchanged
        setCtx((prev) =>
          prev.threadId === msg.threadId && prev.accountIndex === msg.accountIndex
            ? prev
            : { threadId: msg.threadId ?? null, accountIndex: msg.accountIndex ?? 0 }
        );
      }
    };

    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  return ctx;
}
