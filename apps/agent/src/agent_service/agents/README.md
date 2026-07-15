# Agents extension boundary

No Agent or model is registered in this phase. The service exposes only a protected AgentOS shell and reports `capability: placeholder`.

A later implementation may add typed Agent definitions here after its model provider, credentials, failure policy, and tests are specified. Adding a file to this directory alone must not enable a runtime capability; registration belongs in the typed catalog.
