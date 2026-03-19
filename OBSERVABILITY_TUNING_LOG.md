# Observability 튜닝 로그 (controlplane)
작성일: 2026-03-18  
대상 프로젝트: `C:\aws_0318_v4\aws-test-version`

## 0. 목적
이 문서는 대시보드에서 “값이 더미처럼 보이는 문제(변화가 둔함/체감이 약함)”를 해결하기 위해 수행한 **튜닝/실험 기록**을 항목별로 남깁니다.  
추후 다른 프로젝트에 동일한 관측 항목을 붙일 때, 이 문서를 그대로 따라가며 재현/개선할 수 있도록 작성합니다.

---

## 1. CPU 코어별 사용률 (Infra → CPU 코어별 사용률)

### 1-1. 관측 대상/데이터 원천
- **데이터 원천**: `node-exporter`
  - 주요 시계열: `node_cpu_seconds_total{cpu="<n>", mode="idle|system|iowait|..."}`
- **수집기**: Prometheus
  - `job="node"`, `instance="node-exporter:9100"`
- **표시 위치**: `controlplane/web` → `InfraPage`
  - 로직: `web/src/hooks/useInfraMetrics.ts`에서 PromQL로 조회 후 Recharts로 렌더링

### 1-2. 문제(체감)
- CPU 사용률 차트가 **거의 움직이지 않아 더미 데이터처럼** 느껴짐
- 10초 정도의 짧은 부하를 줘도 변화가 작거나, 눈에 띄지 않음

### 1-3. 원인 가설
- Prometheus 스크랩이 **15초** 주기이고,
- CPU 사용률 계산이 **1분 평균(rate(...[1m]))** 기반이라,
  - **짧은 스파이크(10초)**는 평균에 묻어 체감 변화가 작게 보일 수 있음

### 1-4. 수정/튜닝한 점(실제 변경 내용)

#### (1) Prometheus 스크랩 주기 단축
- 파일: `controlplane/prometheus.yml`
- 변경:
  - `job="ecommerce-app"` → `scrape_interval: 5s`
  - `job="node"` → `scrape_interval: 5s`
- 반영:
  - Prometheus 컨테이너 재시작 필요
    - 예: `docker compose -f docker-compose.monitoring.yml restart prometheus`

#### (2) 대시보드 CPU 계산을 즉시 반응하도록 변경
- 파일: `controlplane/web/src/hooks/useInfraMetrics.ts`
- 변경:
  - CPU core별 계산:
    - (기존) `rate(...[1m])` 기반
    - (변경) `irate(...[30s])` 기반 (짧은 변화에 더 민감)
  - 프론트 갱신 주기:
    - (기존) 15초
    - (변경) 5초 (`useInfraMetrics(refreshIntervalMs = 5_000)`)

> 참고: 너무 짧은 윈도우(예: `rate(...[15s])`)는 스크랩 간격/샘플 수에 따라 값이 비거나 불안정할 수 있어, “스크랩 5초 + irate 30초” 조합을 사용합니다.

### 1-5. 검증(재현용) — CPU 사용률을 크게 올리는 명령(자동 종료)
PowerShell에서 실행(부하 후 자동 종료):

- 12 워커, 10초:
  - `docker run --rm alpine sh -lc "pids=''; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do yes > /dev/null & pids=""$pids $!""; done; sleep 10; kill $pids"`
- 12 워커, 20초:
  - `docker run --rm alpine sh -lc "pids=''; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do yes > /dev/null & pids=""$pids $!""; done; sleep 20; kill $pids"`
- 더 강하게(24 워커), 10초:
  - `docker run --rm alpine sh -lc "pids=''; for i in 1 2; do for j in 1 2 3 4 5 6 7 8 9 10 11 12; do yes > /dev/null & pids=""$pids $!""; done; done; sleep 10; kill $pids"`

### 1-6. 결론
- 스크랩/쿼리/프론트 갱신을 “더 실시간” 방향으로 튜닝한 결과,
  - `Infra`의 **CPU 코어별 사용률**이 짧은 부하에도 더 잘 반응하고
  - 사용자 관점에서 더미가 아닌 “실시간 모니터링”처럼 자연스럽게 보이도록 개선됨

