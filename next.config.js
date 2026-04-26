/**
 * Browser calls same-origin /__api/*; these rewrites forward to the FastAPI backend.
 * Use 127.0.0.1 (not "localhost") by default: on Windows, Node can resolve localhost to ::1
 * while uvicorn binds IPv4-only → ECONNREFUSED and empty radar.
 * Override: BACKEND_URL=http://127.0.0.1:8000
 */
function normalizeBackendUrl(raw) {
  const base = (raw || "http://127.0.0.1:8000").replace(/\/$/, "");
  return base.replace(/^http:\/\/localhost(?=:|\/)/i, "http://127.0.0.1");
}

const backend = normalizeBackendUrl(process.env.BACKEND_URL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/__api/:path*",
        destination: `${backend}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
