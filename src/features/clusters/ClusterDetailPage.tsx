import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCluster } from '@/api/clouds'
import { listInstances } from '@/api/instances'
import { listServers, getZoneHistory } from '@/api/servers'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { StatusBadge } from '@/components/common/StatusDot'
import { ArrowLeft, Layers, Server, Monitor, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { formatBytes, formatPercent } from '@/utils/format'
import { clsx } from 'clsx'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'vms', label: 'Virtual Machines' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'tasks', label: 'Tasks & Events' },
] as const

type TabId = (typeof TABS)[number]['id']

export function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const clusterId = Number(id)
  const activeTab = (searchParams.get('tab') as TabId) ?? 'summary'
  const setTab = (tab: TabId) => setSearchParams({ tab }, { replace: true })

  const { data: cluster, isLoading } = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => getCluster(clusterId),
    enabled: !!clusterId,
    staleTime: 30_000,
    retry: 0,
  })

  if (isLoading) return <PageLoader />

  if (!cluster) return (
    <div className="empty-state">
      <p>Cluster not found</p>
      <button className="btn btn-secondary" onClick={() => navigate('/clusters')}>Back to Clusters</button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid #1E2A45' }}
      >
        <button className="btn btn-ghost p-1" onClick={() => navigate('/clusters')}>
          <ArrowLeft size={15} />
        </button>
        <Layers size={16} style={{ color: '#00B388' }} />
        <h1 className="text-base font-semibold text-white flex-1 truncate">{cluster.name}</h1>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{
            background: cluster.status === 'ok' || cluster.status === 'running' ? 'rgba(0,179,136,0.15)' : 'rgba(245,158,11,0.15)',
            color: cluster.status === 'ok' || cluster.status === 'running' ? '#00B388' : '#F59E0B',
          }}
        >
          {cluster.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={clsx('tab-item', activeTab === tab.id && 'active')}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'summary' && <ClusterSummaryTab cluster={cluster} />}
        {activeTab === 'vms' && <ClusterVMsTab clusterId={clusterId} clusterZoneId={cluster.zone?.id} />}
        {activeTab === 'hosts' && <ClusterHostsTab clusterServerIds={(cluster.servers ?? []).map((s) => s.id)} />}
        {activeTab === 'tasks' && cluster.zone?.id && (
          <ClusterTasksTab
            zoneId={cluster.zone.id}
            clusterServerIds={(cluster.servers ?? []).map((s) => s.id)}
          />
        )}
      </div>
    </div>
  )
}

