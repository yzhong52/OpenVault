mod actions;
mod network;
mod snapshot;

pub use actions::BrowserActions;
pub use network::NetworkInterceptor;
pub use snapshot::{AccessibilitySnapshot, NodeInfo};

use anyhow::Result;
use chromiumoxide::{Browser, BrowserConfig, Page};
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct Session {
    browser: Browser,
    pub page: Page,
    /// Latest snapshot ref map, shared with tool executor.
    refs: Arc<Mutex<HashMap<String, NodeInfo>>>,
}

impl Session {
    pub async fn launch() -> Result<Self> {
        let (browser, mut handler) = Browser::launch(
            BrowserConfig::builder()
                .with_head() // visible browser — needed for MFA
                // Suppress the NTP and first-run UI that triggers undeserializable
                // CDP events (Page.frameRequestedNavigation) and kills the handler.
                .args([
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-default-apps",
                    "--disable-extensions",
                ])
                .build()
                .map_err(|e| anyhow::anyhow!(e))?,
        )
        .await?;

        tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if let Err(e) = event {
                    tracing::warn!("browser handler error: {e}");
                }
            }
        });

        let page = browser.new_page("about:blank").await?;
        Ok(Self {
            browser,
            page,
            refs: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn close(mut self) -> Result<()> {
        self.browser.close().await?;
        Ok(())
    }

    pub fn actions(&self) -> BrowserActions<'_> {
        BrowserActions::new(&self.page)
    }

    pub fn interceptor(&self) -> NetworkInterceptor<'_> {
        NetworkInterceptor::new(&self.page)
    }

    /// Take a fresh accessibility snapshot and update the internal ref map.
    pub async fn snapshot(&self) -> Result<AccessibilitySnapshot> {
        let snap = AccessibilitySnapshot::capture(&self.page).await?;
        *self.refs.lock().unwrap() = snap.refs.clone();
        Ok(snap)
    }

    /// Resolve an @eN ref to its NodeInfo from the most recent snapshot.
    pub fn resolve_ref(&self, ref_id: &str) -> Option<NodeInfo> {
        self.refs.lock().unwrap().get(ref_id).cloned()
    }
}
