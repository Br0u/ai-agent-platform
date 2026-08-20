# Agno / AI Agent Platform facts

> Verified: 2026-08-20
> Sources: Agno official documentation plus the current Agent, Web BFF, Admin control-plane source and automated acceptance suites in this repository.

## Agno status and integration facts

- AgentOS exposes REST APIs for agents, teams, workflows, sessions, memory, knowledge, evals, and metrics.
- AgentOS supports bearer-token protection through `OS_SECURITY_KEY`.
- Agno publishes a self-hosted AgentUI built with Next.js and TypeScript.
- Agno supports PostgreSQL for persistent agent, team, and workflow session storage.
- Agno supports skills on agents and teams through its Skills interfaces.

## Project status

- AI Agent Platform is an internal, in-development enterprise portal.
- The platform exposes one Agent named `maduoduo`（码多多）through AgentOS. It supports OpenAI, Anthropic, Google, DashScope, DeepSeek and MiniMax adapters, with at most one active model configuration at a time.
- Admin can save, test and activate allowlisted model configurations without restarting Agent or Web. The actual active Provider and model remain deployment/runtime state and must be read from the Admin status surface rather than inferred from this document.
- Published Skills can be scanned, enabled and materialized into the current Agent runtime. Knowledge/RAG, general browser actions, multi-Agent, Team and Workflow orchestration are not connected product capabilities.
- Public and Admin chat use bounded page-memory supplied with the current request. The platform does not persist or restore chat transcripts, page text or page links.
- Public page context is anonymously refetched by the Web BFF from the configured public Origin, restricted to registered public/live routes, and is not cached.
- Public answers cross the Web boundary only after the complete structured `answer` envelope validates. Partial JSON and model reasoning are not streamed to the browser.
- Provider model-list discovery, local/Ollama/vLLM Providers and automatic capability discovery remain explicit non-goals of the current model-control specification; Model ID is supplied by the Provider or deployment owner.