function ClusterSummaryTab({ cluster }: { cluster: Awaited<ReturnType<typeof getCluster>> }) {
  const cpuPct = cluster.workerStats?.cpuUsage ?? 0
  const memUsed = cluster.workerStats?.usedMemory ?? 0
  const memMax = cluster.workerStats?.maxMemory ?? 0
  const memPct = memMax > 0 ? (memUsed / memMax) * 100 : 0

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <div className="card-title">CPU Usage</div>
          <div className="flex items-center gap-3 mt-2">
            <div className="progress-bar flex-1">
              <div
                className={clsx('progress-fill', cpuPct > 80 ? 'red' : cpuPct > 60 ? 'yellow' : 'green')}
                style={{ width: `${Math.min(cpuPct, 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold" style={{ color: '#00B388', minWidth: 40 }}>
              {formatPercent(cpuPct)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Memory</div>
          <div className="flex items-center gap-3 mt-2">
            <div className="progress-bar flex-1">
              <div
                className={clsx('progress-fill', memPct > 80 ? 'red' : memPct > 60 ? 'yellow' : 'green')}
                style={{ width: `${Math.min(memPct, 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold" style={{ color: '#60A5FA', minWidth: 40 }}>
              {formatPercent(memPct)}
            </span>
          </div>
          <div className="text-2xs mt-1" style={{ color: '#566278' }}>
            {formatBytes(memUsed)} / {formatBytes(memMax)}
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="card">
        <div className="card-title">Properties</div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-2">
          {([
            ['Cloud', cluster.zone?.name],
            ['Type', cluster.type?.name],
            ['Layout', cluster.layout?.name],
            ['Workers', String(cluster.workersCount ?? cluster.servers?.length ?? 0)],
            ['Created', cluster.dateCreated ? new Date(cluster.dateCreated).toLocaleString() : undefined],
          ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-xs shrink-0" style={{ color: '#566278', minWidth: 80 }}>{label}:</dt>
              <dd className="text-xs text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function ClusterHostsTab({ clusterServerIds }: { clusterServerIds: number[] }) {
  const navigate = useNavigate()
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['servers', 'hypervisors'],
    queryFn: () => listServers({ max: 100, vmHypervisor: true }),
    staleTime: 30_000,
  })

  const hosts = (data?.servers ?? [])
    .filter((s) => clusterServerIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (isLoading) return <PageLoader />

  return (
    <div className="max-w-5xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Hosts</h3>
          <p className="text-xs mt-0.5" style={{ color: '#566278' }}>
            {hosts.length} host{hosts.length !== 1 ? 's' : ''} in cluster
          </p>
        </div>
        <button className="btn btn-ghost py-1 px-2" onClick={() => refetch()}>
          <RefreshCw size={13} className={clsx(isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {hosts.length === 0 ? (
        <div className="empty-state">
          <Server size={32} style={{ color: '#566278' }} />
          <p className="text-sm" style={{ color: '#8B9AB0' }}>No hosts found</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1E2A45' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>CPU Usage</th>
                <th>Memory</th>
                <th>VMs</th>
                <th>OS</th>
                <th>Agent Version</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((server) => {
                const cpuPct = server.stats?.cpuUsage ?? 0
                const memUsed = server.stats?.usedMemory ?? server.usedMemory ?? 0
                const memMax = server.stats?.maxMemory ?? server.maxMemory ?? 0
                const memPct = memMax > 0 ? (memUsed / memMax) * 100 : 0

                return (
                  <tr
                    key={server.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/hosts/${server.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <Server size={12} style={{ color: '#60A5FA' }} />
                        <span className="font-medium" style={{ color: '#60A5FA' }}>{server.name}</span>
                      </div>
                      {server.hostname && server.hostname !== server.name && (
                        <div className="text-2xs font-mono" style={{ color: '#566278' }}>{server.hostname}</div>
                      )}
                    </td>
                    <td><StatusBadge status={server.status} /></td>
                    <td>
                      <span className="font-mono text-xs" style={{ color: '#8B9AB0' }}>
                        {server.internalIp ?? server.externalIp ?? '—'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-16">
                          <div
                            className={clsx('progress-fill', cpuPct > 80 ? 'red' : cpuPct > 60 ? 'yellow' : 'green')}
                            style={{ width: `${Math.min(cpuPct, 100)}%` }}
                          />
                        </div>
                        <span className="text-2xs" style={{ color: '#8B9AB0' }}>{formatPercent(cpuPct)}</span>
                      </div>
                    </td>
                    <td>
                      {memMax > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="progress-bar w-16">
                            <div
                              className={clsx('progress-fill', memPct > 80 ? 'red' : memPct > 60 ? 'yellow' : 'green')}
                              style={{ width: `${Math.min(memPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-2xs" style={{ color: '#8B9AB0' }}>
                            {formatBytes(memUsed)} / {formatBytes(memMax)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#566278' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1E2A45', color: '#8B9AB0' }}>
                        {server.containers?.length ?? 0}
                      </span>
                    </td>
                    <td style={{ color: '#566278' }}>{server.osMorpheusType ?? server.osType ?? '—'}</td>
                    <td style={{ color: '#566278' }}>{server.agentVersion ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ClusterVMsTab({ clusterZoneId }: { clusterId: number; clusterZoneId?: number }) {
  const navigate = useNavigate()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['instances'],
    queryFn: () => listInstances({ max: 100 }),
    staleTime: 30_000,
  })

  const vms = (data?.instances ?? []).filter(
    (inst) => !clusterZoneId || inst.cloud?.id === clusterZoneId,
  ).sort((a, b) => a.name.localeCompare(b.name))

  if (isLoading) return <PageLoader />

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Virtual Machines</h3>
          <p className="text-xs mt-0.5" style={{ color: '#566278' }}>
            {vms.length} VM{vms.length !== 1 ? 's' : ''} in cluster
          </p>
        </div>
        <button className="btn btn-ghost py-1 px-2" onClick={() => refetch()}>
          <RefreshCw size={13} className={clsx(isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {vms.length === 0 ? (
        <div className="empty-state">
          <Monitor size={32} style={{ color: '#566278' }} />
          <p className="text-sm" style={{ color: '#8B9AB0' }}>No virtual machines found</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1E2A45' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>Plan</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {vms.map((inst) => {
                const ip = inst.connectionInfo?.[0]?.ip ?? inst.containers?.[0]?.ip ?? inst.containers?.[0]?.internalIp
                return (
                  <tr
                    key={inst.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/vms/${inst.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <Monitor size={12} style={{ color: '#00B388' }} />
                        <span className="font-medium" style={{ color: '#60A5FA' }}>{inst.name}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={inst.status} /></td>
                    <td>
                      <span className="font-mono text-xs" style={{ color: '#8B9AB0' }}>
                        {ip ?? '—'}
                      </span>
                    </td>
                    <td style={{ color: '#8B9AB0' }}>{inst.plan?.name ?? '—'}</td>
                    <td style={{ color: '#566278' }}>
                      {inst.dateCreated ? new Date(inst.dateCreated).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function statusIcon(status: string) {
  const s = status.toLowerCase()
  if (s === 'complete' || s === 'success') return <CheckCircle size={14} style={{ color: '#00B388' }} />
  if (s === 'failed' || s === 'error') return <XCircle size={14} style={{ color: '#EF4444' }} />
  if (s === 'warning') return <AlertCircle size={14} style={{ color: '#F59E0B' }} />
  if (s === 'running' || s === 'in-progress') return <RefreshCw size={14} className="animate-spin" style={{ color: '#60A5FA' }} />
  return <Clock size={14} style={{ color: '#566278' }} />
}

function statusColor(status: string) {
  const s = status.toLowerCase()
  if (s === 'complete' || s === 'success') return '#00B388'
  if (s === 'failed' || s === 'error') return '#EF4444'
  if (s === 'warning') return '#F59E0B'
  if (s === 'running' || s === 'in-progress') return '#60A5FA'
  return '#566278'
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function ClusterTasksTab({ zoneId, clusterServerIds }: { zoneId: number; clusterServerIds: number[] }) {
  const [max, setMax] = useState(50)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['zone-history', zoneId, max],
    queryFn: () => getZoneHistory(zoneId, { max }),
    staleTime: 0,
    refetchInterval: (query) => {
      const processes = query.state.data?.processes ?? []
      const hasRunning = processes.some((p) => p.status === 'running' || p.status === 'in-progress')
      return hasRunning ? 3_000 : 10_000
    },
    retry: 0,
  })

  if (isLoading) return <PageLoader />

  // Only show server-level tasks (exclude VM/instance tasks)
  const serverIdSet = new Set(clusterServerIds)
  const processes = (data?.processes ?? []).filter(
    (p) => !p.instanceId && (!p.serverId || serverIdSet.has(p.serverId)),
  )
  const total = data?.meta?.total ?? processes.length

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Tasks & Events</h3>
          <p className="text-xs mt-0.5" style={{ color: '#566278' }}>
            Showing {processes.length} of {total} total
          </p>
        </div>
        <button className="btn btn-ghost py-1 px-2" onClick={() => refetch()}>
          <RefreshCw size={13} className={clsx(isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {processes.length === 0 ? (
        <div className="empty-state">
          <Clock size={32} style={{ color: '#566278' }} />
          <p className="text-sm" style={{ color: '#8B9AB0' }}>No task history</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {processes.map((proc) => {
              const startDate = proc.startDate ?? proc.dateCreated
              const durationMs =
                proc.duration ??
                (proc.startDate && proc.endDate
                  ? new Date(proc.endDate).getTime() - new Date(proc.startDate).getTime()
                  : null)

              return (
                <div
                  key={proc.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: '#0D1117', border: '1px solid #1E2A45' }}
                >
                  <div className="mt-0.5 shrink-0">{statusIcon(proc.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-white">
                        {[proc.displayName, proc.processType?.name].filter(Boolean).join(' – ') || proc.description || 'Unknown'}
                      </span>
                      <span
                        className="text-2xs px-1.5 py-0.5 rounded"
                        style={{
                          background: `${statusColor(proc.status)}22`,
                          color: statusColor(proc.status),
                        }}
                      >
                        {proc.status}
                        {proc.percent != null && proc.percent < 100 && ` (${proc.percent}%)`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {startDate && (
                        <span className="text-2xs" style={{ color: '#566278' }}>
                          Start: {new Date(startDate).toLocaleString()}
                        </span>
                      )}
                      <span className="text-2xs" style={{ color: '#566278' }}>
                        Duration: {formatDuration(durationMs)}
                      </span>
                      {(proc.createdBy?.username ?? proc.createdBy?.displayName) && (
                        <span className="text-2xs" style={{ color: '#566278' }}>
                          User: {proc.createdBy?.displayName ?? proc.createdBy?.username}
                        </span>
                      )}
                    </div>
                    {proc.reason && (
                      <div className="text-2xs mt-0.5 truncate" style={{ color: '#3A4560' }}>{proc.reason}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {processes.length < total && (
            <button
              className="btn btn-secondary w-full py-2"
              onClick={() => setMax((m) => m + 50)}
              disabled={isFetching}
            >
              {isFetching ? 'Loading…' : `Load more (${total - processes.length} remaining)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
