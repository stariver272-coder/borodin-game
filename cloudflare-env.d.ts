declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_MODE?: "sites" | "password";
    HOST_PASSWORD?: string;
  }
}
