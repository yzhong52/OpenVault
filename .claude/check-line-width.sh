#!/bin/sh
# PostToolUse hook: warn when edited .ts/.tsx files have lines over 100 chars.
# Outputs additionalContext JSON so Claude sees the violations immediately.
f=$(jq -r '.tool_input.file_path // empty')
[ -z "$f" ] && exit 0
echo "$f" | grep -qE '\.(ts|tsx)$' || exit 0
long=$(awk 'length > 100 {print NR": "substr($0,1,90)"..."}' "$f" | head -5 | tr '\n' '\t')
[ -z "$long" ] && exit 0
jq -n --arg msg "Lines >100 chars in $(basename "$f") — fix before committing: $long" \
  '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$msg}}'
