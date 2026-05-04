import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 100 },
    { duration: '60s', target: 100 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:audit-log}': ['p(95)<150'],
    'http_req_failed': ['rate<0.001'],
  },
};

const BASE_URL = __ENV.TUNDRA_BASE_URL || 'http://localhost:7400';
const TOKEN = __ENV.TUNDRA_TOKEN || 'test-token';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/audit-log?limit=50`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    tags: { name: 'audit-log' },
  });
  check(res, { 'status 200 or 401': (r) => r.status === 200 || r.status === 401 });
}
