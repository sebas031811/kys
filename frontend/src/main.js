import { applyTheme } from "./theme.js";
import { initLoading } from "./loading.js";
import { startApp } from "./router.js";

const cachedTheme = localStorage.getItem("kys_theme");
applyTheme(cachedTheme || "dark");

initLoading();
startApp();
