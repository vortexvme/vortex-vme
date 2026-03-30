import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getServer, getServerHistory, listServers, enableMaintenanceMode, leaveMaintenanceMode } from '@/api/servers'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { StatusBadge } from '@/components/common/StatusDot'
import { formatBytes, formatPercent } from '@/utils/format'
import {
  ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle,
  Wrench, ChevronDown, Loader2, CheckCircle2, Monitor,
} from 'lucide-react'
import { clsx } from 'clsx'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'tasks', label: 'Tasks & Events' },
] as const

type TabId = (typeof TABS)[number]['id']

function statusIcon(status: string) {
  const s = status.toLowerCase()
  if (s === 'complete' || s === 'success') return <CheckCircle size={14} style={{ color: '#00B388' }} />
  if (s === 'failed' || s === 'error') return <XCircle size={14} style={{ color: '#EF4444' }} />
  if (s === 'warning') return <AlertCircle size={14} style={{ color: '#F59E0B' }} />
  if (s === 'running' || s === 'in-progress') return <RefreshCw size={14} className="animate-spin" style={{ color: '#60A5FA' }} />
  return <Clock size={14} style={{ color: '#566278' }} />
}

export function HostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const hostId = Number(id)
  const activeTab = (searchParams.get('tab') as TabId) ?? 'summary'
  const setTab = (tab: TabId) => setSearchParams({ tab }, { replace: true })

  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmMaint, setConfirmMaint] = useState<'enable' | 'disable' | null>(null)
  const [maintOp, setMaintOp] = useState<{ action: 'enable' | 'leave'; startedAt: number } | null>(null)
  const [maintJustDone, setMaintJustDone] = useState(false)

  const { data: server, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['server', hostId],
    queryFn: () => getServer(hostId),
    enabled: !!hostId,
    staleTime: maintOp ? 0 : 30_000,
    refetchInterval: maintOp ? 3_000 : false,
  })

  // VM-level servers in the same zone — needed for maintenance modal
  const { data: vmServersData } = useQuery({
    queryKey: ['vm-servers', server?.zone?.id],
    queryFn: () => listServers({ max: 200, zoneId: server!.zone!.id }),
    enabled: !!server?.zone?.id && confirmMaint === 'enable',
    staleTime: 60_000,
  })

  const maintenanceMutation = useMutation({
    mutationFn: ({ enable }: { enable: boolean }) =>
      enable ? enableMaintenanceMode(hostId) : leaveMaintenanceMode(hostId),
    onSuccess: (_data, { enable }) => {
      setConfirmMaint(null)
      setMaintOp({ action: enable ? 'enable' : 'leave', startedAt: Date.now() })
      queryClient.invalidateQueries({ queryKey: ['servers', 'hypervisors'] })
    },
  })

  // Detect maintenance completion
  useEffect(() => {
    if (!maintOp || !server) return
    const finallyInMaint = !!(server.maintenanceMode || server.status === 'maintenance')
    const transitioning = server.status === 'maintenancing'
    const fullyLeft = !finallyInMaint && !transitioning
    const isDone = maintOp.action === 'enable' ? finallyInMaint : fullyLeft
    const timedOut = Date.now() - maintOp.startedAt > 60_000
    if (isDone || timedOut) {
      setMaintOp(null)
      setMaintJustDone(true)
      setTimeout(() => setMaintJustDone(false), 2_500)
      queryClient.invalidateQueries({ queryKey: ['servers', 'hypervisors'] })
    }
  }, [server, maintOp, queryClient])

  const totalCount = server?.containers?.length ?? 0

  if (isLoading) return <PageLoader />

  if (!server) return (
    <div className="empty-state">
      <p>Host not found</p>
      <button className="btn btn-secondary" onClick={() => navigate('/hosts')}>Back to Hosts</button>
    </div>
  )

  const cpuPct = server.stats?.cpuUsage ?? 0
  const memUsed = server.stats?.usedMemory ?? server.usedMemory ?? 0
  const memMax = server.stats?.maxMemory ?? server.maxMemory ?? 0
  const memPct = memMax > 0 ? (memUsed / memMax) * 100 : 0
  const inMaintenance = !!(server.maintenanceMode || server.status === 'maintenance' || server.status === 'maintenancing')

  // VMs on this host (for maintenance modal)
  const vmsOnHost = (vmServersData?.servers ?? []).filter(s => s.parentServer?.id === hostId)
  const willMigrate = vmsOnHost.filter(s => s.placementStrategy !== 'pinned')
  const pinned = vmsOnHost.filter(s => s.placementStrategy === 'pinned')

  return (
    <div className="flex flex-col h-full" onClick={() => actionsOpen && setActionsOpen(false)}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid #1E2A45' }}
      >
        <button className="btn btn-ghost p-1" onClick={() => navigate('/hosts')}>
          <ArrowLeft size={15} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">{server.name}</h1>
          <StatusBadge status={server.status} />
          {(isFetching || maintOp) && <Loader2 size={12} className="animate-spin" style={{ color: '#566278' }} />}

          {/* Actions dropdown */}
          <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary py-1.5 px-3"
            onClick={() => setActionsOpen(o => !o)}
            disabled={!!maintOp}
          >
            Actions
            <ChevronDown size={13} className={clsx('transition-transform', actionsOpen && 'rotate-180')} />
          </button>
          {actionsOpen && (
            <div
              className="absolute right-0 mt-1 rounded-lg py-1 z-20"
              style={{ background: '#141C2E', border: '1px solid #1E2A45', minWidth: 200, top: '100%' }}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left"
                style={{ color: '#F59E0B' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1E2A45')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { setActionsOpen(false); setConfirmMaint(inMaintenance ? 'disable' : 'enable') }}
              >
                <Wrench size={13} />
                {inMaintenance ? 'Leave Maintenance Mode' : 'Enable Maintenance Mode'}
              </button>
            </div>
          )}
          </div>
        </div>

        <button className="btn btn-ghost py-1.5 px-2" onClick={() => refetch()}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Maintenance progress banner */}
      {maintOp && (
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(96,165,250,0.08)', borderBottom: '1px solid rgba(96,165,250,0.2)' }}>
          <Loader2 size={15} className="animate-spin shrink-0" style={{ color: '#60A5FA' }} />
          <p className="text-xs" style={{ color: '#60A5FA' }}>
            {maintOp.action === 'enable' ? 'Enabling maintenance mode…' : 'Leaving maintenance mode…'}
          </p>
        </div>
      )}
      {maintJustDone && !maintOp && (
        <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'rgba(0,179,136,0.08)', borderBottom: '1px solid rgba(0,179,136,0.2)' }}>
          <CheckCircle2 size={14} style={{ color: '#00B388' }} />
          <p className="text-xs font-medium" style={{ color: '#00B388' }}>Operation completed</p>
        </div>
      )}

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
        {activeTab === 'summary' && (
          <HostSummaryTab server={server} cpuPct={cpuPct} memUsed={memUsed} memMax={memMax} memPct={memPct} totalCount={totalCount} />
        )}
        {activeTab === 'tasks' && <HostTasksTab hostId={hostId} />}
      </div>

      {/* Maintenance confirm modal */}
      {confirmMaint && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !maintenanceMutation.isPending && setConfirmMaint(null)}
        >
          <div
            className="rounded-xl p-6 space-y-4"
            style={{ background: '#141C2E', border: '1px solid #1E2A45', width: 460 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <Wrench size={16} className="shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {confirmMaint === 'enable' ? 'Enable' : 'Leave'} Maintenance Mode on {server.name}?
                </h2>
                <p className="text-xs mt-1" style={{ color: '#8B9AB0' }}>
                  {confirmMaint === 'enable'
                    ? 'Virtual machines with auto or failover placement strategy will be live-migrated to other available hosts.'
                    : "This host's resources will become available to the cluster again."
                  }
                </p>
              </div>
            </div>

            {confirmMaint === 'enable' && (
              vmsOnHost.length === 0 ? (
                <p className="text-xs px-3 py-2 rounded" style={{ background: '#0D1117', color: '#566278' }}>
                  No virtual machines are currently on this host.
                </p>
              ) : (
                <div className="space-y-2">
                  {willMigrate.length > 0 && (
                    <div>
                      <p className="text-2xs font-medium mb-1" style={{ color: '#8B9AB0' }}>Will be migrated ({willMigrate.length}):</p>
                      <div className="space-y-1 max-h-32 overflow-auto">
                        {willMigrate.map(s => (
                          <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#0D1117' }}>
                            <Monitor size={11} style={{ color: '#00B388' }} />
                            <span className="text-xs text-white flex-1">{s.name}</span>
                            <span className="text-2xs px-1.5 py-0.5 rounded capitalize" style={{ background: 'rgba(86,98,120,0.2)', color: '#8B9AB0' }}>
                              {s.placementStrategy ?? 'auto'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pinned.length > 0 && (
                    <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      <p className="text-xs font-medium" style={{ color: '#EF4444' }}>
                        Cannot enable maintenance mode — {pinned.length} pinned VM{pinned.length !== 1 ? 's' : ''} must be moved first
                      </p>
                      <div className="space-y-1 max-h-24 overflow-auto">
                        {pinned.map(s => (
                          <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#0D1117' }}>
                            <Monitor size={11} style={{ color: '#566278' }} />
                            <span className="text-xs text-white flex-1">{s.name}</span>
                            <span className="text-2xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>pinned</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmMaint(null)}
                disabled={maintenanceMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}
                disabled={maintenanceMutation.isPending || (confirmMaint === 'enable' && pinned.length > 0)}
                onClick={() => maintenanceMutation.mutate({ enable: confirmMaint === 'enable' })}
              >
                {maintenanceMutation.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> {confirmMaint === 'enable' ? 'Enabling…' : 'Leaving…'}</>
                  : <><Wrench size={13} /> {confirmMaint === 'enable' ? 'Enable' : 'Leave'} Maintenance Mode</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HostSummaryTab({
  server,
  cpuPct,
  memUsed,
  memMax,
  memPct,
  totalCount,
}: {
  server: Awaited<ReturnType<typeof getServer>>
  cpuPct: number
  memUsed: number
  memMax: number
  memPct: number
  totalCount: number
}) {
  return (
    <div className="grid grid-cols-3 gap-4 max-w-5xl">
      {/* Resources */}
      <div className="card">
        <div className="card-title">Resources</div>
        <div className="space-y-4 mt-2">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs" style={{ color: '#8B9AB0' }}>CPU Usage</span>
              <span className="text-xs font-medium" style={{ color: cpuPct > 80 ? '#EF4444' : '#00B388' }}>
                {formatPercent(cpuPct)}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className={clsx('progress-fill', cpuPct > 80 ? 'red' : cpuPct > 60 ? 'yellow' : 'green')}
                style={{ width: `${Math.min(cpuPct, 100)}%` }}
              />
            </div>
            <div className="text-2xs mt-1" style={{ color: '#566278' }}>{server.maxCores} vCPU</div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs" style={{ color: '#8B9AB0' }}>Memory</span>
              <span className="text-xs font-medium" style={{ color: '#60A5FA' }}>
                {formatBytes(memUsed)} / {formatBytes(memMax)}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className={clsx('progress-fill', memPct > 80 ? 'red' : memPct > 60 ? 'yellow' : 'green')}
                style={{ width: `${Math.min(memPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="card">
        <div className="card-title">Properties</div>
        <dl className="space-y-2.5 mt-2">
          {([
            ['Hostname', server.hostname],
            ['IP Address', server.internalIp ?? server.externalIp],
            ['Cloud', server.zone?.name ?? server.cloud?.name],
            ['Type', server.computeServerType?.name],
            ['Platform', [server.platform, server.platformVersion].filter(Boolean).join(' ') || undefined],
            ['Operating System', server.serverOs?.name],
            ['Cores', server.maxCores ? `${server.maxCores} cores` : undefined],
            ['Agent Version', server.agentVersion],
            ['Created', server.dateCreated ? new Date(server.dateCreated).toLocaleDateString() : undefined],
          ] as [string, string | undefined][])
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-xs shrink-0" style={{ color: '#566278', width: 120 }}>{label}:</dt>
                <dd className="text-xs text-white">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      {/* Hardware */}
      {(server.hardwareName || server.hardwareVendor || server.cpuModel || server.iscsiIqn) && (
        <div className="card">
          <div className="card-title">Hardware</div>
          <dl className="space-y-2.5 mt-2">
            {([
              ['Hardware Name', server.hardwareName],
              ['Hardware Vendor', server.hardwareVendor],
              ['CPU Model', server.cpuModel],
              ['iSCSI Initiator', server.iscsiIqn],
            ] as [string, string | undefined][])
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-xs shrink-0" style={{ color: '#566278', width: 120 }}>{label}:</dt>
                  <dd className="text-xs text-white break-all">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {/* Virtual Machines */}
      <div className="card">
        <div className="card-title">Virtual Machines</div>
        <div className="flex gap-6 mt-3">
          <div>
            <div className="text-2xl font-bold" style={{ color: '#00B388' }}>{totalCount}</div>
            <div className="text-xs mt-0.5" style={{ color: '#566278' }}>Total VMs</div>
          </div>
        </div>
      </div>
    </div>
  )
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

function HostTasksTab({ hostId }: { hostId: number }) {
  const [max, setMax] = useState(50)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['server-history', hostId, max],
    queryFn: () => getServerHistory(hostId, { max }),
    staleTime: 0,
    refetchInterval: (query) => {
      const processes = query.state.data?.processes ?? []
      const hasRunning = processes.some((p) => p.status === 'running' || p.status === 'in-progress')
      return hasRunning ? 3_000 : 10_000
    },
    retry: 0,
  })

  if (isLoading) return <PageLoader />

  const processes = data?.processes ?? []
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
