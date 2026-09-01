"use client";

import { useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function InstallAppButton({ compact }: { compact?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isStandalone) setInstalled(true);

      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setIsIos(ios);
    }, 0);

    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      promptRef.current = null;
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const promptInstall = async (prompt: BeforeInstallPromptEvent) => {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setDeferredPrompt(null);
      promptRef.current = null;
    }
  };

  const attemptInstall = () => {
    setShowHint(false);
    const prompt = promptRef.current;
    if (prompt) {
      void promptInstall(prompt);
      return;
    }
    // No install prompt available yet (Chrome gates it on eligibility). Wait a
    // moment in case it arrives now; only fall back to guidance if it never comes.
    setBusy(true);
    const started = Date.now();
    const check = setInterval(() => {
      if (promptRef.current) {
        clearInterval(check);
        setBusy(false);
        void promptInstall(promptRef.current);
      } else if (Date.now() - started > 4000) {
        clearInterval(check);
        setBusy(false);
        setShowHint(true);
      }
    }, 150);
  };

  const buttonStyle: React.CSSProperties = compact
    ? {
        borderColor: "var(--line)",
        background: deferredPrompt
          ? "var(--accent)"
          : "color-mix(in srgb, var(--bg-raised) 50%, transparent)",
        color: deferredPrompt ? "var(--bg)" : "var(--ink)",
      }
    : { background: "var(--accent)", color: "var(--bg)" };

  const buttonClass = compact
    ? "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all duration-200 active:scale-95"
    : "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors active:scale-[0.99]";

  const hint = isIos
    ? "iOS blocks automatic installation — tap Share → “Add to Home Screen”."
    : "Your browser didn’t open the install dialog yet — try again in a moment, or use ⋮ → “Install app”.";

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button onClick={attemptInstall} disabled={busy} className={buttonClass} style={buttonStyle}>
          {busy ? (
            <span
              className="h-3 w-3 rounded-full"
              style={{
                border: "2px solid var(--line)",
                borderTopColor: "var(--accent)",
                animation: "install-spin 0.8s linear infinite",
              }}
            />
          ) : (
            <DownloadIcon />
          )}
          {busy ? "Installing…" : deferredPrompt ? "Install app" : "Install app"}
        </button>
        {showHint && (
          <p className="max-w-[200px] text-right text-[10px] leading-snug" style={{ color: "var(--ink-faint)" }}>
            {hint}
          </p>
        )}
        <style jsx>{`
          @keyframes install-spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="border-t px-1 pt-4" style={{ borderColor: "var(--line)" }}>
      <button onClick={attemptInstall} disabled={busy} className={buttonClass} style={buttonStyle}>
        {busy ? (
          <span
            className="h-4 w-4 rounded-full"
            style={{ border: "2px solid var(--line)", borderTopColor: "var(--accent)", animation: "install-spin 0.8s linear infinite" }}
          />
        ) : (
          <DownloadIcon />
        )}
        {busy ? "Installing…" : "Install app"}
      </button>
      {showHint && (
        <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </p>
      )}
      <style jsx>{`
        @keyframes install-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}