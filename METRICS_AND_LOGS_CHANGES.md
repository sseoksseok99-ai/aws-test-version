# 로그/메트릭 연동 — 추가·수정된 코드/설정 전체 목록

팀원에게 “메트릭·로그를 위해 무엇을 넣고/바꿨는지” 설명할 때 참고하는 문서입니다.  
**추가된 파일**과 **수정된 파일**을 구분해 정리했습니다.

---

## 1. 앱(메트릭 노출 대상) — `app/`

### 1-1. 수정: `app/server.js`
- **목적**: HTTP 메트릭을 Prometheus 포맷으로 노출.
- **변경 내용**:
  - `prom-client` 사용.
  - `ecommerce_app_http_requests_total` (Counter): 요청 수, 라벨 `method`, `route`, `status_code`.
  - `ecommerce_app_http_request_duration_seconds` (Histogram): 응답 시간, 동일 라벨.
  - `client.collectDefaultMetrics({ register })`: 프로세스/Node 기본 메트릭 (`ecommerce_app_process_*`, `ecommerce_app_nodejs_*`).
  - 모든 요청에 대해 `res.on("finish", ...)` 에서 위 메트릭 기록.
  - **`/metrics`** 경로 추가: `register.metrics()` 결과를 텍스트로 반환 (Prometheus scrape 대상).
- **기존**: `/healthz`, `/` JSON 응답만 있던 상태 → **추가**로 `/metrics` 및 메트릭 수집 로직 삽입.

### 1-2. 수정: `app/package.json`
- **목적**: Prometheus 클라이언트 의존성 추가.
- **변경 내용**:
  - `"dependencies": { "prom-client": "^15.1.3" }` 추가.
- **추가 파일**: `app/package-lock.json` (npm install 결과, 버전 고정용).

---

## 2. 모니터링 스택(로컬) — `controlplane/`

### 2-1. 추가: `controlplane/docker-compose.monitoring.yml`
- **목적**: 로컬에서 앱 + Prometheus + node-exporter를 한 번에 실행.
- **내용**:
  - **app**: Node 앱, 포트 8080, 볼륨 `../app:/app`.
  - **node-exporter**: 호스트 CPU/메모리/디스크 메트릭, 포트 9100, host proc/sys/rootfs 마운트.
  - **prometheus**: 설정은 `./prometheus.yml` 마운트, 포트 9090.
- **실행**: `docker compose -f docker-compose.monitoring.yml up`

### 2-2. 추가: `controlplane/prometheus.yml`
- **목적**: Prometheus가 어디서 메트릭을 수집할지 정의.
- **내용**:
  - **global**: `scrape_interval: 15s` (기본).
  - **job "ecommerce-app"**: `app:8080/metrics`, `scrape_interval: 5s`.
  - **job "node"**: `node-exporter:9100`, `scrape_interval: 5s`.
- **역할**: 앱 메트릭 + 인프라(CPU/메모리/디스크) 메트릭 수집.

---

## 3. 대시보드(프론트) — `controlplane/web/`

### 3-1. 기존 활용(메트릭 조회 기반): `web/src/lib/prometheus.ts`
- **역할**: Prometheus HTTP API 호출.
- **주요 export**:
  - `queryInstant(query)`: 단일 시점 쿼리 → `GET /api/v1/query?query=...`
  - `queryRange(query, rangeMinutes, stepSeconds)`: 구간 쿼리 → `GET /api/v1/query_range?...`
  - `PROMETHEUS_BASE_URL = '/prometheus'` (프록시 경로).
  - `sampleToNumber`, `getRouteLabel`, `prettyRouteLabel` 등 유틸.
- **비고**: 이번 작업에서 “새로 만든” 파일인지 기존 파일인지 레포 히스토리에 따라 다를 수 있음. 메트릭을 “가져오는” 모든 코드가 여기서 fetch합니다.

### 3-2. 기존 활용: `web/src/hooks/usePrometheusMetrics.ts`
- **역할**: 앱 HTTP 메트릭을 Prometheus에서 조회해 `AppHttpPage`용 상태로 변환.
- **조회하는 PromQL 예시**:
  - RPS: `sum(rate(ecommerce_app_http_requests_total[1m]))`
  - 4xx/5xx: `sum(rate(ecommerce_app_http_requests_total{status_code=~"4.."|"5.."}[1m]))`
  - P50/P95/P99: `histogram_quantile(... ecommerce_app_http_request_duration_seconds_bucket ...)`
  - 엔드포인트별 RPS/에러, 추이(rate by route) 등.
- **반환**: `loading`, `error`, `updatedAt`, `totalRps`, `error4xxPerMin`, `error5xxPerMin`, `p50Ms`, `p95Ms`, `p99Ms`, `rpsData`, `requestTrendData`, `requestTrendSeries`, `errorBarData`, `errorRateData`.
- **비고**: 앱(8080) 메트릭 전용. 기존부터 있던 훅일 가능성 높음.

