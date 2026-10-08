/**
 * Cloudflare Pages Functions Middleware
 * Protects all routes on Cloudflare Pages using HTTP Basic Authentication.
 * 
 * Setup:
 * 1. In Cloudflare Dashboard -> Workers & Pages -> [Your Project] -> Settings -> Variables and secrets
 * 2. Add an environment variable named 'APP_PASSWORD' with your secret password.
 *    (Optional: Set APP_PASSWORD to 'DISABLED' or 'PUBLIC' if you wish to allow unrestricted access).
 */

interface Env {
  APP_PASSWORD?: string;
}

type EventContext = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
};

export async function onRequest(context: EventContext): Promise<Response> {
  const { request, env } = context;

  // Allow CORS preflight requests
  if (request.method === "OPTIONS") {
    return context.next();
  }

  const expectedPassword = env.APP_PASSWORD;

  // If explicitly configured to be disabled or public, bypass authentication
  if (
    expectedPassword &&
    (expectedPassword.toUpperCase() === "DISABLED" ||
      expectedPassword.toUpperCase() === "PUBLIC" ||
      expectedPassword.toUpperCase() === "NONE")
  ) {
    return context.next();
  }

  // Strict enforcement: Require the Cloudflare APP_PASSWORD secret to be configured
  if (!expectedPassword) {
    const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Setup Required | Canvas AI Canary Studio</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 580px; width: 100%; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px; }
    ol { margin: 0 0 24px; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #cbd5e1; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-size: 13px; border: 1px solid #1e293b; }
    .note { background: #0f172a; border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🛡️ Cloudflare Edge Security</div>
    <h1>Edge Authentication Secret Required</h1>
    <p>This deployment is protected by Cloudflare Pages Edge Authentication, but the <code>APP_PASSWORD</code> secret has not yet been set in your Cloudflare dashboard.</p>
    <ol>
      <li>Log into your <strong>Cloudflare Dashboard</strong> and open this Pages project.</li>
      <li>Navigate to <strong>Settings</strong> &rarr; <strong>Variables and secrets</strong>.</li>
      <li>Under <strong>Environment Variables</strong>, add a secret named: <code>APP_PASSWORD</code></li>
      <li>Set the value to your preferred password (or set it to <code>DISABLED</code> for open access).</li>
      <li>Trigger a new deployment or refresh this page.</li>
    </ol>
    <div class="note">
      <strong>Security Notice:</strong> To protect academic integrity workflows, access fails closed until this secret is configured.
    </div>
  </div>
</body>
</html>`;

    return new Response(errorHtml, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "60",
      },
    });
  }

  // Read Authorization header
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return new Response("Authentication required to access Canvas AI Canary Studio.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Canvas AI Canary Studio", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // Parse "Basic <base64>"
  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return new Response("Invalid Authorization header format.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Canvas AI Canary Studio", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    // Decode Base64 credentials with UTF-8 support
    const binaryStr = atob(encoded);
    const bytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const separatorIdx = decoded.indexOf(":");
    // Supports any username; validates the password
    const enteredPassword = separatorIdx !== -1 ? decoded.slice(separatorIdx + 1) : decoded;

    if (enteredPassword !== expectedPassword) {
      return new Response("Unauthorized: Invalid password entered.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Canvas AI Canary Studio", charset="UTF-8"',
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  } catch (_e) {
    return new Response("Failed to decode authentication credentials.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Canvas AI Canary Studio", charset="UTF-8"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // Password verified! Serve the page / assets normally
  return context.next();
}
