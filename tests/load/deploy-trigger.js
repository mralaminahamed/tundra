import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:deploy-trigger}': ['p(95)<250'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TUNDRA_BASE_URL || 'http://localhost:7400';
const TOKEN = __ENV.TUNDRA_TOKEN || 'test-token';
const SITE_ID = __ENV.TUNDRA_SITE_ID || '00000000-0000-0000-0000-000000000001';

export default function () {
  const res = http.post(
    `${BASE_URL}/api/v1/sites/${SITE_ID}/deployments`,
    JSON.stringify({ ref: 'main' }),
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'deploy-trigger' },
    }
  );
  check(res, { 'status 202 or 401 or 404': (r) => [202, 401, 404].includes(r.status) });
}
