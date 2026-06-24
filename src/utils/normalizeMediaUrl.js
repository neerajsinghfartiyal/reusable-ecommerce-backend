/**
 * Normalize media/product image URLs to a canonical pathname for usage matching.
 * Aligns with admin MediaPicker normalizeMediaUrlPath behavior.
 */

const normalizeMediaUrlPath = (url) => {
  const trimmed = String(url || "").trim().replace(/\\/g, "/");
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const { pathname } = new URL(trimmed);
      return pathname.replace(/\/+/g, "/").toLowerCase();
    }
  } catch {
    // ignore invalid absolute URL
  }

  const baseUrl = getApiBaseUrl();
  let path = trimmed;
  if (baseUrl && path.startsWith(baseUrl)) {
    path = path.slice(baseUrl.length);
  }

  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path.replace(/\/+/g, "/").toLowerCase();
};

const getApiBaseUrl = () =>
  String(
    process.env.API_BASE_URL ||
      process.env.APP_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://localhost:5000",
  ).replace(/\/$/, "");

const toStoredImageUrl = (url) => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";

  const baseUrl = getApiBaseUrl();
  if (baseUrl && trimmed.startsWith(baseUrl)) {
    const relative = trimmed.slice(baseUrl.length);
    return relative.startsWith("/") ? relative : `/${relative}`;
  }

  return trimmed;
};

module.exports = {
  normalizeMediaUrlPath,
  getApiBaseUrl,
  toStoredImageUrl,
};
