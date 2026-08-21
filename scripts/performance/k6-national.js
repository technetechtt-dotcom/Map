import http from "k6/http";
import { check, sleep } from "k6";

const profile = __ENV.LOAD_PROFILE || "national";
const profiles = {
  ci: { stages: [{ duration: "20s", target: 5 }, { duration: "20s", target: 0 }], p95: 1500 },
  national: { stages: [{ duration: "30s", target: 25 }, { duration: "2m", target: 80 }, { duration: "30s", target: 0 }], p95: 750 },
};
const selected = profiles[profile] || profiles.national;

export const options = {
  scenarios: { national_map: { executor: "ramping-vus", stages: selected.stages } },
  thresholds: { http_req_failed: ["rate<0.02"], http_req_duration: [`p(95)<${selected.p95}`] },
};

const base = __ENV.BASE_URL || "http://127.0.0.1:3000";

export default function () {
  const requests = [
    ["live", `${base}/api/health/live`],
    ["health", `${base}/api/health`],
    ["home", `${base}/`],
    ["locations-nc", `${base}/api/locations?province=northern-cape&limit=200`],
    ["locations-wc", `${base}/api/locations?province=western-cape&limit=200`],
    ["locations-gp", `${base}/api/locations?province=gauteng&limit=200`],
    ["radius", `${base}/api/locations?lat=-28.738&lng=24.763&radiusKm=100&limit=200`],
    ["search", `${base}/api/search?q=digital%20skills&limit=20`],
    ["clusters", `${base}/api/locations/clusters?bounds=16,-35,33,-22&zoom=6`],
    ["organisations", `${base}/api/organisations?limit=50`],
  ];
  for (const [name, url] of requests) {
    const response = http.get(url, { tags: { endpoint: name } });
    check(response, { [`${name} status 200`]: (result) => result.status === 200 });
  }
  sleep(1);
}
