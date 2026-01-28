import { pkceChallenge, randomString } from "./pkce";

const REGION = (import.meta as any).env.VITE_GC_REGION as string;
const CLIENT_ID = (import.meta as any).env.VITE_GC_CLIENT_ID as string;
const REDIRECT_URI = (import.meta as any).env.VITE_GC_REDIRECT_URI as string;

function loginHost() {
  // es: login.eu-west-1.pure.cloud
  return `https://login.${REGION}.pure.cloud`;
}

export async function startLogin() {
  const verifier = randomString(64);
  const challenge = await pkceChallenge(verifier);
  const state = randomString(32);

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state", state);

  const url = new URL(`${loginHost()}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  // NON usare prompt=login, così se l’utente è già loggato passa “silenzioso”
  window.location.assign(url.toString());
}

export async function exchangeCodeForToken(code: string) {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("Missing PKCE verifier");

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", CLIENT_ID);
  body.set("redirect_uri", REDIRECT_URI);
  body.set("code", code);
  body.set("code_verifier", verifier);

  const res = await fetch(`${loginHost()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return (await res.json()) as { access_token: string; expires_in: number; token_type: string };
}
