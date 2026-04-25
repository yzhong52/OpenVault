use crate::browser::Session;
use anyhow::{Context, Result};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: Value,
}

pub struct ToolResult {
    pub output: String,
}

pub async fn execute(call: &ToolCall, session: &Session) -> Result<ToolResult> {
    let actions = session.actions();

    let output = match call.name.as_str() {
        "navigate" => {
            let url = call.input["url"].as_str().unwrap_or("");
            actions.navigate(url).await?;
            format!("navigated to {url}")
        }

        "click" => {
            let ref_id = call.input["ref"].as_str().unwrap_or("");
            let node = session
                .resolve_ref(ref_id)
                .with_context(|| format!("unknown ref {ref_id} — take a snapshot first"))?;
            actions.click_by_role_name(&node.role, &node.name).await?;
            format!("clicked {ref_id} ({} \"{}\")", node.role, node.name)
        }

        "type_text" => {
            let ref_id = call.input["ref"].as_str().unwrap_or("");
            let text = call.input["text"].as_str().unwrap_or("");
            let node = session
                .resolve_ref(ref_id)
                .with_context(|| format!("unknown ref {ref_id} — take a snapshot first"))?;
            actions.type_by_role_name(&node.role, &node.name, text).await?;
            format!("typed into {ref_id} ({} \"{}\")", node.role, node.name)
        }

        "snapshot" => {
            let snap = session.snapshot().await?;
            snap.text
        }

        "wait_for_mfa" => {
            actions.wait_for_user("MFA required. Complete verification in the browser window.");
            "MFA complete — resuming".to_string()
        }

        "done" => call.input["result"].as_str().unwrap_or("done").to_string(),

        // Diagnostic: dump all inputs/buttons across every frame so we can
        // see exactly what attributes are on the elements the agent needs to target.
        "dump_frames" => {
            session.actions().dump_frames().await?
        }

        unknown => anyhow::bail!("unknown tool: {unknown}"),
    };

    Ok(ToolResult { output })
}
