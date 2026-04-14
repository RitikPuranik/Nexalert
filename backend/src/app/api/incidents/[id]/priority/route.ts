import { NextRequest } from 'next/server'
import { GET_PRIORITY } from '@/modules/incidents/priority'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  return GET_PRIORITY(req, id)
}
