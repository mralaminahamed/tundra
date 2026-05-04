import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp up
    { duration: '60s', target: 50 },   // sustain
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration{name:list-sites}': ['p(95)<150'],  // p95 < 150ms
    'http_req_failed': ['rate<0.001'],                    // <0.1% errors
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TUNDRA_BASE_URL || 'http://localhost:7400';
const TOKEN = __ENV.TUNDRA_TOKEN || 'test-token';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/sites?limit=25`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    tags: { name: 'list-sites' },
  });

  const success = check(res, {
    'status 200': (r) => r.status === 200,
    'response has data': (r) => r.json('data') !== undefined,
  });

  errorRate.add(!success);
  sleep(0.1);
}
