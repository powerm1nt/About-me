/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the Server API (empty in dev, where vite proxies /api to the local backend). */
  readonly VITE_API_BASE_URL?: string;
  /** CDN/blob base URL for static assets (pfp.jpg, logo_nwrks.png, cardboard.png, ...). */
  readonly VITE_ASSET_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}
