use anyhow::Result;
use chromiumoxide::cdp::browser_protocol::accessibility::{AxNode, GetFullAxTreeParams};
use chromiumoxide::Page;
use std::collections::HashMap;

/// Metadata for a single node, keyed by ref (@e1, @e2, ...).
#[derive(Debug, Clone)]
pub struct NodeInfo {
    pub role: String,
    pub name: String,
}

pub struct AccessibilitySnapshot {
    pub text: String,
    pub node_count: usize,
    pub refs: HashMap<String, NodeInfo>,
}

impl AccessibilitySnapshot {
    pub async fn capture(page: &Page) -> Result<Self> {
        let result = page.execute(GetFullAxTreeParams::default()).await?;
        let nodes = result.nodes.clone();
        let node_count = nodes.len();
        let (text, refs) = format_tree(&nodes);
        Ok(Self { text, node_count, refs })
    }
}

fn format_tree(nodes: &[AxNode]) -> (String, HashMap<String, NodeInfo>) {
    let mut lines = Vec::new();
    let mut refs = HashMap::new();
    let mut counter = 1usize;

    for node in nodes {
        let role = match &node.role {
            Some(r) => r.value.as_ref().and_then(|v| v.as_str()).unwrap_or(""),
            None => continue,
        };

        if matches!(
            role,
            "none" | "presentation" | "generic" | "group" | "InlineTextBox"
        ) {
            continue;
        }

        let name = node
            .name
            .as_ref()
            .and_then(|n| n.value.as_ref().and_then(|v| v.as_str()))
            .unwrap_or("")
            .trim()
            .to_string();

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

    (lines.join("\n"), refs)
}

fn is_interactive(role: &str) -> bool {
    matches!(
        role,
        "button" | "link" | "textbox" | "checkbox" | "radio" | "combobox"
            | "listbox" | "menuitem" | "option" | "tab" | "searchbox"
            | "spinbutton" | "switch"
    )
}