### 3-3. 추가: `web/src/hooks/useInfraMetrics.ts`
- **목적**: 인프라(CPU/메모리/디스크) 메트릭을 node-exporter 기반 PromQL로 조회.
- **조회하는 PromQL 예시**:
  - CPU 코어별: `irate(node_cpu_seconds_total{mode="idle"|"system"|"iowait"}[30s])` → 사용률(%) 계산.
  - I/O wait 추이: `avg(irate(node_cpu_seconds_total{mode="iowait"}[30s]))`.
  - 메모리: `node_memory_MemTotal_bytes`, `MemAvailable_bytes`, `Cached_bytes`, `Buffers_bytes` → used/cache/buffer/free/total(GB).
  - 메모리 사용률 추이: `1 - (MemAvailable / MemTotal)`.
  - 디스크: `node_filesystem_size_bytes`, `node_filesystem_avail_bytes` → 마운트별 사용량(%).
  - 디스크 IO: `irate(node_disk_read_bytes_total[30s])`, `node_disk_written_bytes_total` → MB/s.
- **반환**: `cpuCoreData`, `ioWaitData`, `memoryData`, `memoryTrendData`, `diskData`, `diskIOData`, `loading`, `error`, `updatedAt`.
- **갱신**: 기본 5초 주기 (`refreshIntervalMs = 5_000`).

### 3-4. 수정: `web/src/pages/InfraPage.tsx`
- **목적**: 인프라 페이지를 더미 데이터가 아닌 Prometheus 실데이터로 표시.
- **변경 내용**:
  - **제거**: `@/data/mockData`에서 `cpuCoreData`, `ioWaitData`, `memoryData`, `memoryTrendData`, `diskData`, `diskIOData` import.
  - **추가**: `useInfraMetrics()` 훅 사용, 위 데이터를 훅에서 받아서 각 차트/카드에 전달.
  - **추가**: Prometheus 에러 시 배너 표시 (`error` 메시지).
  - **추가**: `lastUpdated={updatedAt || '대기 중'}`.
  - 로딩 중에는 차트용 배열을 빈 배열로 넘겨 빈 화면 방지 (`loading ? [] : cpuCoreData` 등).

### 3-5. 기존 활용: `web/src/pages/AppHttpPage.tsx`
- **역할**: 앱 HTTP 메트릭 대시보드 (RPS, 4xx/5xx, P50·P95·P99, 엔드포인트별 추이 등).
- **데이터**: `usePrometheusMetrics()` 사용 → 위 `usePrometheusMetrics` 훅에서 제공하는 값으로 렌더링.
- **비고**: 이번 작업에서 “mock 제거 → Prometheus 훅 연결”이 이미 되어 있었다고 가정. 팀에서 mock → 실데이터 전환을 한 경우 그 변경도 여기 포함됨.

### 3-6. 기존 활용: `web/vite.config.ts`
- **목적**: 개발/프리뷰 시 브라우저에서 CORS 없이 Prometheus 호출.
- **내용**:
  - `server.proxy['/prometheus']`: `target: process.env.VITE_PROMETHEUS_TARGET ?? 'http://localhost:9090'`, path는 `/prometheus` 제거 후 전달.
  - `preview.proxy['/prometheus']`: 동일.
- **결과**: 프론트는 `fetch('/prometheus/api/v1/query?query=...')` 로 호출하고, Vite가 localhost:9090으로 프록시.

---

## 4. 문서/보고서 (참고용, 코드 아님)

- **controlplane/PROMETHEUS_DASHBOARD_INTEGRATION_REPORT.md**  
  Prometheus 연동 요약, 확인 URL, 로컬 실행 방법, 트러블슈팅 등.
- **END_TO_END_PLATFORM_REPORT.md** (프로젝트 루트 또는 aws-test-version)  
  Terraform → Docker → GitHub Actions → Prometheus → 대시보드 흐름, 실행 순서, 현재 상태.
- **OBSERVABILITY_TUNING_LOG.md** (aws-test-version)  
  CPU 코어별 사용률, I/O Wait, 메모리 구성/사용률 추이 등 항목별 튜닝·검증 기록(명령어, 관찰 결과, 결론).

---

## 5. 요약 표 (팀 설명용)

| 구분 | 경로 | 설명 |
|------|------|------|
| **수정** | `app/server.js` | `/metrics` 노출, `ecommerce_app_*` 메트릭 수집 |
| **수정** | `app/package.json` | `prom-client` 의존성 추가 |
| **추가** | `app/package-lock.json` | npm lock (버전 고정) |
| **추가** | `controlplane/docker-compose.monitoring.yml` | app + prometheus + node-exporter 로컬 실행 |
| **추가** | `controlplane/prometheus.yml` | ecommerce-app, node 스크랩 설정 (5초) |
| **기반** | `controlplane/web/src/lib/prometheus.ts` | Prometheus API 호출 (queryInstant, queryRange) |
| **기반** | `controlplane/web/src/hooks/usePrometheusMetrics.ts` | 앱 HTTP 메트릭 → AppHttpPage 데이터 |
| **추가** | `controlplane/web/src/hooks/useInfraMetrics.ts` | node-exporter 인프라 메트릭 → InfraPage 데이터 |
| **수정** | `controlplane/web/src/pages/InfraPage.tsx` | mock 제거, useInfraMetrics() 사용, 에러/로딩 처리 |
| **기반** | `controlplane/web/src/pages/AppHttpPage.tsx` | usePrometheusMetrics() 로 실데이터 표시 |
| **기반** | `controlplane/web/vite.config.ts` | `/prometheus` → localhost:9090 프록시 |

**로그**: 현재 구조에서는 “로그 수집/조회”를 위한 **추가 코드나 수정은 없음**.  
메트릭만 Prometheus로 수집하고, 대시보드는 Prometheus API로 메트릭만 조회합니다.  
로그를 붙이려면 별도(CloudWatch Logs, Loki, 백엔드 프록시 등) 설계가 필요합니다.
