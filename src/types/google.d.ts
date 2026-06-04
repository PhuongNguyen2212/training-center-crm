// Minimal typing for the Google Identity Services global loaded at runtime
// from https://accounts.google.com/gsi/client (browser OAuth token flow).
export {};

declare global {
  interface TokenResponse {
    access_token: string;
    expires_in: number;
    error?: string;
  }
  interface TokenClient {
    requestAccessToken: (opts?: { prompt?: string }) => void;
  }
  const google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (resp: TokenResponse) => void;
        }) => TokenClient;
        revoke: (token: string, done?: () => void) => void;
      };
    };
  };
  interface Window {
    google?: typeof google;
  }
}
