import client from './client'
import type { Department } from '../types'

export async function getDepartments(): Promise<Department[]> {
  const { data } = await client.get<Department[]>('/departments')
  return data
}

export async function getDepartmentOfficers(deptId: string) {
  const { data } = await client.get(`/departments/${deptId}/officers`)
  return data
}