---

## 2. I/O Wait 시간 추이 (Infra → I/O Wait 시간 추이)

### 2-1. 관측 대상/데이터 원천
- **데이터 원천**: `node-exporter`
  - 주요 시계열: `node_cpu_seconds_total{mode="iowait"}`
- **수집기**: Prometheus
  - `job="node"`, `instance="node-exporter:9100"`

### 2-2. 시도한 부하 명령(자동 종료)
아래와 같은 방식으로 디스크 쓰기/flush를 유도하는 명령을 사용했습니다.

- 컨테이너 내부에서 파일 쓰기/삭제 반복(`dd if=/dev/zero ... conv=fdatasync`)
- 10초 후 자동 종료되도록 `sleep 10` 후 프로세스 종료

### 2-3. 관찰 결과(특이 사항)
- **명령을 줘도 I/O Wait 차트에서 변화가 “눈으로 명확하게” 확인되지 않는 경우가 많았음**

### 2-4. 가능한 원인(메모)
I/O wait은 “디스크를 많이 쓴다”와 1:1로 즉시 튀는 지표가 아니며, 아래 상황에서는 변화가 작게 보일 수 있음.

- CPU가 I/O를 거의 기다리지 않는 환경(캐시 효과/스토리지 성능/가상화 레이어 영향)
- 컨테이너 파일시스템(overlay/tmpfs 등)에서 작업이 끝나 실제 호스트 디스크 대기가 적은 경우
- 짧은 부하(10초)가 스크랩/집계에 묻히는 경우

### 2-5. 결론/후속 방향
- “실시간으로 시원하게 튀는” 확인 목적이라면,
  - I/O wait보다 **Disk IO(Read/Write MB/s)**, **filesystem 사용량** 같은 지표가 더 명확하게 체감될 수 있음
  - 필요 시, 호스트 파일시스템에 직접 쓰는 방식(호스트 마운트) 등으로 부하 방법을 재설계한다

---

## 3. 메모리 구성 & 메모리 사용률 추이 (Infra → 메모리 구성 / 메모리 사용률 추이)

### 3-1. 관측 대상/데이터 원천
- **데이터 원천**: `node-exporter`
  - `node_memory_MemTotal_bytes`
  - `node_memory_MemAvailable_bytes`
  - `node_memory_Cached_bytes`
  - `node_memory_Buffers_bytes`
- **표시 방식**
  - “메모리 구성”: 위 값을 GB로 환산해 `used/cache/buffer/free/total`로 재구성
  - “메모리 사용률 추이”: `100 * (1 - (MemAvailable / MemTotal))` 형태로 사용률(%) 표시

### 3-2. 검증(재현용) — 메모리 사용률을 눈으로 확인하는 부하(자동 종료)
컨테이너 내부에서 메모리를 일정량 잡아먹는 방식으로 “사용 중(used)”을 증가시킵니다.
10초 후 자동 종료되어 원상복구되는 것을 확인합니다.

- 1.5GB, 10초:
  - `docker run --rm alpine sh -lc "apk add --no-cache stress-ng >/dev/null 2>&1 && stress-ng --vm 1 --vm-bytes 1500M --vm-keep --timeout 10s"`
- 3GB, 10초(더 강함):
  - `docker run --rm alpine sh -lc "apk add --no-cache stress-ng >/dev/null 2>&1 && stress-ng --vm 1 --vm-bytes 3000M --vm-keep --timeout 10s"`

### 3-3. 관찰 결과(특이 사항)
- 위 명령 실행 시,
  - `Infra`의 **메모리 구성(사용 중/캐시/버퍼/여유)** 값이 눈에 띄게 변화하고
  - 옆의 **메모리 사용률 추이** 차트도 함께 튀는 것을 확인함

### 3-4. 결론
- 메모리 항목은 부하를 주면 변화가 비교적 뚜렷하게 보여,
  - “실시간 수집/표시가 정상 동작하는지”를 확인하는 데 적합함

