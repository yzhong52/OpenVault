use anyhow::{Context, Result};
use chromiumoxide::Page;

pub struct BrowserActions<'a> {
    page: &'a Page,
}

impl<'a> BrowserActions<'a> {
    pub fn new(page: &'a Page) -> Self {
        Self { page }
    }

    pub async fn navigate(&self, url: &str) -> Result<()> {
        self.page.goto(url).await?;
        self.page.wait_for_navigation().await?;
        Ok(())
    }

    /// Click an element by its ARIA role and accessible name.
    /// Tries each XPath candidate in order until one succeeds.
    pub async fn click_by_role_name(&self, role: &str, name: &str) -> Result<()> {
        let el = self.find_by_role_name(role, name).await?;
        el.click().await?;
        Ok(())
    }

    /// Focus an element by role/name and type text into it.
    pub async fn type_by_role_name(&self, role: &str, name: &str, text: &str) -> Result<()> {
        let el = self.find_by_role_name(role, name).await?;
        el.click().await?;
        el.type_str(text).await?;
        Ok(())
    }

    /// Fallback: click by CSS selector.
    pub async fn click(&self, selector: &str) -> Result<()> {
        self.page.find_element(selector).await?.click().await?;
        Ok(())
    }

    /// Fallback: type into element found by CSS selector.
    pub async fn type_text(&self, selector: &str, text: &str) -> Result<()> {
        let el = self.page.find_element(selector).await?;
        el.click().await?;
        el.type_str(text).await?;
        Ok(())
    }

    /// Pause and wait for the user to press Enter in the terminal (e.g. after MFA).
    pub fn wait_for_user(&self, message: &str) {
        use std::io::{self, Write};
        print!("\n[openvault] {message}\nPress Enter when ready... ");
        io::stdout().flush().ok();
        let mut buf = String::new();
        io::stdin().read_line(&mut buf).ok();
    }

    // ── private ──────────────────────────────────────────────────────────────

    async fn find_by_role_name(
        &self,
        role: &str,
        name: &str,
    ) -> Result<chromiumoxide::element::Element> {
        // 1. Try XPath candidates in the main document
        let candidates = xpath_candidates(role, name);
        for xpath in &candidates {
            match self.page.find_xpath(xpath).await {
                Ok(el) => return Ok(el),
                Err(e) => {
                    tracing::debug!("xpath miss [{role}] \"{name}\": {xpath} → {e}");
                }
            }
        }

        // 2. Try CSS selector fallback in the main document
        for css in css_candidates(role, name) {
            match self.page.find_element(&css).await {
                Ok(el) => return Ok(el),
                Err(e) => {
                    tracing::debug!("css miss [{role}] \"{name}\": {css} → {e}");
                }
            }
        }

        // 3. The element may be inside an iframe — search via JS across all frames
        if let Ok(el) = self.find_in_frames(role, name).await {
            return Ok(el);
        }

        anyhow::bail!("could not find [{role}] \"{name}\" in main document or any iframe")
    }

    /// Search for an element across all iframes using JavaScript evaluation.
    async fn find_in_frames(
        &self,
        role: &str,
        name: &str,
    ) -> Result<chromiumoxide::element::Element> {
        let selectors = js_selectors(role, name);
        for frame in self.page.frames().await? {
            for sel in &selectors {
                // Use evaluate to check if element exists, then find_element
                let check = format!(
                    "document.querySelector({sel:?}) !== null"
                );
                if let Ok(val) = self.page.evaluate_on_frame(&frame, &check).await {
                    if val.value().and_then(|v| v.as_bool()).unwrap_or(false) {
                        if let Ok(el) = self.page.find_element_in_frame(&frame, sel).await {
                            return Ok(el);
                        }
                    }
                }
            }
        }
        anyhow::bail!("not found in any frame")
    }
}

/// Generate a ranked list of XPath expressions for a role+name pair.
/// Each expression is a single path (no `|` union) so find_xpath handles it correctly.
/// We try more specific expressions first and fall back to broader ones.
fn xpath_candidates(role: &str, name: &str) -> Vec<String> {
    if name.is_empty() {
        return vec![format!("//*[@role='{role}']")];
    }

    let n = escape_xpath(name);

    match role {
        "button" | "menuitem" => vec![
            format!("//button[normalize-space(.)='{n}']"),
            format!("//button[@aria-label='{n}']"),
            format!("//input[@type='submit' and @value='{n}']"),
            format!("//input[@type='button' and @value='{n}']"),
            format!("//*[@role='button' and normalize-space(.)='{n}']"),
            format!("//*[@role='button' and @aria-label='{n}']"),
        ],
        "link" => vec![
            format!("//a[normalize-space(.)='{n}']"),
            format!("//a[@aria-label='{n}']"),
            format!("//*[@role='link' and normalize-space(.)='{n}']"),
        ],
        "textbox" | "searchbox" => vec![
            format!("//input[@placeholder='{n}']"),
            format!("//input[@aria-label='{n}']"),
            format!("//input[@name='{n}']"),
            format!("//input[@id='{n}']"),
            format!("//textarea[@placeholder='{n}']"),
            format!("//textarea[@aria-label='{n}']"),
            format!("//*[@role='textbox' and @aria-label='{n}']"),
            format!("//*[@role='textbox' and @placeholder='{n}']"),
        ],
        "checkbox" => vec![
            format!("//input[@type='checkbox' and @aria-label='{n}']"),
            format!("//input[@type='checkbox' and @id='{n}']"),
            format!("//*[@role='checkbox' and @aria-label='{n}']"),
        ],
        "radio" => vec![
            format!("//input[@type='radio' and @aria-label='{n}']"),
            format!("//input[@type='radio' and @value='{n}']"),
        ],
        "combobox" | "listbox" => vec![
            format!("//select[@aria-label='{n}']"),
            format!("//select[@name='{n}']"),
            format!("//*[@role='combobox' and @aria-label='{n}']"),
        ],
        "tab" => vec![
            format!("//*[@role='tab' and normalize-space(.)='{n}']"),
            format!("//*[@role='tab' and @aria-label='{n}']"),
        ],
        _ => vec![
            format!("//*[@role='{role}' and normalize-space(.)='{n}']"),
            format!("//*[@role='{role}' and @aria-label='{n}']"),
        ],
    }
}

/// Escape a string for use inside an XPath string literal.
/// XPath has no escape sequences, so we handle single quotes by concatenation.
fn escape_xpath(s: &str) -> String {
    if !s.contains('\'') {
        return s.to_string();
    }
    // Split on ' and join with concat(...) — XPath has no escape sequences
    let parts: String = s
        .split('\'')
        .map(|p| format!("'{p}'"))
        .collect::<Vec<_>>()
        .join(", \"'\", ");
    format!("concat({parts})")
}
