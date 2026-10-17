import { createFileRoute } from "@tanstack/react-router";
import { LureGame } from "@/components/lure-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LureGame />;
}
