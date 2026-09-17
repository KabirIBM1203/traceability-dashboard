import { useEffect, useRef, useState, useCallback } from "react";

import { askGenie, genieFollowup } from "../services/api";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
}


// ---------------------------------------------------------------------------
// AiPanel
// ---------------------------------------------------------------------------

export default function AiPanel({ open, onClose }: AiPanelProps) {

  const [messages, setMessages]           = useState<AiMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [thinking, setThinking]           = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape (but not while waiting for Genie)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !thinking) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, thinking]);

  // ── Core send logic ──────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    // Append user bubble immediately
    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    try {
      let result;

      if (conversationId) {
        // Continue existing conversation
        result = await genieFollowup(conversationId, trimmed);
      } else {
        // Start a new conversation
        result = await askGenie(trimmed);
      }

      // Persist the conversation_id so follow-ups stay in context
      if (result.conversation_id) {
        setConversationId(result.conversation_id);
      }

      const assistantMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
      };
      setMessages((prev) => [...prev, assistantMsg]);

    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail ?? "Something went wrong. Please try again.";

      const errorMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠ ${detail}`,
      };
      setMessages((prev) => [...prev, errorMsg]);

    } finally {
      setThinking(false);
    }
  }, [conversationId, thinking]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSubmit() {
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleClear() {
    setMessages([]);
    setInput("");
    setConversationId(null);
    inputRef.current?.focus();
  }

  // Clicking a suggestion pill prefills and sends immediately
  function handleSuggestion(text: string) {
    sendMessage(text);
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────── */}
      <div
        className={`ai-backdrop ${open ? "ai-backdrop--visible" : ""}`}
        onClick={thinking ? undefined : onClose}
        aria-hidden="true"
      />

      {/* ── Drawer ───────────────────────────────────────────────── */}
      <aside
        className={`ai-panel ${open ? "ai-panel--open" : ""}`}
        role="complementary"
        aria-label="AI Assistant"
        aria-hidden={!open}
      >

        {/* ── Panel header ─────────────────────────────────────── */}
        <div className="ai-panel-header">

          <div className="ai-panel-header-left">
            <span className="ai-panel-icon" aria-hidden="true">✦</span>
            <div>
              <div className="ai-panel-title">Traceability AI</div>
              <div className="ai-panel-subtitle">
                {thinking
                  ? "Thinking…"
                  : "Ask anything about your features"}
              </div>
            </div>
          </div>

          <div className="ai-panel-header-actions">
            {hasMessages && !thinking && (
              <button
                className="ai-clear-btn"
                onClick={handleClear}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              className="ai-close-btn"
              onClick={thinking ? undefined : onClose}
              disabled={thinking}
              title="Close AI panel (Esc)"
              aria-label="Close AI panel"
            >
              ✕
            </button>
          </div>

        </div>

        {/* ── Messages area ────────────────────────────────────── */}
        <div className="ai-messages" role="log" aria-live="polite">

          {!hasMessages && !thinking ? (
            <WelcomeState onSuggestion={handleSuggestion} />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {thinking && <ThinkingBubble />}
            </>
          )}

          <div ref={messagesEndRef} />

        </div>

        {/* ── Input bar ────────────────────────────────────────── */}
        <div className="ai-input-bar">

          <div className={`ai-input-wrapper${thinking ? " ai-input-wrapper--busy" : ""}`}>

            <textarea
              ref={inputRef}
              className="ai-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={thinking ? "Waiting for Genie…" : "Ask Traceability AI…"}
              rows={1}
              disabled={thinking}
              aria-label="Message input"
            />

            <button
              className="ai-send-btn"
              onClick={handleSubmit}
              disabled={!input.trim() || thinking}
              aria-label="Send message"
              title="Send (Enter)"
            >
              {thinking ? <SpinnerIcon /> : <SendIcon />}
            </button>

          </div>

          <p className="ai-input-hint">
            Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
          </p>

        </div>

      </aside>
    </>
  );
}


// ---------------------------------------------------------------------------
// WelcomeState
// ---------------------------------------------------------------------------

interface WelcomeStateProps {
  onSuggestion: (text: string) => void;
}

function WelcomeState({ onSuggestion }: WelcomeStateProps) {
  const suggestions = [
    "Which features are missing a TR Bundle?",
    "Show me all blocked features in the current fix version.",
    "How many features are ready for acceptance?",
    "Summarise the release artifacts for DCRTB-437.",
  ];

  return (
    <div className="ai-welcome">

      <div className="ai-welcome-icon" aria-hidden="true">✦</div>

      <h3 className="ai-welcome-title">How can I help?</h3>

      <p className="ai-welcome-body">
        Ask me anything about DCRTB features, RevTrac requests,
        release artifacts, or transport statuses.
      </p>

      <div className="ai-suggestions" role="list">
        {suggestions.map((s) => (
          <button
            key={s}
            className="ai-suggestion"
            role="listitem"
            onClick={() => onSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>

    </div>
  );
}


// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  const isError = message.content.startsWith("⚠");

  return (
    <div className={`ai-message ai-message--${message.role}`}>
      <div className="ai-message-label">
        {isUser ? "You" : "Traceability AI"}
      </div>
      <div className={`ai-message-content${isError ? " ai-message-content--error" : ""}`}>
        {message.content}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// ThinkingBubble — animated "..." while waiting for Genie
// ---------------------------------------------------------------------------

function ThinkingBubble() {
  return (
    <div className="ai-message ai-message--assistant">
      <div className="ai-message-label">Traceability AI</div>
      <div className="ai-message-content ai-thinking">
        <span className="ai-thinking-dot" />
        <span className="ai-thinking-dot" />
        <span className="ai-thinking-dot" />
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// SendIcon
// ---------------------------------------------------------------------------

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M14.5 8L2 2.5L4.5 8L2 13.5L14.5 8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}


// ---------------------------------------------------------------------------
// SpinnerIcon — shown on the send button while waiting
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      className="ai-send-spinner"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
