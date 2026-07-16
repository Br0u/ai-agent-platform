# Agents extension boundary

The fixed default Agent is currently implemented in `../default_agent.py`. The typed catalog in `../catalog.py` is the only place that enables it after validated model settings are available; otherwise the catalog reports the placeholder capability.

Future additional Agent definitions belong in this directory after their model provider, credentials, failure policy, and tests are specified. Adding a file here alone must never enable runtime capability; registration remains explicit in the typed catalog.
