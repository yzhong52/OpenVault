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
    /// Uses XPath so it works on both native elements (button, a, input) and
    /// elements with explicit role attributes.
    pub async fn click_by_role_name(&self, role: &str, name: &str) -> Result<()> {
        let xpath = role_name_xpath(role, name);
        self.page
            .find_xpath(&xpath)
            .await
            .with_context(|| format!("could not find [{role}] \"{name}\""))?
            .click()
            .await?;
        Ok(())
    }

    /// Focus an element by role/name and type text into it.
    pub async fn type_by_role_name(&self, role: &str, name: &str, text: &str) -> Result<()> {
        let xpath = role_name_xpath(role, name);
        let el = self
            .page
            .find_xpath(&xpath)
            .await
            .with_context(|| format!("could not find [{role}] \"{name}\""))?;
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
}

/// Build an XPath expression that finds an element by ARIA role and accessible name.
///
/// Covers:
/// - Native HTML elements with implicit roles (button, a, input, select, textarea)
/// - Elements with explicit role attributes
/// - Name matching via: text content, aria-label, placeholder, value
fn role_name_xpath(role: &str, name: &str) -> String {
    // Escape single quotes in name for XPath
    let name_escaped = name.replace('\'', "\\'");

    let name_check = if name.is_empty() {
        String::new()
    } else {
        format!(
            "[normalize-space(.)='{name_escaped}' \
             or @aria-label='{name_escaped}' \
             or @placeholder='{name_escaped}' \
             or @value='{name_escaped}']"
        )
    };

    match role {
        "button" | "menuitem" => format!(
            "//button{name_check} \
             | //input[@type='button' or @type='submit' or @type='reset']{name_check} \
             | //*[@role='button']{name_check} \
             | //*[@role='menuitem']{name_check}"
        ),
        "link" => format!(
            "//a{name_check} \
             | //*[@role='link']{name_check}"
        ),
        "textbox" | "searchbox" => format!(
            "//input[@type='text' or @type='email' or @type='search' or not(@type)]{name_check} \
             | //textarea{name_check} \
             | //*[@role='textbox' or @role='searchbox']{name_check}"
        ),
        "password" => format!(
            "//input[@type='password']{name_check}"
        ),
        "checkbox" => format!(
            "//input[@type='checkbox']{name_check} \
             | //*[@role='checkbox']{name_check}"
        ),
        "radio" => format!(
            "//input[@type='radio']{name_check} \
             | //*[@role='radio']{name_check}"
        ),
        "combobox" | "listbox" => format!(
            "//select{name_check} \
             | //*[@role='combobox' or @role='listbox']{name_check}"
        ),
        "tab" => format!(
            "//*[@role='tab']{name_check}"
        ),
        _ => format!(
            "//*[@role='{role}']{name_check}"
        ),
    }
}
