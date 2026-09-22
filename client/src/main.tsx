import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { runTemporaryClientReset } from "./lib/clear-client-cache";

runTemporaryClientReset();

createRoot(document.getElementById("root")!).render(<App />);
