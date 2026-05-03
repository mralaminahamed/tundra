# tundra-agent-logs

Application and system log collection and shipping for `tundra-agent`.

## Log sources

- Per-application stdout/stderr (tailed from systemd journal or log files)
- Nginx access and error logs
- PHP-FPM slow log
- Deployment build logs (streamed in real-time during `DeploySite` RPC)

## Delivery

Logs are shipped to `tundrad` via the `ReportLogs` gRPC streaming RPC. `tundrad` buffers them and:
1. Writes to `/var/lib/tundra/logs/deploy/<site_id>/<deployment_id>.log` for deployment logs
2. Forwards to the operator's browser over WebSocket for live tailing (`ws/v1/events` — `site:<id>:logs` subscription)
3. Rotates and prunes after 7 days (configurable, up to 90 days)

## Backpressure

If the gRPC stream falls behind, the agent drops older non-deployment log lines (ring buffer, 10 MiB per application) rather than blocking application I/O. Deployment logs are never dropped — they use a spill-to-disk buffer.
