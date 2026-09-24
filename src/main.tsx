import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/im-fell-english-sc/latin-400.css";
import "@fontsource/crimson-pro/latin-400.css";
import "@fontsource/crimson-pro/latin-400-italic.css";
import "@fontsource/crimson-pro/latin-500.css";
import "@fontsource/crimson-pro/latin-600.css";
import "@fontsource/crimson-pro/latin-700.css";
import "@fontsource/crimson-pro/latin-ext-400.css";
import "@fontsource/crimson-pro/latin-ext-400-italic.css";
import "@fontsource/crimson-pro/latin-ext-500.css";
import "@fontsource/crimson-pro/latin-ext-600.css";
import "@fontsource/crimson-pro/latin-ext-700.css";
import App from "./App";
import { LayoutGroup, MotionConfig } from "motion/react";
import "./styles.css";
import "./ui/experience.css";
import "./ui/redbook.css";
import "./ui/resolution.css";
import "./ui/tabletop.css";
import "./ui/decisions.css";
import "./ui/motion.css";
import "./ui/premium.css";
import "./ui/core-set.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="table">
        <App />
      </LayoutGroup>
    </MotionConfig>
  </React.StrictMode>,
);
