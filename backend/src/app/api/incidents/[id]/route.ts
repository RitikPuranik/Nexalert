import { NextRequest } from 'next/server'
import { GET as getIncident, PATCH as patchIncident } from '@/modules/incidents/api/detail'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  return getIncident(req, id)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  return patchIncident(req, id)
}
