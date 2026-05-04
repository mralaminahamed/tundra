use criterion::{Criterion, black_box, criterion_group, criterion_main};

fn cron_parse_bench(c: &mut Criterion) {
    c.bench_function("cron::parse simple", |b| {
        b.iter(|| {
            // Simple cron expression parsing
            let expr = black_box("*/15 * * * *");
            // Parse into 5 fields: min hour dom mon dow
            let parts: Vec<&str> = expr.split_whitespace().collect();
            assert_eq!(parts.len(), 5);
            parts
        });
    });

    c.bench_function("cron::parse complex", |b| {
        b.iter(|| {
            let expr = black_box("0,15,30,45 8-18 * 1-3,7-9 1-5");
            let parts: Vec<&str> = expr.split_whitespace().collect();
            assert_eq!(parts.len(), 5);
            parts
        });
    });
}

fn uuid_generation_bench(c: &mut Criterion) {
    c.bench_function("uuidv7 generate", |b| {
        b.iter(|| {
            black_box(uuid::Uuid::new_v7(uuid::timestamp::Timestamp::now(
                uuid::timestamp::context::NoContext,
            )))
        });
    });
}

fn json_serialize_bench(c: &mut Criterion) {
    use serde_json::json;
    c.bench_function("json::serialize site response", |b| {
        let site = json!({
            "id": "01900000-0000-7000-8000-000000000001",
            "name": "my-site",
            "primary_domain": "my-site.example.com",
            "status": "active",
            "server_id": "01900000-0000-7000-8000-000000000002",
            "created_at": "2026-05-04T00:00:00Z"
        });
        b.iter(|| black_box(serde_json::to_string(&site).unwrap()));
    });
}

criterion_group!(
    benches,
    cron_parse_bench,
    uuid_generation_bench,
    json_serialize_bench
);
criterion_main!(benches);
