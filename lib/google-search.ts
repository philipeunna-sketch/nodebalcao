type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function base64Url(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(credentialsJson: string) {
  const credentials = JSON.parse(credentialsJson) as ServiceAccount;
  if (!credentials.client_email || !credentials.private_key) throw new Error("SERVICE_ACCOUNT_INVALID");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/webmasters", aud: credentials.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const keyBytes = Uint8Array.from(atob(credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64Url(signature)}`;
  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "GOOGLE_TOKEN_FAILED");
  return payload.access_token;
}

export async function submitSitemapToGoogle(credentialsJson: string, siteUrl: string, sitemapUrl: string) {
  const token = await accessToken(credentialsJson);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const response = await fetch(endpoint, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`SEARCH_CONSOLE_${response.status}`);
  return { ok: true, submittedAt: new Date().toISOString() };
}
