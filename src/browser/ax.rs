//! Utilities for converting raw CDP accessibility nodes into a compact text
//! representation suitable for sending to an LLM.
//!
//! # Why a compact AX representation?
//!
//! A raw HTML page is typically 40–200 KB and contains layout, styling, and
//! script noise that adds no value for page *understanding*. The browser's
//! accessibility tree is already a semantic summary — roles, names, and
//! interactive state — which compresses the same page to ~1–3 KB.
//!
//! Example transformation:
//!
//! ```text
//! HTML:  <button class="btn btn-block td-btn-primary" type="submit">Login</button>
//! AX:    [button @e12] "Login"
//! ```
//!
//! Each interactive or named node is assigned a stable short ref (`@e1`, `@e2`, …)
//! that the agent uses in subsequent tool calls (click, type_text) without
//! needing to know anything about the underlying DOM.

use chromiumoxide::cdp::browser_protocol::accessibility::AxNode;
use std::collections::HashMap;

/// Metadata stored for each ref, used to resolve tool call targets back to
/// role + name so we can build XPath/CSS selectors at action time.
#[derive(Debug, Clone)]
pub struct NodeInfo {
    /// The ARIA role of the element — what kind of control it is.
    /// ARIA (Accessible Rich Internet Applications) is a W3C standard that
    /// lets HTML elements declare their semantic purpose independent of how
    /// they look. A `<div>` styled as a button can carry `role="button"` so
    /// screen readers (and this agent) treat it correctly.
    /// Examples: `"button"`, `"textbox"`, `"link"`, `"checkbox"`, `"combobox"`
    pub role: String,
    /// The accessible name — what the element is called, as a screen reader would announce it.
    /// Sourced from (in priority order): `aria-label`, `<label for="...">` text, `placeholder`,
    /// inner text, or `alt`. Examples: `"Username or Access Card"`, `"Login"`, `"Search"`
    pub name: String,
}

/// Output of [`format_ax_tree`].
pub struct AxSummary {
    /// Compact multi-line text sent to the LLM as the page observation.
    ///
    /// Each line is one node: `[role @eN] "name"`. Example:
    /// ```text
    /// [RootWebArea @e1] "EasyWeb Login"
    /// [textbox @e2] "Username or Access Card"
    /// [textbox @e3] "Password"
    /// [button @e4] "Login"
    /// [link @e5] "Forgot your username or password?"
    /// ```
    pub text: String,
    /// Total number of AX nodes returned by CDP *before* filtering out noise
    /// roles and unnamed non-interactive nodes. Useful for gauging how much
    /// the tree was compressed — e.g. 431 raw nodes → 32 lines of text.
    pub node_count: usize,
    /// Map from ref id (e.g. `"@e3"`) to its role + name.
    pub refs: HashMap<String, NodeInfo>,
}

/// Convert a flat list of raw CDP [`AxNode`]s into a compact [`AxSummary`].
///
/// **Filtering** — nodes are dropped when:
/// - Role is structural noise (`none`, `presentation`, `generic`, `group`,
///   `InlineTextBox`) — these add tokens without semantic value.
/// - Role is non-interactive *and* the node has no accessible name — unnamed
///   containers don't help the agent understand the page.
///
/// **Format** — each surviving node becomes one line:
/// ```text
/// [role @eN] "name"   — named node
/// [role @eN]          — interactive node with no name (e.g. unlabelled button)
/// ```
pub fn format_ax_tree(nodes: &[AxNode]) -> AxSummary {
    let node_count = nodes.len();
    let mut lines = Vec::new();
    let mut refs = HashMap::new();
    let mut counter = 1usize;

    for node in nodes {
        let role = match node_role(node) {
            Some(r) => r,
            None => continue,
        };

        if is_noise_role(role) {
            continue;
        }

        let name = node_name(node);

        if name.is_empty() && !is_interactive(role) {
            continue;
        }

        let ref_id = format!("@e{counter}");
        counter += 1;

        refs.insert(ref_id.clone(), NodeInfo { role: role.to_string(), name: name.clone() });

        if name.is_empty() {
            lines.push(format!("[{role} {ref_id}]"));
        } else {
            lines.push(format!("[{role} {ref_id}] \"{name}\""));
        }
    }

    AxSummary { text: lines.join("\n"), node_count, refs }
}

// ── private helpers ──────────────────────────────────────────────────────────

/// Extract the role string from a node, returning `None` if absent.
fn node_role(node: &AxNode) -> Option<&str> {
    node.role
        .as_ref()?
        .value
        .as_ref()?
        .as_str()
}

/// Extract the accessible name string from a node (empty string if absent).
fn node_name(node: &AxNode) -> String {
    node.name
        .as_ref()
        .and_then(|n| n.value.as_ref()?.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Roles that carry no semantic meaning for an LLM — pure layout/grouping nodes.
fn is_noise_role(role: &str) -> bool {
    matches!(role, "none" | "presentation" | "generic" | "group" | "InlineTextBox")
}

/// Roles that represent user-actionable controls. Interactive nodes are kept
/// even when they have no accessible name, because they may still be targetable.
fn is_interactive(role: &str) -> bool {
    matches!(
        role,
        "button" | "link" | "textbox" | "checkbox" | "radio" | "combobox"
            | "listbox" | "menuitem" | "option" | "tab" | "searchbox"
            | "spinbutton" | "switch"
    )
}
