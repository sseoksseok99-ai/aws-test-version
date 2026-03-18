import { PageHeader } from '@/components/layout/Header'
import InfoBadge from '@/components/common/InfoBadge'
import CpuBarChart from '@/components/charts/CpuBarChart'
import IoWaitChart from '@/components/charts/IoWaitChart'
import MemoryUsageCard from '@/components/charts/MemoryUsageCard'
import MemoryTrendChart from '@/components/charts/MemoryTrendChart'
import DiskUsageCard from '@/components/charts/DiskUsageCard'
import DiskIOChart from '@/components/charts/DiskIOChart'
import { useInfraMetrics } from '@/hooks/useInfraMetrics'

export default function InfraPage() {
  const { loading, error, updatedAt, cpuCoreData, ioWaitData, memoryData, memoryTrendData, diskData, diskIOData } =
    useInfraMetrics()

  return (
    <div>
      <PageHeader 
        title="인프라 세부 모니터링"
        subtitle="Node Exporter 기반 — CPU · 메모리 · 디스크 · 네트워크"
        lastUpdated={updatedAt || '대기 중'}
      />

      {error && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Prometheus에서 데이터를 불러오지 못했습니다. {error}
        </div>
      )}

      {/* Server Info Badges */}
      <div className="flex flex-wrap gap-3 mb-6">
        <InfoBadge label="서버" value="web-server-01" />
        <InfoBadge label="유형" value="t3.medium" />
        <InfoBadge label="가용 영역" value="ap-northeast-2a" />
        <InfoBadge label="IP" value="10.0.1.10" />
      </div>

      {/* CPU Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <CpuBarChart data={loading ? [] : cpuCoreData} />
        <IoWaitChart data={loading ? [] : ioWaitData} />
      </div>

      {/* Memory Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <MemoryUsageCard data={memoryData} />
        <MemoryTrendChart data={loading ? [] : memoryTrendData} />
      </div>

      {/* Disk Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DiskUsageCard data={loading ? [] : diskData} />
        <DiskIOChart data={loading ? [] : diskIOData} />
      </div>
    </div>
  )
}
