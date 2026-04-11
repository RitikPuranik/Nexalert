import { NextRequest } from 'next/server'
import { GET as getTasks, PATCH as updateTask } from '@/modules/incidents/api/tasks'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; taskId?: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  return getTasks(req, id)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('task_id') ?? ''
  return updateTask(req, id, taskId)
}
