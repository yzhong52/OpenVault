/// Navigate to Wealthsimple login, dump accessibility snapshots at each step,
/// and save outputs to logs/ws_*.txt.
///
/// If the session is already authenticated (browser remembered the login),
/// the login form won't be present and the script skips straight to capturing
/// the logged-in dashboard snapshot.
use anyhow::Result;
use chromiumoxide::{Browser, BrowserConfig};
use futures::StreamExt;
use openvault::browser::BrowserActions;
use rpassword;
use std::fs;
use std::io::Write;
use std::path::Path;

const LOGIN_URL: &str = "https://my.wealthsimple.com/app/login?locale=en-ca";

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("warn,chromiumoxide::handler=error")
        .init();

    let (mut browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .with_head()
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

    fs::create_dir_all("logs")?;

    let page = browser.new_page(LOGIN_URL).await?;
    let actions = BrowserActions::new(&page);

    // Give JS time to fully render the page.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    println!("taking initial snapshot...");
    let dump = actions.dump_frames().await?;
    fs::write(Path::new("logs/ws_login.txt"), &dump)?;
    println!("saved to logs/ws_login.txt");

    // Check if we're already logged in by looking for the login form.
    // If the email field is absent, the session is still active.
    let already_logged_in = !dump.contains("Log in email");

    if already_logged_in {
        println!("already logged in — skipping login flow");
    } else {
        println!("login form detected — signing in...");

        let email = std::env::var("OPENVAULT_WS_USERNAME")
            .unwrap_or_else(|_| {
                print!("Email: ");
                std::io::stdout().flush().ok();
                use std::io::BufRead;
                std::io::stdin().lock().lines().next().unwrap().unwrap()
            });
        let password = std::env::var("OPENVAULT_WS_PASSWORD")
            .unwrap_or_else(|_| rpassword::prompt_password("Password: ").unwrap());

        let first = password.chars().next().unwrap_or('?');
        let last = password.chars().last().unwrap_or('?');
        println!("password: {first}***{last} ({} chars)", password.len());

        actions.type_by_role_name("textbox", "Log in email", &email).await?;
        actions.type_by_role_name("textbox", "Password", &password).await?;
        actions.click_by_role_name("button", "Log in").await?;

        // Give the page a moment to load the MFA screen.
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        println!("taking MFA page snapshot...");
        let mfa_dump = actions.dump_frames().await?;
        fs::write(Path::new("logs/ws_mfa.txt"), &mfa_dump)?;
        println!("saved to logs/ws_mfa.txt");

        // Check if MFA is required.
        if mfa_dump.contains("Enter your code") {
            print!("Enter 6-digit verification code: ");
            std::io::stdout().flush()?;
            let mut otp = String::new();
            std::io::stdin().read_line(&mut otp)?;
            let otp = otp.trim();

            actions.type_by_role_name("textbox", "Enter your code", otp).await?;
            actions.click_by_role_name("button", "Submit").await?;

            // Give the SPA a moment to finish rendering after OTP submit.
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    }

    println!("taking post-login snapshot...");
    let post_login_dump = actions.dump_frames().await?;
    fs::write(Path::new("logs/ws_post_login.txt"), &post_login_dump)?;
    println!("saved to logs/ws_post_login.txt");

    println!("press Enter to close...");
    let _ = std::io::stdin().read_line(&mut String::new());

    browser.close().await?;
    browser.wait().await?;
    Ok(())
}
