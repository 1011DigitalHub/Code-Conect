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
5. **Security By Design Gate:** Every execution plan (`plan/*.md`) must contain a `## Security By Design` section placed before the implementation steps, with all 8 checklist items from `development-workflow.md` § "Execution plans" answered explicitly. The items are: (1) Autenticacao, (2) Autorizacao/BOLA, (3) Validacao de entrada, (4) Exposicao de dados, (5) CSRF, (6) Rate limiting, (7) Gestao de segredos, (8) Risco de dependencias. A plan missing this section, or with any item left blank, is a blocker — do not proceed to implementation. The only acceptable exemption is `Sem impacto de seguranca — <motivo>` when the change has genuinely zero security surface.
