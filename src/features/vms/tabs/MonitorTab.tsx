import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { getInstance } from '@/api/instances'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { formatBytes } from '@/utils/format'
import { format } from 'date-fns'

interface Props {
  instanceId: number
}

interface DataPoint {
  time: string
  cpu: number
  memPct: number
  storPct: number
  netKBs: number
}

function ChartCard({
  title,
  data,
  color,
  yFormatter,
  tooltipFormatter,
  currentLabel,
}: {
  title: string
  data: Array<{ time: string; value: number }>
  color: string
  yFormatter: (v: number) => string
  tooltipFormatter: (v: number) => string
  currentLabel?: string
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">{title}</div>
        {currentLabel && (
          <span className="text-xs font-semibold" style={{ color }}>
            {currentLabel}
          </span>
        )}
      </div>
      {data.length < 2 ? (
        <div className="h-36 flex items-center justify-center text-xs" style={{ color: '#566278' }}>
          Collecting data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 2" stroke="#1E2A45" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#566278' }}
              tickFormatter={(v) => {
                try { return format(new Date(v), 'HH:mm') } catch { return v }
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#566278' }}
              tickFormatter={yFormatter}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: '#1A2035',
                border: '1px solid #2A3450',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(v) => {
                try { return format(new Date(v), 'HH:mm:ss') } catch { return String(v) }
              }}
              formatter={(v: number) => [tooltipFormatter(v), title]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${title})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function MonitorTab({ instanceId }: Props) {
  const { data: instance, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['instance', instanceId],
    queryFn: () => getInstance(instanceId),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const [points, setPoints] = useState<DataPoint[]>([])

  useEffect(() => {
    if (!instance?.stats) return
    const stats = instance.stats
    const maxMem = instance.maxMemory ?? stats.maxMemory ?? 0
    const maxStor = instance.maxStorage ?? stats.maxStorage ?? 0

    setPoints((prev) => [
      ...prev.slice(-60),
      {
        time: stats.ts ?? new Date().toISOString(),
        cpu: stats.cpuUsage ?? 0,
        memPct: maxMem > 0 ? (stats.usedMemory / maxMem) * 100 : 0,
        storPct: maxStor > 0 ? (stats.usedStorage / maxStor) * 100 : 0,
        netKBs: (stats.networkRxUsage ?? 0) + (stats.networkTxUsage ?? 0),
      },
    ])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt])

  if (isLoading) return <PageLoader />

  if (!instance?.stats) {
    return (
      <div className="empty-state">
        <p className="text-sm" style={{ color: '#8B9AB0' }}>No monitoring data available</p>
      </div>
    )
  }

  const stats = instance.stats
  const maxMem = instance.maxMemory ?? stats.maxMemory ?? 0
  const maxStor = instance.maxStorage ?? stats.maxStorage ?? 0
  const cpuPct = stats.cpuUsage ?? 0
  const memPct = maxMem > 0 ? (stats.usedMemory / maxMem) * 100 : 0
  const storPct = maxStor > 0 ? (stats.usedStorage / maxStor) * 100 : 0
  const netKBs = (stats.networkRxUsage ?? 0) + (stats.networkTxUsage ?? 0)

  const chartPoints = {
    cpu: points.map((p) => ({ time: p.time, value: p.cpu })),
    mem: points.map((p) => ({ time: p.time, value: p.memPct })),
    stor: points.map((p) => ({ time: p.time, value: p.storPct })),
    net: points.map((p) => ({ time: p.time, value: p.netKBs })),
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Stat Summary Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'CPU', value: `${cpuPct.toFixed(1)}%`, color: cpuPct > 80 ? '#EF4444' : '#00B388' },
          { label: 'Memory Used', value: stats.usedMemory ? formatBytes(stats.usedMemory) : '—', color: memPct > 80 ? '#EF4444' : '#60A5FA' },
          { label: 'Storage Used', value: stats.usedStorage ? formatBytes(stats.usedStorage) : '—', color: storPct > 80 ? '#EF4444' : '#A78BFA' },
          { label: 'Network I/O', value: netKBs > 0 ? `${netKBs.toFixed(0)} KB/s` : '—', color: '#F59E0B' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center py-3">
            <div className="text-xl font-bold" style={{ color }}>{value}</div>
            <div className="text-2xs mt-1" style={{ color: '#566278' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 4 Charts */}
      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Memory"
          data={chartPoints.mem}
          color="#60A5FA"
          yFormatter={(v) => `${v.toFixed(0)}%`}
          tooltipFormatter={(v) => `${v.toFixed(1)}%`}
          currentLabel={stats.usedMemory && maxMem ? `${formatBytes(stats.usedMemory)} / ${formatBytes(maxMem)}` : undefined}
        />
        <ChartCard
          title="Storage"
          data={chartPoints.stor}
          color="#A78BFA"
          yFormatter={(v) => `${v.toFixed(0)}%`}
          tooltipFormatter={(v) => `${v.toFixed(1)}%`}
          currentLabel={stats.usedStorage && maxStor ? `${formatBytes(stats.usedStorage)} / ${formatBytes(maxStor)}` : undefined}
        />
        <ChartCard
          title="CPU"
          data={chartPoints.cpu}
          color="#00B388"
          yFormatter={(v) => `${v.toFixed(0)}%`}
          tooltipFormatter={(v) => `${v.toFixed(1)}%`}
          currentLabel={`${cpuPct.toFixed(1)}%`}
        />
        <ChartCard
          title="Network"
          data={chartPoints.net}
          color="#F59E0B"
          yFormatter={(v) => `${v.toFixed(0)} KB/s`}
          tooltipFormatter={(v) => `${v.toFixed(1)} KB/s`}
          currentLabel={netKBs > 0
            ? `↓${stats.networkRxUsage?.toFixed(0)} ↑${stats.networkTxUsage?.toFixed(0)} KB/s`
            : undefined}
        />
      </div>
    </div>
  )
}
