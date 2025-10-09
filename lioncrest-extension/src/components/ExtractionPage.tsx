// ExtractionPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGmailContext } from "../extension/useGmailContext";
import warning_icon from "../assets/warning_icon.svg";
import gmail_icon from "../assets/gmail_icon.svg";
import google_icon from "../assets/google_icon.svg";
import SchemaDropdown from "./SchemaDropdown";
import { apiService } from "../api";
import type { DataExtractionRequest, DataExtractionResponse } from "../types";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

type Mode = "thread" | "manual";

type ThreadPreview = {
  subject?: string;
  from?: string;
  date?: string;     // display-ready string
  snippet?: string;  // short body preview
};

function headerValue(headers: Array<{ name: string; value: string }>, name: string) {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

export default function ExtractionPage() {
  const navigate = useNavigate();
  const { threadId, accountIndex } = useGmailContext();

  const [isAuthenticatedGoogle, setIsAuthenticatedGoogle] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [schema, setSchema] = useState<string>("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>(threadId ? "thread" : "manual");

  const [loadingExtraction, setExtractionLoading] = useState(false);
  const [loadingClear, setClearLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email preview state
  const [preview, setPreview] = useState<ThreadPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Check auth once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: "AUTH_STATUS" });
        if (!cancelled) setIsAuthenticatedGoogle(Boolean(res?.signedIn));
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep mode synced to whether a thread is present
  useEffect(() => {
    const shouldBeThreadMode = threadId ? "thread" : "manual";
    if (mode !== shouldBeThreadMode) {
      setMode(shouldBeThreadMode);
    }
  }, [threadId, mode]);

  // Fetch Gmail preview when authenticated and a thread is available
  useEffect(() => {
    async function fetchPreview() {
      if (!threadId || !isAuthenticatedGoogle) return;
      setPreviewLoading(true);
      setError(null);
      try {
        // 1) Get a fresh access token from background
        const tokenRes = await chrome.runtime.sendMessage({ type: "GET_TOKEN" });
        if (!tokenRes?.success) {
          setPreview(null);
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

        // Get the last message in the thread
        const lastMsg = messages[messages.length - 1];
        const headers = lastMsg?.payload?.headers ?? [];

        setPreview({
          subject: headerValue(headers, "Subject"),
          from: headerValue(headers, "From"),
          date: headerValue(headers, "Date"),
          snippet: lastMsg?.snippet ?? data?.snippet ?? "",
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
    const res = await chrome.runtime.sendMessage({ type: "AUTH_START" });
    if (res?.success) {
      setIsAuthenticatedGoogle(true);
      // If we have a thread, ensure we're in thread mode after auth
      if (threadId) {
        setMode("thread");
      }
    } else {
      setIsAuthenticatedGoogle(false);
      setError(res?.error || "Authentication failed.");
    }
  };

  const handleExtract = async () => {
    try {
      setExtractionLoading(true);
      setError(null);

      if (!schema) throw new Error("Please select a schema.");

      // In thread mode you’ll likely want the **full email body** later.
      // For now we send either the manual text or the preview snippet as a fallback.
      const payloadText =
        mode === "manual" ? text.trim() : (preview?.snippet ?? "").trim();

      if (!payloadText) {
        throw new Error(
          mode === "manual"
            ? "Please paste some text to extract."
            : "Email preview not available yet. Switch to Manual mode or wire full-body fetch."
        );
      }

      const req: DataExtractionRequest = {
        schema_type: schema,
        text: payloadText,
      };

      const resp: DataExtractionResponse = await apiService.extractData(req);
      if (!resp.success) throw new Error(resp.message || "Extraction failed.");

      navigate("/results", {
        state: {
          extractedData: resp.extracted_data,
          schemaType: resp.schema_type,
          originalText: payloadText,
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
        {/* Info box (thread detected) */}
        {!isAuthenticatedGoogle && (
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

        {/* Email preview card */}
        <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-bold text-[#031F53]">Email Preview</h3>
          {previewLoading ? (
            <div className="text-xs text-gray-500">Loading preview…</div>
          ) : preview ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-3 text-gray-700">
                {preview.subject && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500">Subject:</span>{" "}
                    <span>{preview.subject}</span>
                  </div>
                )}
                {preview.from && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500">From:</span>{" "}
                    <span>{preview.from}</span>
                  </div>
                )}
                {preview.date && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500">Date:</span>{" "}
                    <span>{preview.date}</span>
                  </div>
                )}
              </div>
              {preview.snippet && (
                <div className="rounded bg-gray-50 p-3 text-xs text-gray-700">
                  {preview.snippet}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Preview unavailable. You can still{" "}
              <button className="underline" onClick={() => setMode("manual")}>
                switch to Manual mode
              </button>
              .
            </div>
          )}
        </div>

        {/* Primary action */}
        <div className="mt-3">
          <button
            onClick={handleExtract}
            disabled={loadingExtraction}
            className="w-full px-3 py-2 rounded text-white text-sm bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95"
          >
            {loadingExtraction ? "Extracting…" : "Extract from Thread"}
          </button>
        </div>

        {/* Switch to manual */}
        <div className="mt-2 text-xs text-gray-600">
          Not the right thread?{" "}
          <button className="underline" onClick={() => setMode("manual")}>
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
          <ExclamationTriangleIcon className="h-4 w-4 text-white" />
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
          <button className="underline" onClick={() => setMode("thread")}>
            Extract from Thread instead
          </button>
          .
        </div>
      )}
    </div>
  );
}
