import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/cinzel/latin-400.css";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import App from "./App";
import "./styles.css";
import "./ui/experience.css";
import "./ui/redbook.css";
import "./ui/resolution.css";
import "./ui/tabletop.css";
import "./ui/decisions.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
