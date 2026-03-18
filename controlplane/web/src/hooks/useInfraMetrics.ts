import { useEffect, useMemo, useState } from 'react'
import { queryInstant, queryRange, sampleToNumber, type PrometheusInstantSample, type PrometheusRangeSample } from '@/lib/prometheus'

type CpuCoreRow = { core: string; user: number; system: number; iowait: number }
type TimePoint = { time: string; value: number }
type DiskItem = { mount: string; used: number; total: number; percentage: number }
type DiskIoPoint = { time: string; read: number; write: number }

export interface InfraDashboardState {
  loading: boolean
  error: string | null
  updatedAt: string
  cpuCoreData: CpuCoreRow[]
  ioWaitData: TimePoint[]
  memoryData: { used: number; cache: number; buffer: number; free: number; total: number }
  memoryTrendData: TimePoint[]
  diskData: DiskItem[]
  diskIOData: DiskIoPoint[]
}

function formatUpdatedAt(date: Date) {
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function toFixed(value: number, digits = 1) {
  return Number.isFinite(value) ? Number.parseFloat(value.toFixed(digits)) : 0
}

function uniqueLabel(samples: PrometheusInstantSample[], label: string) {
  return Array.from(new Set(samples.map((s) => s.metric[label]).filter(Boolean)))
}

function buildTimeSeries(series: PrometheusRangeSample[], key: string) {
  const first = series[0]
  if (!first) return [] as TimePoint[]

  return first.values.map(([timestamp], index) => {
    const raw = series[0]?.values[index]?.[1] ?? '0'
    return {
      time: new Date(timestamp * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      value: Number.parseFloat(raw),
    }
  })
}

function pickSample(samples: PrometheusInstantSample[], matcher: (s: PrometheusInstantSample) => boolean) {
  const match = samples.find(matcher)
  return match ? sampleToNumber(match) : 0
}

export function useInfraMetrics(refreshIntervalMs = 15_000) {
  const [state, setState] = useState<InfraDashboardState>({
    loading: true,
    error: null,
    updatedAt: '',
    cpuCoreData: [],
    ioWaitData: [],
    memoryData: { used: 0, cache: 0, buffer: 0, free: 0, total: 0 },
    memoryTrendData: [],
    diskData: [],
    diskIOData: [],
  })

  const cpuPerCoreQuery = useMemo(
    () => ({
      user: '100 * (1 - avg by (cpu) (rate(node_cpu_seconds_total{mode="idle"}[1m])))',
      system: '100 * avg by (cpu) (rate(node_cpu_seconds_total{mode="system"}[1m]))',
      iowait: '100 * avg by (cpu) (rate(node_cpu_seconds_total{mode="iowait"}[1m]))',
    }),
    [],
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [
          cpuUser,
          cpuSystem,
          cpuIowait,
          iowaitTrend,
          memTotal,
          memAvailable,
          memCached,
          memBuffers,
          memTrend,
          fsAvail,
          fsSize,
          diskRead,
          diskWrite,
        ] = await Promise.all([
          queryInstant(cpuPerCoreQuery.user),
          queryInstant(cpuPerCoreQuery.system),
          queryInstant(cpuPerCoreQuery.iowait),
          queryRange('100 * avg(rate(node_cpu_seconds_total{mode="iowait"}[1m]))', 30, 60),
          queryInstant('node_memory_MemTotal_bytes'),
          queryInstant('node_memory_MemAvailable_bytes'),
          queryInstant('node_memory_Cached_bytes'),
          queryInstant('node_memory_Buffers_bytes'),
          queryRange('100 * (1 - (avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes)))', 30, 60),
          queryInstant('node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}'),
          queryInstant('node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}'),
          queryRange('sum(rate(node_disk_read_bytes_total[1m])) / 1024 / 1024', 30, 60),
          queryRange('sum(rate(node_disk_written_bytes_total[1m])) / 1024 / 1024', 30, 60),
        ])

        const cpuNames = Array.from(
          new Set([
            ...uniqueLabel(cpuUser, 'cpu'),
            ...uniqueLabel(cpuSystem, 'cpu'),
            ...uniqueLabel(cpuIowait, 'cpu'),
          ]),
        )
          .filter((name) => name !== 'cpu-total')
          .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))

        const cpuCoreData: CpuCoreRow[] = cpuNames.map((cpu) => ({
          core: `core${cpu}`,
          user: toFixed(pickSample(cpuUser, (s) => s.metric.cpu === cpu), 0),
          system: toFixed(pickSample(cpuSystem, (s) => s.metric.cpu === cpu), 0),
          iowait: toFixed(pickSample(cpuIowait, (s) => s.metric.cpu === cpu), 0),
        }))

        const iowaitValues = iowaitTrend[0]?.values ?? []
        const ioWaitData: TimePoint[] = iowaitValues.map(([timestamp, value]) => ({
          time: new Date(timestamp * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
          value: toFixed(Number.parseFloat(value), 1),
        }))

        const totalBytes = sampleToNumber(memTotal[0] ?? [0, '0'])
        const availableBytes = sampleToNumber(memAvailable[0] ?? [0, '0'])
        const cachedBytes = sampleToNumber(memCached[0] ?? [0, '0'])
        const bufferBytes = sampleToNumber(memBuffers[0] ?? [0, '0'])

        const totalGb = totalBytes / 1024 / 1024 / 1024
        const freeGb = availableBytes / 1024 / 1024 / 1024
        const cacheGb = cachedBytes / 1024 / 1024 / 1024
        const bufferGb = bufferBytes / 1024 / 1024 / 1024
        const usedGb = Math.max(totalGb - freeGb, 0)

        const memoryData = {
          used: toFixed(usedGb, 1),
          cache: toFixed(cacheGb, 1),
          buffer: toFixed(bufferGb, 1),
          free: toFixed(freeGb, 1),
          total: toFixed(totalGb, 0),
        }

        const memoryTrendData = buildTimeSeries(memTrend, 'value').map((p) => ({ ...p, value: toFixed(p.value, 1) }))

        const diskData: DiskItem[] = fsSize.map((sizeSample) => {
          const mountpoint = sizeSample.metric.mountpoint ?? sizeSample.metric.mount ?? '/'
          const sizeBytes = sampleToNumber(sizeSample)
          const availBytes = pickSample(fsAvail, (s) => (s.metric.mountpoint ?? s.metric.mount) === mountpoint)
          const usedBytes = Math.max(sizeBytes - availBytes, 0)

          const total = sizeBytes / 1024 / 1024 / 1024
          const used = usedBytes / 1024 / 1024 / 1024
          const percentage = total > 0 ? (used / total) * 100 : 0

          return {
            mount: mountpoint,
            used: toFixed(used, 0),
            total: toFixed(total, 0),
            percentage: toFixed(percentage, 0),
          }
        })
          .filter((d) => d.total > 0)
          .sort((a, b) => b.percentage - a.percentage)
          .slice(0, 6)

        const readSeries = diskRead[0]?.values ?? []
        const writeSeries = diskWrite[0]?.values ?? []
        const diskIOData: DiskIoPoint[] = readSeries.map(([timestamp, readValue], index) => {
          const writeValue = writeSeries[index]?.[1] ?? '0'
          return {
            time: new Date(timestamp * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
            read: toFixed(Number.parseFloat(readValue), 1),
            write: toFixed(Number.parseFloat(writeValue), 1),
          }
        })

        const next: InfraDashboardState = {
          loading: false,
          error: null,
          updatedAt: formatUpdatedAt(new Date()),
          cpuCoreData,
          ioWaitData,
          memoryData,
          memoryTrendData,
          diskData,
          diskIOData,
        }

        if (!cancelled) setState(next)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Prometheus 데이터를 불러오지 못했습니다.'
        setState((cur) => ({ ...cur, loading: false, error: message }))
      }
    }

    load()
    const timer = window.setInterval(load, refreshIntervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [cpuPerCoreQuery.iowait, cpuPerCoreQuery.system, cpuPerCoreQuery.user, refreshIntervalMs])

  return state
}

