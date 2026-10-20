---
paths:
  - "plan/*.md"
  - ".mcp.json"
  - ".claude/settings.local.json"
  - "docker-compose.yml"
---
# DevSecOps Execution Plan Automation Rule

You are modifying or creating an architecture design, a configuration file, or an execution plan. You must enforce the project's strict security guidelines:

1. **Validate Against Guidelines:** Read and cross-reference `.github/ai-guidelines/security-standards.md` and `development-workflow.md` before approving the steps.
2. **Enforce Local Containers:** If the plan involves integrating tools/AI tools (like MCP servers), it MUST default to the local Docker Sidecar architecture using local static documentation folders.
3. **Explicit Permissions Only:** Reject any automation step that uses wildcards (`*`) or dynamic `npx` execution.
4. **Format Verification:** Ensure the plan includes a table of "Arquivos Modificados" and clear verification steps with sequential validation.
