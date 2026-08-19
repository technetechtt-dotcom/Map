import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    map_users: { executor: "ramping-vus", stages: [{ duration: "30s", target: 25 }, { duration: "2m", target: 100 }, { duration: "30s", target: 0 }] },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<750"] },
};

const base = __ENV.BASE_URL || "http://127.0.0.1:3000";

export default function () {
  const requests = [
    ["locations", `${base}/api/locations?province=northern-cape&limit=200`],
    ["radius", `${base}/api/locations?lat=-28.738&lng=24.763&radiusKm=100&limit=200`],
    ["search", `${base}/api/search?q=digital%20skills&limit=20`],
    ["viewport", `${base}/api/locations/clusters?bounds=16,-35,33,-22&zoom=6`],
  ];
  for (const [name, url] of requests) {
    const response = http.get(url, { tags: { endpoint: name } });
    check(response, { [`${name} status 200`]: (result) => result.status === 200 });
  }
  sleep(1);
}
