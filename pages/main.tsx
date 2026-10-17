import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LureGame } from "@/components/lure-game";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LureGame />
    </StrictMode>,
  );
}
