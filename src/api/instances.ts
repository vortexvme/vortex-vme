import { apiClient } from './client'
import {
  Instance,
  InstancesResponse,
  SnapshotsResponse,
  ProcessesResponse,
} from '@/types/morpheus'

interface ListInstancesParams {
  max?: number
  offset?: number
  phrase?: string
  status?: string
  zoneId?: number
  serverId?: number
  groupId?: number
}

export async function listInstances(
  params: ListInstancesParams = {},
): Promise<InstancesResponse> {
  const resp = await apiClient.get<InstancesResponse>('/api/instances', {
    params: { max: 100, ...params },
  })
  return resp.data
}

export async function getInstance(id: number): Promise<Instance> {
  const resp = await apiClient.get<{ instance: Instance }>(
    `/api/instances/${id}`,
  )
  return resp.data.instance
}

export async function listProcessesByInstance(
  id: number,
  params: { max?: number } = {},
): Promise<ProcessesResponse> {
  const resp = await apiClient.get<ProcessesResponse>('/api/processes', {
    params: { instanceId: id, max: 5, ...params },
  })
  return resp.data
}

export async function getInstanceSnapshots(id: number): Promise<SnapshotsResponse> {
  const resp = await apiClient.get<SnapshotsResponse>(
    `/api/instances/${id}/snapshots`,
  )
  return resp.data
}

// ─── Power Actions ────────────────────────────────────────────────────────────

export async function startInstance(id: number) {
  const resp = await apiClient.put(`/api/instances/${id}/start`)
  return resp.data
}

export async function stopInstance(id: number) {
  const resp = await apiClient.put(`/api/instances/${id}/stop`)
  return resp.data
}

export async function restartInstance(id: number) {
  const resp = await apiClient.put(`/api/instances/${id}/restart`)
  return resp.data
}

export async function suspendInstance(id: number) {
  const resp = await apiClient.put(`/api/instances/${id}/suspend`)
  return resp.data
}

export async function ejectInstance(id: number) {
  const resp = await apiClient.put(`/api/instances/${id}/eject`)
  return resp.data
}


// ─── Snapshot Actions ─────────────────────────────────────────────────────────

export async function createSnapshot(
  id: number,
  payload: { name: string; description?: string },
) {
  const resp = await apiClient.put(`/api/instances/${id}/snapshot`, {
    snapshot: payload,
  })
  return resp.data
}

export async function deleteSnapshot(_instanceId: number, snapshotId: number) {
  const resp = await apiClient.delete(`/api/snapshots/${snapshotId}`)
  return resp.data
}

export async function revertSnapshot(instanceId: number, snapshotId: number) {
  const resp = await apiClient.put(
    `/api/instances/${instanceId}/revert-snapshot/${snapshotId}`,
  )
  return resp.data
}

// ─── Create ───────────────────────────────────────────────────────────────────

interface CreateInstancePayload {
  instance: {
    name: string
    description?: string
    zone: { id: number }
    instanceType: { code: string }
    plan: { id: number }
    layout: { id: number }
    group?: { id: number }
    hostName?: string
  }
  config?: Record<string, unknown>
  networkInterfaces?: Array<{ network: { id: number } }>
  volumes?: Array<{ name: string; rootVolume: boolean; size: number }>
}

export async function createInstance(payload: CreateInstancePayload) {
  const resp = await apiClient.post('/api/instances', payload)
  return resp.data
}

export async function deleteInstance(id: number, force = false) {
  const resp = await apiClient.delete(`/api/instances/${id}`, {
    params: { force },
  })
  return resp.data
}

