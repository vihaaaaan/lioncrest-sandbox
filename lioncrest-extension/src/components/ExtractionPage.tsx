// ExtractionPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGmailContext } from "../extension/useGmailContext";
import warning_icon from "../assets/warning_icon.svg";
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

export default function ExtractionPage() {
  const navigate = useNavigate();
  const { threadId, accountIndex } = useGmailContext();

  const [schema, setSchema] = useState<string>("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>(threadId ? "thread" : "manual");

  const [loadingExtraction, setExtractionLoading] = useState(false);
  const [loadingClear, setClearLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Email preview state
  const [preview, setPreview] = useState<ThreadPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    // If a thread is available, default to thread mode; otherwise manual.
    setMode(threadId ? "thread" : "manual");
  }, [threadId]);

  useEffect(() => {
    // Try to fetch a small preview (subject/from/snippet) for UX.
    // Replace this with your real extension messaging or backend call.
    async function fetchPreview() {
      if (!threadId) return;
      setPreviewLoading(true);
      try {
        // TODO: Wire to your real data source. Example:
        // const data = await myExtensionAPI.getThreadPreview({ threadId, accountIndex });
        // setPreview(data);
        // Temporary placeholder so UI still looks good:
        setPreview({
          subject: "(Preview) Subject goes here",
          from: "sender@example.com",
          date: new Date().toLocaleString(),
          snippet:
            "This is a short snippet of the email body to confirm the correct thread is selected…",
        });
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }
    fetchPreview();
  }, [threadId, accountIndex]);

  const handleExtract = async () => {
    try {
      setExtractionLoading(true);
      setError(null);

      if (!schema) {
        throw new Error("Please select a schema.");
      }

      // In thread mode you’ll likely want the **full email body**.
      // For now we send either the manual text or the preview snippet as a fallback.
      const payloadText =
        mode === "manual" ? text.trim() : (preview?.snippet ?? "").trim();

      if (!payloadText) {
        throw new Error(
          mode === "manual"
            ? "Please paste some text to extract."
            : "Email preview not available yet. Please switch to Manual mode or wire full-body fetch."
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

  return (
    <div className="max-w-3xl mx-auto">
      {/* THREAD MODE */}
      {mode === "thread" && (
        <>
          {/* Info box (thread detected) */}
          <div className="mb-4 p-4 bg-[#031F53] rounded">
            <div className="flex items-start">
              <img src={warning_icon} alt="Info icon" className="pr-4" />
              <div>
                <p className="font-bold text-white text-xs">Gmail thread detected</p>
                <p className="text-white text-xs mt-2">
                  We’ll extract data from the currently open thread. Confirm the preview
                  looks right below, choose a schema, then extract.
                </p>
              </div>
            </div>
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
                Preview unavailable. You can still extract, or{" "}
                <button
                  className="underline"
                  onClick={() => setMode("manual")}
                >
                  switch to Manual mode
                </button>
                .
              </div>
            )}
          </div>

          {/* Schema selector */}
          <div className="mb-3">
            <SchemaDropdown value={schema} onChange={setSchema} />
          </div>

          {/* Primary action */}
          <div className="mt-3">
            <button
              onClick={handleExtract}
              disabled={loadingExtraction}
              className="w-full px-3 py-2 rounded text-white text-sm bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50"
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
        </>
      )}

      {/* MANUAL MODE */}
      {mode === "manual" && (
        <>
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
          {error && 
            <p className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
              <ExclamationTriangleIcon className="h-4 w-4 text-white" />
               {error}
            </p>
          }

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
              {loadingClear ? 'Clearing...' : 'Clear'}
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
        </>
      )}
    </div>
  );
}
