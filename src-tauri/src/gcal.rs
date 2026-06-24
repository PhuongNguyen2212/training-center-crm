// Google Calendar push via a service account (server-to-server, works in the
// desktop app — no browser OAuth popup). The backend pushes sessions to ONE
// shared calendar so teachers/admin can view it on their phones.
//
// Optional: if GOOGLE_SERVICE_ACCOUNT_FILE / GOOGLE_CALENDAR_ID aren't set, the
// app runs normally and every method is a no-op.

use crate::error::{AppError, AppResult};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: i64,
    exp: i64,
}

struct Inner {
    sa: ServiceAccount,
    calendar_id: String,
    http: reqwest::Client,
    token: Mutex<Option<(String, i64)>>, // (access_token, expiry unix-seconds)
}

/// Managed Tauri state. `None` when Google Calendar isn't configured.
pub struct GCal(Option<Inner>);

const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar";

impl GCal {
    pub fn from_env() -> Self {
        let Some(cal) = crate::secret!("GOOGLE_CALENDAR_ID").filter(|s| !s.trim().is_empty())
        else {
            return GCal(None);
        };
        // Dev reads the key file path; the release build embeds the key as
        // base64 (build.rs) — try the file first, then the embedded value.
        let json = crate::secret!("GOOGLE_SERVICE_ACCOUNT_FILE")
            .and_then(|p| std::fs::read_to_string(p).ok())
            .or_else(|| {
                option_env!("GOOGLE_SERVICE_ACCOUNT_B64").and_then(|b| {
                    use base64::{engine::general_purpose::STANDARD, Engine as _};
                    STANDARD.decode(b).ok().and_then(|v| String::from_utf8(v).ok())
                })
            });
        let sa = json.and_then(|s| serde_json::from_str::<ServiceAccount>(&s).ok());
        match sa {
            Some(sa) => GCal(Some(Inner {
                sa,
                calendar_id: cal,
                http: reqwest::Client::new(),
                token: Mutex::new(None),
            })),
            None => {
                eprintln!("[gcal] không đọc được service account key — tắt đồng bộ Google Calendar");
                GCal(None)
            }
        }
    }

    /// A valid access token, cached until ~1 minute before expiry.
    async fn token(&self, inner: &Inner) -> AppResult<String> {
        let now = chrono::Utc::now().timestamp();
        if let Some((t, exp)) = inner.token.lock().as_ref() {
            if *exp > now + 60 {
                return Ok(t.clone());
            }
        }
        let claims = Claims {
            iss: &inner.sa.client_email,
            scope: SCOPE,
            aud: TOKEN_URL,
            iat: now,
            exp: now + 3600,
        };
        let jwt = jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
            &claims,
            &jsonwebtoken::EncodingKey::from_rsa_pem(inner.sa.private_key.as_bytes())
                .map_err(|e| AppError::new(format!("Khóa service account không hợp lệ: {e}")))?,
        )
        .map_err(|e| AppError::new(format!("Ký JWT thất bại: {e}")))?;

        let resp: serde_json::Value = inner
            .http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", &jwt),
            ])
            .send()
            .await
            .map_err(|e| AppError::new(format!("Lỗi mạng khi lấy token Google: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::new(format!("Phản hồi token Google không hợp lệ: {e}")))?;

        let token = resp["access_token"]
            .as_str()
            .ok_or_else(|| AppError::new(format!("Google từ chối cấp token: {resp}")))?
            .to_string();
        let expires_in = resp["expires_in"].as_i64().unwrap_or(3600);
        *inner.token.lock() = Some((token.clone(), now + expires_in));
        Ok(token)
    }

    fn events_url(inner: &Inner) -> String {
        format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            inner.calendar_id.replace('@', "%40")
        )
    }

    /// Insert an event, returning its Google event id. `Ok(None)` if disabled.
    pub async fn insert_event(&self, title: &str, start: &str, end: &str) -> AppResult<Option<String>> {
        let Some(inner) = &self.0 else { return Ok(None) };
        let token = self.token(inner).await?;
        let body = json!({ "summary": title, "start": {"dateTime": start}, "end": {"dateTime": end} });
        let resp: serde_json::Value = inner
            .http
            .post(Self::events_url(inner))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::new(format!("Lỗi mạng Google Calendar: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::new(format!("Phản hồi Google Calendar không hợp lệ: {e}")))?;
        Ok(resp["id"].as_str().map(|s| s.to_string()))
    }

    pub async fn update_event(&self, event_id: &str, title: &str, start: &str, end: &str) -> AppResult<()> {
        let Some(inner) = &self.0 else { return Ok(()) };
        let token = self.token(inner).await?;
        let body = json!({ "summary": title, "start": {"dateTime": start}, "end": {"dateTime": end} });
        inner
            .http
            .put(format!("{}/{event_id}", Self::events_url(inner)))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::new(format!("Lỗi mạng Google Calendar: {e}")))?;
        Ok(())
    }

    pub async fn delete_event(&self, event_id: &str) -> AppResult<()> {
        let Some(inner) = &self.0 else { return Ok(()) };
        let token = self.token(inner).await?;
        inner
            .http
            .delete(format!("{}/{event_id}", Self::events_url(inner)))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| AppError::new(format!("Lỗi mạng Google Calendar: {e}")))?;
        Ok(())
    }
}
