import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (email && hash) {
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash },
      create: { email, passwordHash: hash, name: "Admin" },
    });
    console.log(`Seeded admin user: ${email}`);
  } else {
    console.warn(
      "ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set; skipping admin user seed."
    );
  }

  const existing = await prisma.project.findUnique({
    where: { slug: "forge-core01" },
  });

  if (!existing) {
    const project = await prisma.project.create({
      data: {
        name: "Forge Core01",
        slug: "forge-core01",
        description: "Internal control plane for agent-assisted development.",
        status: "dev_ready",
        repoUrl: "https://github.com/infiniteroles/forge-core",
      },
    });

    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        type: "project.created",
        message: `Project "${project.name}" created`,
      },
    });

    console.log("Seeded example project: Forge Core01");
  } else {
    console.log("Example project already exists; skipping.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
