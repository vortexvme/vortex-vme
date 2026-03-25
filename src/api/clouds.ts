import { apiClient } from './client'
import {
  ZonesResponse,
  Zone,
  Cluster,
  ClustersResponse,
  ServerGroupsResponse,
  NetworksResponse,
  StorageVolumesResponse,
  DataStore,
  DataStoresResponse,
} from '@/types/morpheus'

export async function listZones(params: { max?: number } = {}): Promise<ZonesResponse> {
  const resp = await apiClient.get<ZonesResponse>('/api/zones', {
    params: { max: 100, ...params },
  })
  return resp.data
}

export async function getZone(id: number): Promise<Zone> {
  const resp = await apiClient.get<{ zone: Zone }>(`/api/zones/${id}`)
  return resp.data.zone
}

export async function listClusters(
  params: { max?: number } = {},
): Promise<ClustersResponse> {
  const resp = await apiClient.get<ClustersResponse>('/api/clusters', {
    params: { max: 100, ...params },
  })
  return resp.data
}

export async function getCluster(id: number): Promise<Cluster> {
  const resp = await apiClient.get<{ cluster: Cluster }>(`/api/clusters/${id}`)
  return resp.data.cluster
}

export async function listServerGroups(
  params: { max?: number } = {},
): Promise<ServerGroupsResponse> {
  const resp = await apiClient.get<ServerGroupsResponse>('/api/server-groups', {
    params: { max: 100, ...params },
  })
  return resp.data
}

export async function listNetworks(
  params: { max?: number; zoneId?: number } = {},
): Promise<NetworksResponse> {
  const resp = await apiClient.get<NetworksResponse>('/api/networks', {
    params: { max: 100, ...params },
  })
  return resp.data
}

export async function listStorageVolumes(
  params: { max?: number } = {},
): Promise<StorageVolumesResponse> {
  const resp = await apiClient.get<StorageVolumesResponse>(
    '/api/storage-volumes',
    { params: { max: 100, ...params } },
  )
  return resp.data
}

export async function listServicePlans(zoneId?: number) {
  const resp = await apiClient.get('/api/service-plans', {
    params: { max: 100, ...(zoneId ? { zoneId } : {}) },
  })
  return resp.data
}

export async function listLayouts(instanceTypeCode?: string) {
  const resp = await apiClient.get('/api/library/layouts', {
    params: {
      max: 100,
      ...(instanceTypeCode ? { instanceTypeCode } : {}),
    },
  })
  return resp.data
}

export async function listDataStores(zoneId: number): Promise<DataStoresResponse> {
  const resp = await apiClient.get<DataStoresResponse>(`/api/zones/${zoneId}/data-stores`)
  return resp.data
}

export async function listAllDataStores(): Promise<DataStore[]> {
  const zonesResp = await apiClient.get<ZonesResponse>('/api/zones', { params: { max: 100 } })
  const zones = zonesResp.data.zones
  const results = await Promise.all(
    zones.map((zone) =>
      apiClient
        .get<DataStoresResponse>(`/api/zones/${zone.id}/data-stores`)
        .then((r) => (r.data.dataStores ?? []).map((ds) => ({ ...ds, zone: { id: zone.id, name: zone.name } })))
        .catch(() => [] as DataStore[]),
    ),
  )
  return results.flat()
}

export async function listInstanceTypes() {
  const resp = await apiClient.get('/api/library/instance-types', {
    params: { max: 50 },
  })
  return resp.data
}
