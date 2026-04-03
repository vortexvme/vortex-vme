import { apiClient } from './client'
import { VirtualImagesResponse } from '@/types/morpheus'

export async function listVirtualImages(params: {
  imageType?: string
  filterType?: string
  phrase?: string
  max?: number
} = {}): Promise<VirtualImagesResponse> {
  const resp = await apiClient.get<VirtualImagesResponse>('/api/virtual-images', {
    params: { max: 100, filterType: 'All', ...params },
  })
  return resp.data
}
