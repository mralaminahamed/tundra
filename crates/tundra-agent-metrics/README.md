# tundra-agent-metrics

Server and application metrics collection for `tundra-agent`. Reads from OS interfaces and service APIs; streams samples to `tundrad` via gRPC.

## Metric sources

| Source | Metrics |
|--------|---------|
| `/proc/stat`, `/proc/meminfo` | CPU usage, memory usage, swap |
| `/proc/diskstats` | Disk I/O per block device |
| `/proc/net/dev` | Network bytes/packets in/out per interface |
| Nginx stub_status | Requests/s, active connections |
| PHP-FPM status page | Pool utilisation, queue length, slow requests |
| PostgreSQL `pg_stat_*` | Connections, locks, transaction rate |
| Valkey `INFO` | Memory usage, command rate, keyspace hits |

## Streaming

Metrics are batched into `StreamMetrics` gRPC calls every 15 seconds (configurable). `tundrad` writes samples to the `metrics_samples` partitioned table and updates `server_metrics_state` for the dashboard.

## Labels

Each sample carries `scope_type` + `scope_id` labels for routing to the correct dashboard widget. Per-application metrics also carry the application UUID.
