import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { ChatApp } from "@/components/app/ChatApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tokyo Manji — Calls, tela e chat" },
      { name: "description", content: "Entre com um nickname, participe de calls, transmita sua tela e converse com cargos personalizados." },
      { property: "og:title", content: "Tokyo Manji — Calls, tela e chat" },
      { property: "og:description", content: "Calls com transmissão de tela, chat e cargos personalizados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-rail" />}>
      <ChatApp />
    </ClientOnly>
  ),
});
