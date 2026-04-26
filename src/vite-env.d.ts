// FILE: src/vite-env.d.ts
// PATH: src/vite-env.d.ts

/// <reference types="vite/client" />

declare const process: {
    env: Record<string, string | undefined>;
  };