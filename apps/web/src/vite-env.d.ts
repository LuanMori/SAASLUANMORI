/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Onde a API responde (padrão: /api no mesmo endereço). */
  readonly VITE_API_URL?: string;
  /** Endereço da loja de teste quando a API roda sem DOMINIO_BASE (desenvolvimento). */
  readonly VITE_LOJA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
