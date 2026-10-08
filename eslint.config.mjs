import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // A data local (hoje()) só existe no navegador — o servidor roda em UTC —, então ela é
      // preenchida num effect depois da hidratação. É intencional, não cascata de renders.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "Exemplo/**"]),
]);
