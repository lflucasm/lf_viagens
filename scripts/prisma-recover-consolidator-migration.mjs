/**
 * Recupera P3009 quando `20260209183000_consolidator_sales` ficou registrada como
 * falha / incompleta (ex.: erro nas FKs). Só age se existir linha em
 * _prisma_migrations com finished_at NULL e rolled_back_at NULL.
 */
import { execSync } from "node:child_process";
import { Client } from "pg";

const MIGRATION = "20260209183000_consolidator_sales";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(
      "[prisma-recover-consolidator] DATABASE_URL ausente; nada a fazer."
    );
    return;
  }

  const client = new Client({ connectionString: url });
  let needResolve = false;

  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"
       WHERE "migration_name" = $1
       LIMIT 1`,
      [MIGRATION]
    );

    if (!rows.length) {
      console.log(
        `[prisma-recover-consolidator] Migração ${MIGRATION} não registrada; ok.`
      );
      return;
    }

    const row = rows[0];
    if (row.finished_at != null) {
      console.log(
        `[prisma-recover-consolidator] ${MIGRATION} já finalizada; ok.`
      );
      return;
    }

    if (row.rolled_back_at != null) {
      console.log(
        `[prisma-recover-consolidator] ${MIGRATION} já rolled back; ok.`
      );
      return;
    }

    console.log(
      `[prisma-recover-consolidator] ${MIGRATION} incompleta; limpando objetos órfãos…`
    );
    await client.query(`DROP TABLE IF EXISTS "consolidator_sales"`);
    await client.query(
      `DROP TYPE IF EXISTS "ConsolidatorSaleSettlementStatus"`
    );
    needResolve = true;
  } catch (e) {
    console.error("[prisma-recover-consolidator]", e);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }

  if (needResolve && !process.exitCode) {
    execSync(`npx prisma migrate resolve --rolled-back "${MIGRATION}"`, {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });
  }
}

main().catch((e) => {
  console.error("[prisma-recover-consolidator]", e);
  process.exit(1);
});
