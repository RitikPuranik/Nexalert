import { NextRequest } from 'next/server'
import { POST_CHAT, GET_CHAT } from '@/modules/incidents/chat'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return POST_CHAT(req, id)
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  return GET_CHAT(req, id)
}
