/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NODEGUARD_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
