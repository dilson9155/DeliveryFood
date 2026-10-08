// Cria usuário MOTOBOY no banco real
const { PrismaClient, EmployeeRole, UserType } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");

function getFrom(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, "utf8").match(new RegExp("^" + key + '\\s*=\\s*"?([^"\\r\\n]+)"?', "m"));
  return m ? m[1].trim() : null;
}

const LOGIN = process.argv[2] || "motoboy";
const SENHA = process.argv[3] || "motoboy123";
const NOME = process.argv[4] || "Motoboy";

(async () => {
  const url = getFrom(".env", "DATABASE_URL");
  const p = new PrismaClient({ datasourceUrl: url });

  const existente = await p.user.findFirst({ where: { login: LOGIN.toLowerCase() } });
  if (existente) {
    console.log(`Ja existe motoboy com login '${LOGIN}' (id ${existente.id}, role=${existente.role})`);
    await p.$disconnect();
    return;
  }

  const hash = await bcrypt.hash(SENHA, 10);
  const created = await p.user.create({
    data: {
      userType: UserType.EMPLOYEE,
      name: NOME,
      login: LOGIN.toLowerCase(),
      password: hash,
      role: EmployeeRole.MOTOBOY,
      active: true,
    },
  });
  console.log("MOTOBOY CRIADO:");
  console.log("  id      : " + created.id);
  console.log("  nome    : " + created.name);
  console.log("  login   : " + created.login);
  console.log("  role    : " + created.role);
  console.log("  userType: " + created.userType);

  const total = await p.user.count({ where: { role: "MOTOBOY" } });
  console.log("Total de motoboys agora: " + total);
  await p.$disconnect();
})();
