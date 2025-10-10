// ExtractionPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGmailContext } from "../extension/useGmailContext";
import warning_icon from "../assets/warning_icon.svg";
import gmail_icon from "../assets/gmail_icon.svg";
import google_icon from "../assets/google_icon.svg";
import SchemaDropdown from "./SchemaDropdown";
import { apiService } from "../utils/api";
import type { DataExtractionRequest, DataExtractionResponse } from "../types";
import { decodeMessageContent } from "../utils/decoding";

type Mode = "thread" | "manual";

type ThreadPreview = {

  subject?: string;

  // thread starter
  startedBy?: { name: string; email: string };
  startedAt?: string; // display-ready

  // latest message
  latestFrom?: { name: string; email: string };
  latestAt?: string;  // display-ready
  latestSnippet?: string; // short body preview
};

interface ThreadData {
  messages: {
    messageNumber: number;
    subject: string; 
    from: string;
    to: string;
    cc?: string;
    date: string;
    content: string;
  }[];
}
function headerValue(headers: Array<{ name: string; value: string }>, name: string) {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export default function ExtractionPage() {
  const navigate = useNavigate();
  const { threadId, accountIndex } = useGmailContext();

  const [isAuthenticatedGoogle, setIsAuthenticatedGoogle] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [invalidDomainEmail, setInvalidDomainEmail] = useState<string | null>(null);

  const [schema, setSchema] = useState<string>("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>(threadId ? "thread" : "manual");
  const [ userSelectedMode, setUserSelectedMode ] = useState<boolean>(false);

  const [loadingExtraction, setExtractionLoading] = useState(false);
  const [loadingClear, setClearLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email preview state
  const [preview, setPreview] = useState<ThreadPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [ threadData, setThreadData ] = useState<ThreadData | null>(null);

  // Update mode change handlers to set userSelectedMode flag
  const switchToManual = () => {
    setMode("manual");
    setUserSelectedMode(true);
  };

  const switchToThread = () => {
    setMode("thread");
    setUserSelectedMode(true); 
  };

  useEffect(() => {
    setUserSelectedMode(false);
  }, [threadId]);

  // Check auth once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: "AUTH_STATUS" });
        if (!cancelled) {
          if (res?.error === "invalid_domain") {
            setIsAuthenticatedGoogle(false);
            setInvalidDomainEmail(res?.email || null);
            setError(`Account ${res?.email} is not authorized. Please sign in with a @lioncrest.vc or @prospeq.co account.`);
          } else {
            setIsAuthenticatedGoogle(Boolean(res?.signedIn));
            setInvalidDomainEmail(null);
          }
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-validate auth when Gmail account changes (threadId or accountIndex changes)
  useEffect(() => {
    // Skip if we haven't done the initial auth check yet
    if (authChecking) return;
    
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: "AUTH_STATUS" });
        if (!cancelled) {
          if (res?.error === "invalid_domain" || res?.error === "account_mismatch") {
            setIsAuthenticatedGoogle(false);
            setInvalidDomainEmail(res?.email || res?.gmailEmail || null);
            if (res?.error === "account_mismatch") {
              setError(res?.message || `Gmail account mismatch. Please switch Gmail accounts or re-authenticate.`);
            } else {
              setError(`Account ${res?.email} is not authorized. Please sign in with a @lioncrest.vc or @prospeq.co account.`);
            }
          } else if (res?.signedIn) {
            // Clear error states when switching to a valid account
            setIsAuthenticatedGoogle(true);
            setInvalidDomainEmail(null);
            setError(null);
          }
        }
      } catch (e) {
        console.error("Failed to re-validate auth:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, accountIndex, authChecking]);

  // Keep mode synced to whether a thread is present
  useEffect(() => {
    // Return early and dont apply mode change if the user has manually selected a mode
    if (userSelectedMode) return;
    const shouldBeThreadMode = threadId ? "thread" : "manual";
    if (mode !== shouldBeThreadMode) {
      setMode(shouldBeThreadMode);
    }
  }, [threadId, mode, userSelectedMode]);

  // Fetch Gmail preview when authenticated and a thread is available
  useEffect(() => {
    async function fetchPreview() {
      if (!threadId || !isAuthenticatedGoogle) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      setError(null);
      try {
        // 1) Get a fresh access token from background
        const tokenRes = await chrome.runtime.sendMessage({ type: "GET_TOKEN" });
        if (!tokenRes?.success) {
          setPreview(null);
          
          // Handle invalid domain error
          if (tokenRes?.error === "invalid_domain") {
            setIsAuthenticatedGoogle(false);
            setInvalidDomainEmail(tokenRes?.email || null);
            setError(tokenRes?.message || `Account not authorized. Please sign in with a @lioncrest.vc or @prospeq.co account.`);
          } else if (tokenRes?.error === "account_mismatch") {
            setIsAuthenticatedGoogle(false);
            setInvalidDomainEmail(tokenRes?.gmailEmail || null);
            setError(tokenRes?.message || `Gmail account mismatch. Please switch Gmail accounts or re-authenticate.`);
          } else {
            setError("Authentication required");
          }
          return;
        }
        const accessToken = tokenRes.accessToken as string;

        console.log("Got access token, fetching thread", threadId);

        // 2) Call Gmail threads.get - use 'full' format to get headers and snippet
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });


        if (!resp.ok) {
          const info = await resp.text();
          throw new Error(`Gmail error: ${resp.status} ${info}`);
        }

        const data = await resp.json();

        console.log("Gmail thread data:", data);
        const messages = (data?.messages ?? []) as Array<any>;
        if (messages.length === 0) {
          throw new Error("No messages found in thread");
        }
        // Initialize and set full thread data
        const threadData = {
          messages: messages.map((msg: any, index) => {
            const headers = msg?.payload?.headers ?? [];
            const content = decodeMessageContent(msg?.payload ?? {});
            return {
              messageNumber: index + 1,
              subject: headerValue(headers, "Subject"),
              from: headerValue(headers, "From"),
              to: headerValue(headers, "To"),
              cc: headerValue(headers, "Cc"),
              date: headerValue(headers, "Date"),
              content: content,
            };
          }),
        };

        setThreadData(threadData);

        // Initialize and set preview data
        const lastMsg = messages[messages.length - 1];
        const firstMsg = messages[0];
        const lastMsgHeaders = lastMsg?.payload?.headers ?? [];
        const firstMsgHeaders = firstMsg?.payload?.headers ?? [];

        setPreview({
          subject: headerValue(lastMsgHeaders, "Subject"),
          startedBy: {name: grabName(headerValue(firstMsgHeaders, "From")), email: grabEmail(headerValue(firstMsgHeaders, "From"))},
          startedAt: formatEmailDate(headerValue(firstMsgHeaders, "Date")),
          latestFrom: {name: grabName(headerValue(lastMsgHeaders, "From")), email: grabEmail(headerValue(firstMsgHeaders, "From"))},
          latestAt: formatEmailDate(headerValue(lastMsgHeaders, "Date")),
          latestSnippet: lastMsg?.snippet ?? data?.snippet ?? "",
        });
      } catch (e) {
        console.error("Failed to fetch email preview:", e);
        setPreview(null);
        setError(e instanceof Error ? e.message : "Failed to load preview.");
      } finally {
        setPreviewLoading(false);
      }
    }
    fetchPreview();
  }, [threadId, accountIndex, isAuthenticatedGoogle]);

  const handleAuthenticationGoogle = async () => {
    setError(null);
    setInvalidDomainEmail(null);
    const res = await chrome.runtime.sendMessage({ type: "AUTH_START" });
    if (res?.success) {
      setIsAuthenticatedGoogle(true);
      setInvalidDomainEmail(null);
      // If we have a thread, ensure we're in thread mode after auth
      if (threadId) {
        setMode("thread");
      }
    } else {
      setIsAuthenticatedGoogle(false);
      setError(res?.error || "Authentication failed.");
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setInvalidDomainEmail(null);
    await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
    setIsAuthenticatedGoogle(false);
  };

  const handleExtract = async () => {
    try {
      setExtractionLoading(true);
      setError(null);

      if (!schema) throw new Error("Please select a schema.");

      // In thread mode you’ll likely want the **full email body** later.
      // For now we send either the manual text or the preview snippet as a fallback.
      

      const req: DataExtractionRequest = {
        schema_type: schema,
        text: JSON.stringify(threadData, null, 2),
      };

      const resp: DataExtractionResponse = await apiService.extractData(req);
      if (!resp.success) throw new Error(resp.message || "Extraction failed.");

      navigate("/results", {
        state: {
          extractedData: resp.extracted_data,
          schemaType: resp.schema_type,
          originalText: JSON.stringify(threadData, null, 2),
        },
      });
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setExtractionLoading(false);
    }
  };

  const handleClear = () => {
    setClearLoading(true);
    setText("");
    setSchema("");
    setClearLoading(false);
  };

  const grabName = (fromString: string) => {
    const match = fromString.match(/^(.*?)\s*<.*?>$/);
    return match ? match[1] : "";
  };

  const grabEmail = (fromString: string) => {
    const match = fromString.match(/<(.+?)>/);
    return match ? match[1] : "";
  };

  const formatEmailDate = (rawDate: string): string => {
    const date = new Date(rawDate);
    if (isNaN(date.getTime())) return "Invalid Date";

    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isToday) {
      // Only time if today
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } else {
      // Date + time if not today
      return date.toLocaleString(undefined, {
        month: "short",   // "Oct"
        day: "numeric",   // "4"
        hour: "numeric",
        minute: "2-digit",
      });
    }
  };



  // Optional: block UI while we check auth the first time
  if (authChecking) {
    return (
      <div className="max-w-3xl mx-auto text-xs text-gray-500 p-4">
        Checking Google sign-in…
      </div>
    );
  }

  if (mode === "thread") {
    return (
      <div className="max-w-3xl mx-auto">
        {/* Show invalid domain warning */}
        {invalidDomainEmail && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center">
              <img src={warning_icon} alt="Warning icon" className="w-12 pr-4" />
              <div>
                <p className="font-bold text-red-900 text-xs">
                  Unauthorized Account
                </p>
              </div>
            </div>
            <p className="text-red-900 text-xs mt-2">
              You're signed in with <strong>{invalidDomainEmail}</strong>, which is not authorized. 
              Please sign out and authenticate with a <strong>@lioncrest.vc</strong> or <strong>@prospeq.co</strong> account.
            </p>
            <button
              onClick={handleSignOut}
              className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95"
            >
              Sign Out
            </button>
          </div>
        )}

        {/* Show auth prompt if not authenticated */}
        {!isAuthenticatedGoogle && !invalidDomainEmail && (
          <div className="mb-4 p-4 bg-[#031F53] rounded">
            <div className="flex items-center">
              <img src={gmail_icon} alt="Gmail icon" className="w-12 pr-4" />
              <div>
                <p className="font-bold text-white text-xs">
                  This page is supported for automatic extraction
                </p>
              </div>
            </div>
            <p className="text-white text-xs mt-2">
              You're currently signed out. Authenticate with your Lioncrest/Prospeq Google account to auto-extract.
            </p>
            <button
              onClick={handleAuthenticationGoogle}
              className="w-full mt-3 px-3 py-2 rounded text-black text-xs bg-white hover:opacity-90 active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95"
            >
              <img src={google_icon} alt="Google icon" className="w-4 h-4" />
              Authenticate with Google
            </button>
          </div>
        )}

        {/* Schema selector */}
        <div className="mb-3">
          <SchemaDropdown value={schema} onChange={setSchema} />
        </div>

        {/* Email Thread Preview */}
        <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {previewLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs text-gray-500">Loading email preview…</div>
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Subject */}
              {preview.subject && (
                <h3 className="text-base font-semibold text-gray-900">
                  {preview.subject}
                </h3>
              )}

              {/* Thread Overview */}
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Thread Overview
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-600">Started by</span>
                    {preview.startedBy && (
                      <span className="text-sm font-medium text-gray-800">
                        {preview.startedBy.name}{" "}
                        <span className="text-gray-500">&lt;{preview.startedBy.email}&gt;</span>
                      </span>
                    )}
                  </div>
                  {preview.startedAt && (
                    <span className="shrink-0 text-xs text-gray-500">
                      {preview.startedAt}
                    </span>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Latest Message */}
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Latest Message
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-600">From</span>
                    {preview.latestFrom && (
                      <span className="text-sm font-medium text-gray-800">
                        {preview.latestFrom.name}{" "}
                        <span className="text-gray-500">&lt;{preview.latestFrom.email}&gt;</span>
                      </span>
                    )}
                  </div>
                  {preview.latestAt && (
                    <span className="shrink-0 text-xs text-gray-500">
                      {preview.latestAt}
                    </span>
                  )}
                </div>

                {preview.latestSnippet && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
                    {preview.latestSnippet}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Preview unavailable. You can still{" "}
              <button className="underline" onClick={switchToManual}>
                switch to Manual mode
              </button>
              .
            </div>
          )}
        </div>



        {/* Error display */}
        {error && !invalidDomainEmail && (
          <p className="w-full mb-3 px-3 py-2 rounded text-white text-xs bg-red-500">
            {error}
          </p>
        )}

        {/* Primary action - disabled if invalid domain */}
        <div className="mt-3">
          <button
            onClick={handleExtract}
            disabled={loadingExtraction || !!invalidDomainEmail}
            className="w-full px-3 py-2 rounded text-white text-sm bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95"
          >
            {loadingExtraction ? "Extracting…" : "Extract from Thread"}
          </button>
        </div>

        {/* Switch to manual */}
        <div className="mt-2 text-xs text-gray-600">
          Not the right thread?{" "}
          <button className="underline" onClick={switchToManual}>
            Use Manual text instead
          </button>
          .
        </div>
      </div>
    );
  }

  // Manual mode
  return (
    <div className="max-w-3xl mx-auto">
      {/* Warning box (manual) */}
      <div className="mb-4 p-4 bg-[#031F53] rounded">
        <div className="flex items-center">
          <img src={warning_icon} alt="Warning icon" className="w-12 pr-4" />
          <div>
            <p className="font-bold text-white text-xs">
              This page is not supported for automatic extraction
            </p>
          </div>
        </div>
        <p className="text-white text-xs mt-2">
          Navigate to a supported page or manually input information to be added to Monday.com
        </p>
      </div>

      {/* Schema selector */}
      <div className="mb-3">
        <SchemaDropdown value={schema} onChange={setSchema} />
      </div>

      {/* Paste box */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste text here to extract structured data into Monday.com..."
        className="w-full h-80 border border-gray-300 rounded p-3 text-gray-700 text-sm"
      />

      {/* Error */}
      {error && (
        <p className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleExtract}
          disabled={loadingExtraction}
          className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95"
        >
          {loadingExtraction && (
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {loadingExtraction ? "Extracting Data..." : "Extract Data"}
        </button>
        <button
          onClick={handleClear}
          disabled={loadingClear}
          className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50 hover:scale-105 transition-all duration-300 ease-in-out hover:shadow-lg active:scale-95"
        >
          {loadingClear ? "Clearing..." : "Clear"}
        </button>
      </div>

      {/* Link back to thread mode if available */}
      {threadId && (
        <div className="mt-2 text-xs text-gray-600">
          A Gmail thread is open.{" "}
          <button className="underline" onClick={switchToThread}>
            Extract from Thread instead
          </button>
          .
        </div>
      )}
    </div>
  );
}
