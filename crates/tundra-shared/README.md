# tundra-shared

Types and utilities shared between the `tundrad` control plane and the `tundra-agent` fleet daemon.

## Contents

- Common UUID, status enum, and DTO definitions used in both binaries
- Shared error codes that appear in both the REST API and the gRPC agent protocol
- Utility functions with no I/O dependency (ID generation helpers, time utilities)

## Constraint

This crate must remain lightweight — it is compiled into both `tundrad` and `tundra-agent`. Avoid adding heavy dependencies. If a type is only needed in the control plane, it belongs in `tundrad-domain`; if only in the agent, it belongs in `tundra-agent-rpc` or an agent-specific crate.
