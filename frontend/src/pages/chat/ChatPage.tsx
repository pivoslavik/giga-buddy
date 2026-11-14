import { getRouteApi } from "@tanstack/react-router"
import { ChatConversation } from "./ChatConversation"
import { chatTransport } from "./chatApi"

const authenticatedRoute = getRouteApi("/authenticated")

export function ChatPage() {
  const { user } = authenticatedRoute.useRouteContext()
  return (
    <ChatConversation
      key={user.id}
      userId={user.id}
      displayName={user.display_name}
      transport={chatTransport}
    />
  )
}
