import { runControlPlaneMigrateDeploy } from './_utils';

async function main() {
  await runControlPlaneMigrateDeploy();
  console.log('Control plane migrations aplicadas com sucesso.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
