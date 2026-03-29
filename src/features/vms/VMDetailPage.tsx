import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Terminal,
  Camera,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { getInstance, startInstance, stopInstance, restartInstance } from '@/api/instances'
import { consoleUrl } from '@/utils/vmeManagerUrl'
import { getServer } from '@/api/servers'
import { StatusBadge } from '@/components/common/StatusDot'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { SummaryTab } from './tabs/SummaryTab'
import { SnapshotsTab } from './tabs/SnapshotsTab'
import { TasksTab } from './tabs/TasksTab'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'tasks', label: 'Tasks & Events' },
] as const

type TabId = (typeof TABS)[number]['id']

export function VMDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabId) ?? 'summary'

  const instanceId = Number(id)

  const { data: instance, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['instance', instanceId],
    queryFn: () => getInstance(instanceId),
    staleTime: 15_000,
    enabled: !!instanceId,
  })

  // Fetch the VM's own server record — has parentServer (= hypervisor) and interfaces (= networks)
  const vmServerId = instance?.servers?.[0]
  const { data: vmServer } = useQuery({
    queryKey: ['server', vmServerId],
    queryFn: () => getServer(vmServerId!),
    enabled: !!vmServerId,
    staleTime: 30_000,
    retry: 0,
  })

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      const fns: Record<string, (id: number) => Promise<unknown>> = {
        start: startInstance,
        stop: stopInstance,
        restart: restartInstance,
      }
      return fns[action](instanceId)
    },
    onSuccess: (_data, action) => {
      const labels: Record<string, string> = {
        start: 'Power On',
        stop: 'Power Off',
        restart: 'Restart',
      }
      toast.success(`${labels[action]} initiated`)
      queryClient.invalidateQueries({ queryKey: ['instance', instanceId] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const setTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true })
  }

  if (isLoading) return <PageLoader />
  if (!instance) {
    return (
      <div className="empty-state">
        <p>VM not found</p>
        <button className="btn btn-secondary" onClick={() => navigate('/vms')}>
          Back to VMs
        </button>
      </div>
    )
  }

  const isRunning = instance.status === 'running'
  const isStopped = instance.status === 'stopped'
  const isMutating = mutation.isPending

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + Title */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid #1E2A45' }}
      >
        <button
          className="btn btn-ghost p-1"
          onClick={() => navigate('/vms')}
          title="Back to VMs"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">
            {instance.name}
          </h1>
          <StatusBadge status={instance.status} />
          {isFetching && (
            <RefreshCw size={12} className="animate-spin" style={{ color: '#566278' }} />
          )}

          {/* vCenter-style icon toolbar */}
          <div
            className="flex items-center"
            style={{
              border: '1px solid #1E2A45',
              borderRadius: 6,
              overflow: 'hidden',
              marginLeft: 8,
            }}
          >
            {[
              {
                icon: <Play size={13} style={{ color: isRunning || isMutating ? '#3A4560' : '#00B388' }} />,
                title: 'Power On',
                disabled: isRunning || isMutating,
                onClick: () => mutation.mutate('start'),
              },
              {
                icon: <Square size={13} style={{ color: isStopped || isMutating ? '#3A4560' : '#8B9AB0' }} />,
                title: 'Power Off',
                disabled: isStopped || isMutating,
                onClick: () => mutation.mutate('stop'),
              },
              {
                icon: <RotateCcw size={13} style={{ color: isStopped || isMutating ? '#3A4560' : '#8B9AB0' }} />,
                title: 'Restart',
                disabled: isStopped || isMutating,
                onClick: () => mutation.mutate('restart'),
              },
              null, // divider
              {
                icon: <Camera size={13} style={{ color: '#8B9AB0' }} />,
                title: 'Take Snapshot',
                disabled: false,
                onClick: () => setTab('snapshots'),
              },
              {
                icon: (
                  <span className="flex items-center gap-0.5">
                    <Terminal size={13} style={{ color: vmServer ? '#8B9AB0' : '#3A4560' }} />
                    <ExternalLink size={9} style={{ color: vmServer ? '#566278' : '#3A4560' }} />
                  </span>
                ),
                title: 'Open Console',
                disabled: !vmServer,
                onClick: () => vmServer && window.open(consoleUrl(vmServer.id), '_blank', 'width=1024,height=768,noopener'),
              },
            ].map((btn, i) =>
              btn === null ? (
                <div key={i} style={{ width: 1, alignSelf: 'stretch', background: '#1E2A45' }} />
              ) : (
                <button
                  key={i}
                  title={btn.title}
                  disabled={btn.disabled}
                  onClick={btn.onClick}
                  style={{
                    padding: '5px 8px',
                    background: 'transparent',
                    cursor: btn.disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!btn.disabled) (e.currentTarget as HTMLButtonElement).style.background = '#1E2A45'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                >
                  {btn.icon}
                </button>
              )
            )}
          </div>
        </div>

        <button
          className="btn btn-ghost py-1.5 px-2"
          onClick={() => refetch()}
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
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
        {activeTab === 'summary' && <SummaryTab instance={instance} vmServer={vmServer} />}
        {activeTab === 'snapshots' && <SnapshotsTab instanceId={instanceId} />}
        {activeTab === 'tasks' && vmServerId && <TasksTab serverId={vmServerId} />}
      </div>
    </div>
  )
}
