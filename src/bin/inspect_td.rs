/// Standalone inspector: navigates to TD EasyWeb and dumps all input
/// elements across every frame so we know the exact attributes to target.
use anyhow::Result;
use chromiumoxide::{Browser, BrowserConfig};
use futures::StreamExt;
use openvault::browser::BrowserActions;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("warn")
        .init();

    let (browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .with_head()
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
            let _ = event;
        }
    });

    let page = browser.new_page("about:blank").await?;
    let actions = BrowserActions::new(&page);

    println!("navigating to TD EasyWeb...");
    actions.navigate("https://easyweb.td.com").await?;

    // Wait a moment for JS to render
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    println!("dumping frames...\n");
    let dump = actions.dump_frames().await?;
    println!("{dump}");

    Ok(())
}
