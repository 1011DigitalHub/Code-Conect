# Wikipedia Tecnica — Code Connect

Bem-vindo(a) a base de conhecimento tecnico do projeto. Esta Wiki documenta os
**conceitos, decisoes de arquitetura, regras de seguranca, padroes de UI e
praticas de QA** do Code Connect.

> **Documentacao como Codigo:** todo PR que altera conceitos de
> arquitetura/seguranca/UI/QA deve atualizar a pagina correspondente aqui, no
> mesmo PR. O workflow [`validate-wiki.yml`](../../.github/workflows/validate-wiki.yml)
> verifica essa sincronia automaticamente.

## Indice

| Area | Pagina(s) | Guia de referencia (codigo) |
| --- | --- | --- |
| Arquitetura | [Backend](arquitetura-backend.md) · [API REST e Swagger](api-rest-e-swagger.md) | [`backend-architecture.md`](../../.github/ai-guidelines/backend-architecture.md) |
| Seguranca | [Autenticacao](seguranca-autenticacao.md) · [CSRF](seguranca-csrf.md) · [Senhas, Rate Limiting e Headers](seguranca-senhas-rate-limiting-headers.md) · [OIDC](seguranca-oidc.md) | [`security-standards.md`](../../.github/ai-guidelines/security-standards.md) |
| UI / UX | [Atomic Design](frontend-atomic-design.md) · [API, Estado e Estilo](frontend-api-estado-estilo.md) · [Acessibilidade e SEO](frontend-acessibilidade-seo.md) | [`frontend-architecture.md`](../../.github/ai-guidelines/frontend-architecture.md) · [`frontend-ux-seo.md`](../../.github/ai-guidelines/frontend-ux-seo.md) |
| Dados / Persistencia | [Banco de Dados](banco-de-dados-e-persistencia.md) | [`database-persistence.md`](../../.github/ai-guidelines/database-persistence.md) |
| QA / Testes & Workflow | [Estrategia de Testes](qa-estrategia-testes.md) · [Governanca](governanca-workflow.md) | [`development-workflow.md`](../../.github/ai-guidelines/development-workflow.md) |
| Ferramentas | [Ferramentas de Desenvolvimento](ferramentas-desenvolvimento.md) | [`CLAUDE.md`](../../CLAUDE.md) |

## Como contribuir

1. Ao criar/alterar um conceito, adicione ou atualize a pagina da area correspondente.
2. Atualize este **Indice** com o link para a nova pagina.
3. Marque, no final da pagina, o(s) arquivo(s) de codigo que ela documenta
   (rastreabilidade teoria <-> codigo).
