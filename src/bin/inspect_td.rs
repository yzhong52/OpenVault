/// Navigate to TD EasyWeb, dump all readable elements across every frame,
/// and save the output to logs/td_landing_page.txt.
use anyhow::Result;
use chromiumoxide::{Browser, BrowserConfig};
use futures::StreamExt;
use openvault::browser::BrowserActions;
use rpassword;
use std::fs;
use std::path::Path;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        // Filter format: "global_level,module=level,..."
        // - "warn"                        → show WARN+ from all modules by default
        // - "chromiumoxide::handler=error" → override that module to ERROR+ only,
        //   suppressing its "WS Invalid message" WARNs. These fire because Chrome
        //   sends CDP event types that chromiumoxide's generated types don't yet cover;
        //   the handler skips them safely, so the noise isn't actionable.
        .with_env_filter("warn,chromiumoxide::handler=error")
        .init();

    let (mut browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .with_head()
            // Disable CDP viewport emulation so the page fills the actual window.
            // Without this, chromiumoxide forces an 800x600 viewport regardless of
            // window size, leaving blank space around the rendered content.
            .viewport(None)
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

    println!("navigating to https://easyweb.td.com ...");
    actions.navigate("https://easyweb.td.com").await?;

    // Give JS time to fully render the page and iframes
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    println!("dumping frames...");
    let dump = actions.dump_frames().await?;

    let out_path = Path::new("logs/td_landing_page.txt");
    fs::create_dir_all(out_path.parent().unwrap())?;
    fs::write(out_path, &dump)?;

    println!("saved to {}", out_path.display());

    println!("typing into username field...");
    actions
        .type_by_role_name("textbox", "Username or Access Card", "yuchen_zhong")
        .await?;

    let password = std::env::var("OPENVAULT_TD_PASSWORD")
        .unwrap_or_else(|_| rpassword::prompt_password("Password: ").unwrap());
    actions
        .type_by_role_name("textbox", "Password", &password)
        .await?;
    let first = password.chars().next().unwrap_or('?');
    let last = password.chars().last().unwrap_or('?');
    println!("password: {first}***{last} ({} chars)", password.len());

    actions.click_by_role_name("button", "Login").await?;

    // Give the page a moment to load the MFA screen.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    println!("taking MFA page snapshot...");
    let mfa_dump = actions.dump_frames().await?;
    fs::write(Path::new("logs/td_mfa.txt"), &mfa_dump)?;
    println!("saved to logs/td_mfa.txt");

    // Wait for user to complete MFA in the browser.
    println!("complete MFA in the browser, then press Enter...");
    let _ = std::io::stdin().read_line(&mut String::new());

    // Give the SPA a moment to finish rendering after MFA redirect.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    println!("taking post-login snapshot...");
    let post_login_dump = actions.dump_frames().await?;
    let post_login_path = Path::new("logs/td_post_login.txt");
    fs::write(post_login_path, &post_login_dump)?;
    println!("saved to {}", post_login_path.display());

    println!("press Enter to close...");
    let _ = std::io::stdin().read_line(&mut String::new());

    browser.close().await?;
    browser.wait().await?;
    Ok(())
}
