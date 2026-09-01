"use client";

import { useEffect, useState } from "react";

const LOADER_MS = 2000;
const FADE_MS = 700;

export default function Loader() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHidden(true);
    }, LOADER_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      aria-hidden={hidden}
      className={`loader fixed inset-0 z-[100] flex flex-col items-center justify-center ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{
        backgroundColor: "var(--bg)",
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-baseline select-none"
        aria-label="VOXBOX"
      >
        <span
          className="title"
          style={{
            color: "var(--ink)",
            fontSize: "clamp(1.25rem, 3vw, 1.5rem)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          VOX
        </span>

        <span
          className="title"
          style={{
            color: "var(--accent)",
            fontSize: "clamp(1.25rem, 3vw, 1.5rem)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          BOX
        </span>
      </div>

      {/* Loading indicator */}
      <div className="loader-line" role="progressbar" aria-label="Loading">
        <span className="loader-track" />
        <span className="loader-progress" />
      </div>

      <style jsx>{`
        .loader {
          --loader-width: clamp(100px, 20vw, 160px);
          --loader-height: 2px;
          --loader-color: var(--accent);
        }

        .loader-line {
          position: relative;
          width: var(--loader-width);
          height: var(--loader-height);
          margin-top: 1.5rem;
          overflow: hidden;
          border-radius: 999px;
        }

        .loader-track,
        .loader-progress {
          position: absolute;
          inset: 0;
          display: block;
          border-radius: inherit;
        }

        .loader-track {
          background: var(--ink);
          opacity: 0.12;
        }

        .loader-progress {
          width: 45%;
          background: var(--loader-color);
          transform: translateX(-120%);
          animation: loader-progress 1.6s
            cubic-bezier(0.65, 0, 0.35, 1) infinite;
          box-shadow: 0 0 10px color-mix(
            in srgb,
            var(--accent) 35%,
            transparent
          );
        }

        @keyframes loader-progress {
          0% {
            transform: translateX(-120%);
          }

          45% {
            transform: translateX(100%);
          }

          100% {
            transform: translateX(250%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .loader {
            transition: none !important;
          }

          .loader-progress {
            animation: none;
            width: 35%;
            transform: translateX(90%);
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
