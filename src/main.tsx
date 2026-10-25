import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { waitForFonts } from "@/shared/lib/fonts";

/**
 * Mount only once the typefaces are ready: the sequence bakes its titles into
 * canvas textures, so a card drawn before `Cinzel` arrives keeps Georgia forever
 * (ADDENDUM-030). Self-hosted faces are inlined in the bundle, so this is a tick,
 * not a network wait.
 */
void waitForFonts().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
