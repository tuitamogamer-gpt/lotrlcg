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
import { LayoutGroup, MotionConfig } from "motion/react";
import "./styles.css";
import "./ui/experience.css";
import "./ui/redbook.css";
import "./ui/resolution.css";
import "./ui/tabletop.css";
import "./ui/decisions.css";
import "./ui/motion.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="table">
        <App />
      </LayoutGroup>
    </MotionConfig>
  </React.StrictMode>,
);
