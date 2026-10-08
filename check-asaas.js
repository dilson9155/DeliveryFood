// Valida a chave Asaas (sandbox) direto na API
const fs = require("fs");

function getFrom(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, "utf8").match(new RegExp("^" + key + '\\s*=\\s*"?([^"\\r\\n]+)"?', "m"));
  return m ? m[1].trim() : null;
}

const KEY = getFrom(".env", "ASAAS_API_KEY");
const ENV = getFrom(".env", "ASAAS_ENV") || "sandbox";
const BASE = ENV === "production" ? "https://www.asaas.com/api/v3" : "https://sandbox.asaas.com/api/v3";

(async () => {
  if (!KEY) {
    console.log("ASAAS_API_KEY ausente no .env");
    return;
  }
  console.log("Ambiente: " + ENV);
  console.log("Base    : " + BASE);
  console.log("Chave   : " + KEY.slice(0, 20) + "...");

  try {
    const res = await fetch(BASE + "/customers?limit=1", {
      headers: { access_token: KEY, "Content-Type": "application/json" },
    });
    const body = await res.text();
    console.log("\nGET /customers -> HTTP " + res.status);
    if (res.ok) {
      console.log("CHAVE ASAAS VALIDA ✅");
      const j = JSON.parse(body);
      console.log("clientes encontrados: " + (j.totalCount ?? "?"));
    } else {
      console.log("CHAVE INVALIDA ❌");
      console.log("resposta: " + body.slice(0, 400));
    }
  } catch (e) {
    console.log("ERRO DE REDE: " + e.message);
  }
})();
